import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Copy, Plus, Search } from 'lucide-react'
import { Badge, Btn, EmptyState, PageHeader, Panel, useToast } from '../../../components/ui'
import { fmtDate, useBilling } from '../../../data/billing'
import type { Promo } from '../../../data/billing'
import { Gate, useAdmin } from '../AdminLayout'
import { compactNgn, promoState, redemptionsOf, STATE_TONE, STATUS_TABS, statsOf, tabOf } from './calc'
import type { Perms } from './Companies'
import Detail from './Detail'
import Editor, { blankPromo, duplicateOf } from './Editor'
import Overview from './Overview'
import { savePromo } from './actions'
import { Meter, valueLabel } from './ui'

export function Promotions() {
  const s = useBilling(); const { can, actor } = useAdmin(); const toast = useToast()
  const [sp, setSp] = useSearchParams(); const openId = sp.get('promo')
  const [view, setView] = useState<'cards' | 'table'>('cards'); const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>('All')
  const [q, setQ] = useState(''); const [kind, setKind] = useState<'all' | 'coupon' | 'automatic'>('all')
  const [edit, setEdit] = useState<Promo | null>(null)
  const canEdit = can('discounts'); const canSub = can('subscriptions')
  const perms: Perms = { crm: can('businesses') || canSub, contact: canSub, task: can('tasks'), ids: canSub, reverse: canEdit && canSub }
  const promo = openId ? s.promos.find((p) => p.id === openId) : undefined
  const open = (id: string | null) => setSp(id ? { promo: id } : {}, { replace: false })

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return s.promos.filter((p) => (tab === 'All' || tabOf(promoState(p)) === tab) && (kind === 'all' || p.kind === kind) &&
      (!needle || [p.name, p.code, p.campaign, p.channel].some((x) => x?.toLowerCase().includes(needle))))
  }, [s.promos, tab, kind, q])
  const count = (t: (typeof STATUS_TABS)[number]) => (t === 'All' ? s.promos.length : s.promos.filter((p) => tabOf(promoState(p)) === t).length)

  const save = () => {
    if (!edit) return
    const p = savePromo(actor, edit, promoState(edit)); setEdit(null); toast('Saved.')
    if (!edit.id) open(p.id)
  }

  return (
    <Gate perm="view">
      <PageHeader eyebrow="Billing & Pricing" title="Discounts and coupons" desc="Track what each offer costs and earns, and which companies used it." actions={canEdit && <><Btn v="secondary" onClick={() => setEdit(blankPromo('automatic'))}>New discount</Btn><Btn onClick={() => setEdit(blankPromo('coupon'))}><Plus size={15} aria-hidden />New coupon</Btn></>} />
      {promo ? (
        <Detail s={s} promo={promo} perms={perms} canEdit={canEdit} actor={actor} onBack={() => open(null)} onEdit={() => setEdit(structuredClone(promo))} onDuplicate={() => setEdit(duplicateOf(promo, s))} />
      ) : (
        <div className="space-y-6">
          <Overview s={s} onOpen={open} />
          <Panel title="All promotions" pad={false} action={<div className="inline-flex rounded-md border border-line p-0.5 text-xs" role="group" aria-label="Layout">{(['cards', 'table'] as const).map((v) => <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`cursor-pointer rounded px-2.5 py-1 font-semibold capitalize ${view === v ? 'bg-teal text-white' : 'text-slate'}`}>{v}</button>)}</div>}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
              <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1">{STATUS_TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-8 cursor-pointer rounded-full px-3 text-xs font-semibold ${tab === t ? 'bg-ink text-white' : 'bg-cloud text-slate hover:text-ink'}`}>{t} <span className="num opacity-70">{count(t)}</span></button>)}</div>
              <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
                <label className="relative block flex-1 sm:w-56 sm:flex-none"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate" aria-hidden /><span className="sr-only">Search promotions</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, campaign" className="h-9 w-full rounded-md border border-line bg-white pl-8 pr-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20" /></label>
                <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-9 rounded-md border border-line bg-white px-2 text-sm"><option value="all">All types</option><option value="coupon">Coupons</option><option value="automatic">Automatic</option></select>
              </div>
            </div>
            {!list.length ? <div className="p-6"><EmptyState title="No promotions match" body="Try another status or clear the search." /></div> : view === 'cards' ? (
              <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                {list.map((p) => { const st = statsOf(s, redemptionsOf(s, p.id)); const state = promoState(p); return (
                  <li key={p.id} className="flex flex-col rounded-lg border border-line bg-white p-4 transition-shadow hover:shadow-md motion-reduce:transition-none">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className={`block truncate text-[15px] text-ink ${p.code ? 'font-mono' : ''}`}>{p.code ?? p.name}</b><span className="block truncate text-xs text-slate">{p.code ? p.name : 'Automatic discount'}</span></div><Badge tone={STATE_TONE[state]}>{state}</Badge></div>
                    <div className="mt-3 flex items-baseline gap-2"><span className="num text-2xl font-semibold text-ink">{valueLabel(p, s)}</span><span className="text-xs text-slate">off</span></div>
                    <p className="mt-1 text-xs text-slate">{fmtDate(p.start)} to {fmtDate(p.end)}{p.campaign ? ` · ${p.campaign}` : ''}</p>
                    <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-slate"><span>{p.redeemed}{p.limit ? ` / ${p.limit}` : ''} used</span><span>{st.count ? `${compactNgn(st.discount)} given` : 'No redemptions'}</span></div><Meter value={p.redeemed} max={p.limit} label={`${p.name} usage`} /></div>
                    <div className="mt-4 flex gap-2 pt-1"><Btn s="sm" className="flex-1" onClick={() => open(p.id)}>Insights</Btn>{canEdit && <Btn s="sm" v="secondary" aria-label={`Duplicate ${p.name}`} onClick={() => setEdit(duplicateOf(p, s))}><Copy size={14} aria-hidden /></Btn>}<Btn s="sm" v="secondary" onClick={() => setEdit(structuredClone(p))}>{canEdit ? 'Edit' : 'View'}</Btn></div>
                  </li>) })}
              </ul>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><caption className="sr-only">Promotions</caption>
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-slate"><th className="px-5 py-2.5 font-semibold">Promotion</th><th className="px-3 font-semibold">Value</th><th className="px-3 font-semibold">Window</th><th className="px-3 text-right font-semibold">Used</th><th className="px-3 text-right font-semibold">Discount given</th><th className="px-3 font-semibold">Status</th><th className="px-5" /></tr></thead>
                <tbody className="divide-y divide-line/70">{list.map((p) => { const st = statsOf(s, redemptionsOf(s, p.id)); const state = promoState(p); return (
                  <tr key={p.id} className="hover:bg-softmint/20"><td className="px-5 py-2.5"><b className={p.code ? 'font-mono text-[13px]' : ''}>{p.code ?? p.name}</b><span className="block text-xs text-slate">{p.code ? p.name : p.campaign}</span></td><td className="num px-3">{valueLabel(p, s)}</td><td className="px-3 text-xs">{fmtDate(p.start)} to {fmtDate(p.end)}</td><td className="num px-3 text-right">{p.redeemed}{p.limit ? ` / ${p.limit}` : ''}</td><td className="num px-3 text-right">{st.count ? compactNgn(st.discount) : '—'}</td><td className="px-3"><Badge tone={STATE_TONE[state]}>{state}</Badge></td>
                    <td className="whitespace-nowrap px-5 text-right"><button onClick={() => open(p.id)} className="mr-3 cursor-pointer font-semibold text-teal">Insights</button><button onClick={() => setEdit(structuredClone(p))} className="cursor-pointer font-semibold text-teal">{canEdit ? 'Edit' : 'View'}</button></td></tr>) })}</tbody></table></div>
            )}
          </Panel>
        </div>
      )}
      <Editor s={s} edit={edit} setEdit={setEdit} canEdit={canEdit} onSave={save} onClose={() => setEdit(null)} />
    </Gate>
  )
}
