import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Download, ExternalLink, ListPlus, Mail, Phone, ShieldAlert, ShieldCheck, Tag as TagIcon, ListTodo, Undo2 } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, Panel, useToast } from '../../../components/ui'
import { addDays, fmtDate, iso, money, planById, TODAY, useBilling } from '../../../data/billing'
import type { BillingState, Promo } from '../../../data/billing'
import { KYC_KEYS, kycComplete } from '../../../data/promoLedger'
import type { Kyc, Redemption } from '../../../data/promoLedger'
import { PRIORITIES } from '../../../tasks/store'
import type { Priority } from '../../../tasks/store'
import { addToList, followUpTask, logExport, removeTag, reverseRedemption, tagCompanies } from './actions'
import { companyRows } from './calc'
import type { CompanyRow, Lifecycle } from './calc'
import { KycBadge } from './ui'

export type Perms = { crm: boolean; contact: boolean; task: boolean; ids: boolean; reverse: boolean }
const LIFE_TONE: Record<Lifecycle, string> = { Active: 'green', Trial: 'blue', 'At risk': 'amber', Churned: 'gray', Unknown: 'gray' }
const SHORT: Record<keyof Kyc, string> = { cac: 'CAC', tin: 'TIN', director: 'ID', address: 'Address' }
const mask = (v: string) => (v.length <= 4 ? '••••' : `${v.slice(0, 2)}••••${v.slice(-2)}`)
const csvCell = (v: string | number) => { const t = String(v ?? ''); const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; return `"${safe.replace(/"/g, '""')}"` }

function KycChips({ kyc, ids }: { kyc: Kyc; ids: boolean }) {
  return (
    <span className="flex flex-wrap gap-1" aria-label="KYC checks">
      {KYC_KEYS.map(({ key, label }) => {
        const it = kyc[key]; const tone = it.state === 'verified' ? 'bg-ok/10 text-ok' : it.state === 'failed' ? 'bg-err/10 text-err' : it.state === 'pending' ? 'bg-warn/15 text-amber-800' : 'bg-ink/5 text-slate'
        return <span key={key} title={`${label}: ${it.state}${it.ref && ids ? ` (${it.ref})` : ''}`} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{it.state === 'verified' ? <ShieldCheck size={11} aria-hidden /> : <ShieldAlert size={11} aria-hidden />}{SHORT[key]}<span className="sr-only"> {it.state}</span></span>
      })}
    </span>
  )
}

export default function Companies({ s, promo, rows, perms, actor }: { s: BillingState; promo: Promo; rows: Redemption[]; perms: Perms; actor: string }) {
  const toast = useToast(); const live = useBilling()
  const all = useMemo(() => companyRows(s, rows), [s, rows])
  const [q, setQ] = useState(''); const [life, setLife] = useState('all'); const [kyc, setKyc] = useState('all'); const [sel, setSel] = useState<Set<string>>(new Set())
  const [dlg, setDlg] = useState<'' | 'list' | 'tag' | 'task' | 'export' | 'reverse'>(''); const [target, setTarget] = useState<CompanyRow | null>(null)
  const crm = live.promoCrm ?? { lists: [], tags: {} }
  const shown = all.filter((r) => (life === 'all' || r.lifecycle === life) && (kyc === 'all' || (kyc === 'incomplete' ? !kycComplete(r.profile.kyc) : kycComplete(r.profile.kyc))) &&
    (!q.trim() || [r.company, perms.contact ? r.profile.contact.name : '', perms.contact ? r.profile.contact.email : '', r.profile.industry, r.profile.state].join(' ').toLowerCase().includes(q.trim().toLowerCase())))
  const incomplete = all.filter((r) => !kycComplete(r.profile.kyc)).length
  const chosen = shown.filter((r) => sel.has(r.id)); const ids = [...new Set(chosen.map((r) => r.subId))]
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.id))
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n })
  const label = chosen.length === 1 ? chosen[0].company : `${chosen.length} companies`

  const [listId, setListId] = useState(''); const [listName, setListName] = useState(''); const [purpose, setPurpose] = useState('Marketing')
  const [tags, setTags] = useState('')
  const [task, setTask] = useState({ title: '', desc: '', priority: 'Normal' as Priority, due: iso(addDays(TODAY, 7)) })
  const [exp, setExp] = useState({ purpose: 'Marketing campaign', contact: perms.contact, kyc: true, consent: true })
  const [why, setWhy] = useState('')

  const openTask = (rs: CompanyRow[]) => {
    const n = rs.filter((r) => !kycComplete(r.profile.kyc))
    const first = rs[0]; const missing = first ? KYC_KEYS.filter((k) => first.profile.kyc[k.key].state !== 'verified').map((k) => k.label) : []
    setTask({ title: rs.length === 1 ? `Follow up with ${first.company}${missing.length ? ': complete KYC' : ''}` : `Follow up with ${rs.length} companies that used ${promo.code ?? promo.name}`,
      desc: rs.length === 1 ? `Promo ${promo.code ?? promo.name} redeemed ${fmtDate(first.at)}.${missing.length ? ` Outstanding KYC: ${missing.join(', ')}.` : ''}` : `${rs.length} companies redeemed ${promo.code ?? promo.name}; ${n.length} have incomplete KYC.`, priority: missing.length ? 'High' : 'Normal', due: iso(addDays(TODAY, 7)) })
    setDlg('task')
  }
  const doExport = () => {
    const consentOnly = exp.purpose === 'Marketing campaign' || exp.consent
    const src = (chosen.length ? chosen : shown).filter((r) => !consentOnly || !exp.contact || r.profile.consent.marketing)
    if (!src.length) { toast('No records match. Contacts without marketing consent are excluded.'); return }
    const head = ['Company', 'Promo', 'Redeemed on', 'Plan', 'Cycle', 'Currency', 'Discount', 'Net revenue', 'Subscription now', 'Lifetime value', 'Source', 'Industry', 'Employees band', 'State']
    if (exp.contact) head.push('Contact name', 'Contact role', 'Email', 'Phone', 'Marketing consent')
    if (exp.kyc) head.push('CAC status', 'TIN status', 'Director ID status', 'Address status'); if (exp.kyc && perms.ids) head.push('CAC / RC number')
    const body = src.map((r) => {
      const c = [r.company, promo.code ?? promo.name, r.at, planById(s, r.planId)?.name ?? r.planId, r.cycle, r.currency, r.discount, r.net, r.lifecycle, r.ltv, r.source, r.profile.industry, r.profile.size, r.profile.state]
      if (exp.contact) c.push(r.profile.contact.name, r.profile.contact.role, r.profile.contact.email, r.profile.contact.phone, r.profile.consent.marketing ? 'Yes' : 'No')
      if (exp.kyc) c.push(r.profile.kyc.cac.state, r.profile.kyc.tin.state, r.profile.kyc.director.state, r.profile.kyc.address.state); if (exp.kyc && perms.ids) c.push(r.profile.kyc.cac.ref ?? '')
      return c
    })
    const csv = [head, ...body].map((r) => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${(promo.code ?? promo.name).toLowerCase().replace(/\W+/g, '-')}-companies.csv`; a.click(); URL.revokeObjectURL(url)
    logExport(actor, src.length, exp.purpose, [exp.contact && 'contact', exp.kyc && 'KYC', consentOnly && 'consent-filtered'].filter(Boolean).join(', ') || 'company and commercial only')
    setDlg(''); toast(`Exported ${src.length} record${src.length === 1 ? '' : 's'}. Export recorded in the audit log.`)
  }

  const tagsOf = (r: CompanyRow) => crm.tags[r.subId] ?? []
  const contactCell = (r: CompanyRow) => perms.contact
    ? <div className="min-w-0 text-[13px]"><div className="font-medium text-ink">{r.profile.contact.name || 'Not provided'}</div>{r.profile.contact.role && <div className="text-xs text-slate">{r.profile.contact.role}</div>}{r.profile.contact.email && <a className="flex items-center gap-1 text-xs text-teal hover:underline" href={`mailto:${r.profile.contact.email}`}><Mail size={11} aria-hidden />{r.profile.contact.email}</a>}{r.profile.contact.phone && <a className="flex items-center gap-1 text-xs text-slate" href={`tel:${r.profile.contact.phone.replace(/\s/g, '')}`}><Phone size={11} aria-hidden />{r.profile.contact.phone}</a>}</div>
    : <span className="text-xs text-slate" title="Contact details need the Manage Subscriptions permission">Restricted</span>
  const rowActions = (r: CompanyRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link to={`/admin/billing/subscriptions/${r.subId}`} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line px-2 text-xs font-semibold text-teal hover:border-teal">Subscription <ExternalLink size={11} aria-hidden /></Link>
      {perms.task && <button onClick={() => { setSel(new Set([r.id])); openTask([r]) }} className="min-h-8 cursor-pointer rounded-md border border-line px-2 text-xs font-semibold text-ink hover:border-teal">Follow up</button>}
      {perms.reverse && r.status === 'applied' && <button aria-label={`Reverse redemption for ${r.company}`} onClick={() => { setTarget(r); setWhy(''); setDlg('reverse') }} className="grid size-8 cursor-pointer place-items-center rounded-md border border-line text-slate hover:border-err hover:text-err"><Undo2 size={13} /></button>}
    </div>
  )
  const fm = (n: number, cur: string) => money(n, cur, { s, trim: true })

  return (
    <Panel title="Companies that used this" action={<span className="text-xs text-slate">{all.length} redemption{all.length === 1 ? '' : 's'} · {incomplete} with incomplete KYC</span>} pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:px-5">
        <input aria-label="Search companies" value={q} onChange={(e) => setQ(e.target.value)} placeholder={perms.contact ? 'Search company, contact, email' : 'Search company, industry, state'} className={`${inputCls} max-w-xs flex-1`} />
        <select aria-label="Subscription status" value={life} onChange={(e) => setLife(e.target.value)} className={`${inputCls} w-auto`}><option value="all">All statuses</option>{(['Active', 'Trial', 'At risk', 'Churned'] as const).map((x) => <option key={x}>{x}</option>)}</select>
        <select aria-label="KYC filter" value={kyc} onChange={(e) => setKyc(e.target.value)} className={`${inputCls} w-auto`}><option value="all">All KYC</option><option value="incomplete">KYC incomplete ({incomplete})</option><option value="complete">KYC complete</option></select>
        {kyc !== 'incomplete' && incomplete > 0 && <button onClick={() => setKyc('incomplete')} className="cursor-pointer text-xs font-semibold text-amber-800 underline-offset-2 hover:underline">Show KYC incomplete</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cloud/60 px-3 py-2 sm:px-5" role="toolbar" aria-label="CRM actions">
        <label className="mr-1 flex cursor-pointer items-center gap-2 text-xs font-medium text-slate"><input type="checkbox" className="size-4 accent-teal" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.id)))} />Select all ({shown.length})</label>
        <span className="num text-xs font-semibold text-ink" role="status">{chosen.length} selected</span>
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
        {perms.crm && <Btn v="secondary" s="sm" disabled={!chosen.length} onClick={() => { setListId(crm.lists[0]?.id ?? ''); setListName(''); setDlg('list') }}><ListPlus size={14} className="mr-1.5 inline" aria-hidden />Add to list</Btn>}
        {perms.crm && <Btn v="secondary" s="sm" disabled={!chosen.length} onClick={() => { setTags(''); setDlg('tag') }}><TagIcon size={14} className="mr-1.5 inline" aria-hidden />Tag</Btn>}
        {perms.task && <Btn v="secondary" s="sm" disabled={!chosen.length} onClick={() => openTask(chosen)}><ListTodo size={14} className="mr-1.5 inline" aria-hidden />Create follow-up task</Btn>}
        <Btn v="secondary" s="sm" disabled={!shown.length} onClick={() => { setExp({ purpose: 'Marketing campaign', contact: perms.contact, kyc: true, consent: true }); setDlg('export') }}><Download size={14} className="mr-1.5 inline" aria-hidden />Export CSV</Btn>
      </div>

      {shown.length === 0 ? <div className="p-5"><EmptyState title={all.length ? 'No companies match these filters' : 'No redemptions yet'} body={all.length ? 'Clear the search or filters to see every company.' : 'When a customer redeems this promotion, the company appears here with its contact and KYC details.'} /></div> : <>
        <div className="max-h-[70dvh] overflow-auto overscroll-contain max-lg:hidden">
          <table className="w-full min-w-[1180px] text-left text-[13px]" aria-label="Companies that redeemed this promotion">
            <thead className="sticky top-0 z-10 bg-cloud/95 text-xs text-slate backdrop-blur"><tr className="border-b border-line">{['', 'Company', 'Contact', 'Plan', 'Redeemed', 'Discount', 'Net revenue', 'Now', 'Lifetime value', 'Source', 'KYC', ''].map((h, i) => <th key={i} scope="col" className={`px-3 py-3 font-semibold ${[5, 6, 8].includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id} className={`border-b border-line/60 align-top last:border-0 ${sel.has(r.id) ? 'bg-softmint/50' : 'hover:bg-softmint/25'} ${r.status === 'reversed' ? 'opacity-60' : ''}`}>
                <td className="py-3 pl-4"><input type="checkbox" aria-label={`Select ${r.company}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-teal" /></td>
                <td className="max-w-[16rem] px-3 py-3"><div className="font-semibold text-ink">{r.company}</div><div className="text-xs text-slate">{[r.profile.industry, r.profile.size && `${r.employees} staff (${r.profile.size})`, r.profile.state].filter(Boolean).join(' · ') || 'Profile not captured'}</div>
                  {(tagsOf(r).length > 0) && <div className="mt-1 flex flex-wrap gap-1">{tagsOf(r).map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">{t}{perms.crm && <button aria-label={`Remove tag ${t}`} onClick={() => removeTag(actor, r.subId, t)} className="cursor-pointer leading-none">×</button>}</span>)}</div>}</td>
                <td className="px-3 py-3">{contactCell(r)}</td>
                <td className="px-3 py-3"><div className="font-medium text-ink">{planById(s, r.planId)?.name ?? r.planId}</div><div className="text-xs capitalize text-slate">{r.cycle} · {r.currency}</div></td>
                <td className="num whitespace-nowrap px-3 py-3">{fmtDate(r.at)}{r.status === 'reversed' && <div><Badge tone="red">Reversed</Badge></div>}</td>
                <td className="num px-3 py-3 text-right text-err">−{fm(r.discount, r.currency)}</td>
                <td className="num px-3 py-3 text-right font-semibold">{fm(r.net, r.currency)}</td>
                <td className="px-3 py-3"><Badge tone={LIFE_TONE[r.lifecycle]}>{r.lifecycle === 'Active' ? 'Active' : r.lifecycle}</Badge></td>
                <td className="num px-3 py-3 text-right">{fm(r.ltv, r.ltvCur)}</td>
                <td className="px-3 py-3 text-xs text-slate"><div className="text-ink">{r.source}</div><div>{r.profile.referrer}</div><div>{r.channel}</div></td>
                <td className="px-3 py-3"><KycChips kyc={r.profile.kyc} ids={perms.ids} />{!kycComplete(r.profile.kyc) && <div className="mt-1"><Badge tone="amber">KYC incomplete</Badge></div>}{perms.ids && r.profile.kyc.cac.ref && <div className="num mt-1 text-xs text-slate">{r.profile.kyc.cac.ref}</div>}{!perms.ids && r.profile.kyc.cac.ref && <div className="num mt-1 text-xs text-slate">{mask(r.profile.kyc.cac.ref)}</div>}</td>
                <td className="px-3 py-3 pr-4">{rowActions(r)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <ul className="space-y-2.5 bg-cloud/60 p-3 lg:hidden" aria-label="Companies that redeemed this promotion">{shown.map((r) => (
          <li key={r.id} className={`rounded-xl border bg-white p-3.5 ${sel.has(r.id) ? 'border-teal bg-softmint/40' : 'border-line'} ${r.status === 'reversed' ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3"><input type="checkbox" aria-label={`Select ${r.company}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 size-5 shrink-0 accent-teal" />
              <div className="min-w-0 flex-1"><div className="break-words font-semibold text-ink">{r.company}</div><div className="text-xs text-slate">{[r.profile.industry, r.profile.state].filter(Boolean).join(' · ')}</div></div><Badge tone={LIFE_TONE[r.lifecycle]}>{r.lifecycle}</Badge></div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line/70 pt-3 text-[13px]">
              <div><dt className="text-[11px] text-slate">Plan</dt><dd>{planById(s, r.planId)?.name} · <span className="capitalize">{r.cycle}</span></dd></div>
              <div><dt className="text-[11px] text-slate">Redeemed</dt><dd className="num">{fmtDate(r.at)}</dd></div>
              <div><dt className="text-[11px] text-slate">Discount</dt><dd className="num text-err">−{fm(r.discount, r.currency)}</dd></div>
              <div><dt className="text-[11px] text-slate">Net revenue</dt><dd className="num font-semibold">{fm(r.net, r.currency)}</dd></div>
              <div><dt className="text-[11px] text-slate">Lifetime value</dt><dd className="num">{fm(r.ltv, r.ltvCur)}</dd></div>
              <div><dt className="text-[11px] text-slate">Source</dt><dd>{r.source}</dd></div>
              <div className="col-span-2"><dt className="text-[11px] text-slate">Contact</dt><dd>{contactCell(r)}</dd></div>
              <div className="col-span-2"><dt className="mb-1 text-[11px] text-slate">KYC</dt><dd><KycChips kyc={r.profile.kyc} ids={perms.ids} /></dd></div>
            </dl>
            <div className="mt-3">{rowActions(r)}</div>
          </li>))}
        </ul>
      </>}
      <p className="border-t border-line bg-cloud/50 px-4 py-3 text-xs leading-relaxed text-slate sm:px-5">Contact and KYC details are personal data under the Nigeria Data Protection Act 2023. They are shown only to roles with the Manage Subscriptions permission, every export is recorded in the platform audit log, and marketing use requires recorded consent.</p>

      <Overlay open={dlg === 'list'} onClose={() => setDlg('')} title="Add to marketing list">
        <div className="space-y-4"><p className="text-sm text-slate">{label} will be added. Only companies with recorded marketing consent should be contacted for campaigns.</p>
          {crm.lists.length > 0 && <Field label="Existing list"><select className={inputCls} value={listId} onChange={(e) => setListId(e.target.value)}>{crm.lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.subIds.length})</option>)}<option value="">New list…</option></select></Field>}
          {!listId && <><Field label="New list name"><input className={inputCls} value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. Q4 promo adopters" /></Field><Field label="Purpose"><select className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>{['Marketing', 'KYC remediation', 'Account management', 'Win-back'].map((x) => <option key={x}>{x}</option>)}</select></Field></>}
          <Btn className="w-full" onClick={() => { if (!listId && !listName.trim()) { toast('Name the list first.', 'err'); return } const n = addToList(actor, listId ? { listId } : { name: listName, purpose }, ids, label); setDlg(''); toast(`Added to "${n}".`) }}>Add to list</Btn></div>
      </Overlay>
      <Overlay open={dlg === 'tag'} onClose={() => setDlg('')} title="Tag companies">
        <div className="space-y-4"><Field label="Tags" hint="Separate with commas. Example: promo-adopter, needs-kyc"><input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          <Btn className="w-full" onClick={() => { const t = tags.split(',').map((x) => x.trim().toLowerCase().replace(/[^\w -]/g, '')).filter(Boolean); if (!t.length) { toast('Enter at least one tag.', 'err'); return } tagCompanies(actor, ids, t, label); setDlg(''); toast('Tags saved.') }}>Save tags</Btn></div>
      </Overlay>
      <Overlay open={dlg === 'task'} onClose={() => setDlg('')} title="Create follow-up task">
        <div className="space-y-4"><Field label="Title"><input className={inputCls} value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /></Field>
          <Field label="Details"><textarea rows={4} className={`${inputCls} h-auto py-2`} value={task.desc} onChange={(e) => setTask({ ...task, desc: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Priority"><select className={inputCls} value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value as Priority })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="Due"><input type="date" className={inputCls} value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} /></Field></div>
          <p className="text-xs text-slate">Created as a Platform task assigned to you. Open it from Platform tasks.</p>
          <Btn className="w-full" onClick={() => { if (!task.title.trim()) { toast('Add a title.', 'err'); return } const t = followUpTask(actor, { ...task, title: task.title.trim(), related: chosen.length === 1 ? chosen[0].company : `${promo.code ?? promo.name} customers` }); setDlg(''); toast(`${t.id} created in Platform tasks.`) }}>Create task</Btn></div>
      </Overlay>
      <Overlay open={dlg === 'export'} onClose={() => setDlg('')} title="Export companies (CSV)">
        <div className="space-y-4">
          <p className="rounded-md bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-amber-900">This file contains personal data protected by the NDPA 2023. Export only for a stated lawful purpose, keep it inside approved systems, and delete it when finished. This export is recorded in the audit log against your name.</p>
          <Field label="Purpose"><select className={inputCls} value={exp.purpose} onChange={(e) => setExp({ ...exp, purpose: e.target.value, consent: e.target.value === 'Marketing campaign' ? true : exp.consent })}>{['Marketing campaign', 'KYC remediation', 'Finance reconciliation'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <label className={`flex items-start gap-2 text-sm ${perms.contact ? 'cursor-pointer' : 'opacity-50'}`}><input type="checkbox" className="mt-0.5 size-4 accent-teal" disabled={!perms.contact} checked={exp.contact} onChange={(e) => setExp({ ...exp, contact: e.target.checked })} /><span>Include contact name, email and phone{!perms.contact && <em className="block text-xs not-italic text-slate">Your role cannot export contact details.</em>}</span></label>
          <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={exp.kyc} onChange={(e) => setExp({ ...exp, kyc: e.target.checked })} /><span>Include KYC statuses{perms.ids ? ' and CAC number' : ''}</span></label>
          <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-teal" disabled={exp.purpose === 'Marketing campaign'} checked={exp.consent || exp.purpose === 'Marketing campaign'} onChange={(e) => setExp({ ...exp, consent: e.target.checked })} /><span>Only contacts with recorded marketing consent{exp.purpose === 'Marketing campaign' && <em className="block text-xs not-italic text-slate">Required for marketing use.</em>}</span></label>
          <Btn className="w-full" onClick={doExport}>Download {chosen.length ? chosen.length : shown.length} record{(chosen.length || shown.length) === 1 ? '' : 's'}</Btn>
        </div>
      </Overlay>
      <Overlay open={dlg === 'reverse'} onClose={() => setDlg('')} title="Reverse redemption" alert>
        <div className="space-y-4"><p className="text-sm text-slate">This frees one use of {promo.code ?? promo.name} and removes it from insights. It does not change the company's subscription or refund any payment.</p>
          <Field label="Reason"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Applied in error" /></Field>
          <Btn className="w-full" onClick={() => { if (!why.trim() || !target) { toast('Give a reason for the audit log.', 'err'); return } reverseRedemption(actor, target.id, why.trim()); setDlg(''); toast('Redemption reversed.') }}>Reverse redemption</Btn></div>
      </Overlay>
    </Panel>
  )
}
