import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Btn, EmptyState, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { daysBetween, fmtDay, isoOf, kpis, markFiled, reopenFiling, saveRule, todayIso, useObligations } from '../../platform/statutory'
import type { Obligation, StatRule, Status } from '../../platform/statutory'
import { useAdmin } from './AdminLayout'

const TONE: Record<Status, string> = { Filed: 'green', Overdue: 'red', 'Due soon': 'amber', Upcoming: 'gray' }
const DOT: Record<Status, string> = { Filed: 'bg-ok', Overdue: 'bg-err', 'Due soon': 'bg-amber-500', Upcoming: 'bg-slate/50' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dueText = (o: Obligation) => (o.status === 'Filed' ? (o.lateBy ? `Filed ${o.lateBy}d late` : 'Filed on time') : o.days < 0 ? `${-o.days}d overdue` : o.days === 0 ? 'Due today' : `in ${o.days}d`)

export default function Compliance() {
  const { list, rules } = useObligations()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const manage = can('support')
  const [tab, setTab] = useState('Agenda')
  const [status, setStatus] = useState('All')
  const [rule, setRule] = useState('All')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [ym, setYm] = useState(() => { const t = todayIso(); return { y: +t.slice(0, 4), m: +t.slice(5, 7) } })
  const [day, setDay] = useState<string | null>(null)
  const [edit, setEdit] = useState<StatRule | null>(null)
  const [form, setForm] = useState({ evidence: '', reference: '', filedOn: todayIso(), reason: '' })
  const [err, setErr] = useState('')

  const k = kpis(list)
  const shown = useMemo(() => list.filter((o) => (status === 'All' || o.status === status) && (rule === 'All' || o.rule.id === rule) && (!q || (o.company + o.slug).toLowerCase().includes(q.toLowerCase())) && (o.status !== 'Filed' || o.days >= -45)), [list, status, rule, q])
  const sel = list.find((o) => o.key === open)
  const byRule = useMemo(() => rules.filter((r) => r.enabled).map((r) => {
    const mine = list.filter((o) => o.rule.id === r.id && (o.status === 'Filed' || o.days < 0))
    return { r, applicable: new Set(list.filter((o) => o.rule.id === r.id).map((o) => o.slug)).size, rate: mine.length ? Math.round((mine.filter((o) => o.status === 'Filed' && o.lateBy === 0).length / mine.length) * 100) : 100, overdue: list.filter((o) => o.rule.id === r.id && o.status === 'Overdue').length }
  }), [list, rules])

  const openIt = (o: Obligation) => { setOpen(o.key); setErr(''); setForm({ evidence: '', reference: '', filedOn: todayIso(), reason: '' }) }
  const file = () => { if (!sel) return; const r = markFiled(sel, form, by); if (!r.ok) return setErr(r.error ?? ''); toast(`${sel.rule.name} marked filed for ${sel.company}`); setOpen(null) }
  const reopen = () => { if (!sel) return; const r = reopenFiling(sel, form.reason, by); if (!r.ok) return setErr(r.error ?? ''); toast('Filing reopened'); setOpen(null) }

  const actionable = (o: Obligation) => o.status !== 'Filed'
  const row = (o: Obligation) => [
    <div key="c"><div className="font-medium text-ink">{o.company}</div><div className="text-xs text-slate">{o.slug}</div></div>,
    <div key="r"><div className="text-ink">{o.rule.name}</div><div className="text-xs text-slate">{o.period}</div></div>,
    fmtDay(o.due),
    <Badge key="s" tone={TONE[o.status]}>{o.status}</Badge>,
    <span key="d" className={o.status === 'Overdue' ? 'font-semibold text-err' : 'text-slate'}>{dueText(o)}</span>,
    <Btn key="b" v={actionable(o) && manage ? 'primary' : 'ghost'} s="sm" onClick={() => openIt(o)}>{o.status === 'Filed' ? 'View filing' : manage ? 'Mark filed' : 'View'}</Btn>,
  ]

  /* Calendar grid */
  const first = new Date(Date.UTC(ym.y, ym.m - 1, 1)).getUTCDay()
  const dim = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate()
  const cells = Array.from({ length: Math.ceil((first + dim) / 7) * 7 }, (_, i) => i - first + 1)
  const move = (n: number) => setYm((p) => { const i = p.y * 12 + p.m - 1 + n; return { y: Math.floor(i / 12), m: (i % 12) + 1 } })
  const dayList = day ? list.filter((o) => o.due === day) : []

  return (
    <div>
      <PageHeader eyebrow="Compliance" title="Compliance calendar" desc="Nigerian statutory obligations expanded per company from its modules and headcount. Companies see reminders in their inbox. Staff record the filing with an evidence note." actions={<ExportButton name="compliance" head={['Company', 'Obligation', 'Period', 'Due', 'Status']} rows={shown.map((o) => [o.company, o.rule.name, o.period, o.due, o.status])} />} />
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
        {[
          <Stat key="a" label="Due this month" value={String(k.dueThisMonth)} sub="Across all companies" />,
          <Stat key="b" label="Filed this month" value={String(k.filedThisMonth)} sub={k.dueThisMonth ? `${Math.round((k.filedThisMonth / k.dueThisMonth) * 100)}% of due` : 'Nothing due'} />,
          <Stat key="c" label="Overdue" value={String(k.overdue)} sub={`${k.tenantsOverdue} compan${k.tenantsOverdue === 1 ? 'y' : 'ies'}`} up={k.overdue === 0} />,
          <Stat key="d" label="Due in 7 days" value={String(k.dueSoon)} sub="Reminders already sent" />,
          <Stat key="e" label="On-time rate" value={`${k.onTimeRate}%`} sub="Last 100 days" up={k.onTimeRate >= 90} />,
        ].map((s, i) => <div key={i} className="bg-white">{s}</div>)}
      </div>
      <Tabs tabs={['Agenda', 'Calendar', 'Rules']} value={tab} onChange={setTab} />

      {tab !== 'Rules' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input className={`${inputCls} max-w-56`} placeholder="Search company" aria-label="Search company" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={`${inputCls} max-w-40`} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option>{(['Overdue', 'Due soon', 'Upcoming', 'Filed'] as Status[]).map((s) => <option key={s}>{s}</option>)}</select>
          <select className={`${inputCls} max-w-56`} aria-label="Obligation" value={rule} onChange={(e) => setRule(e.target.value)}><option value="All">All obligations</option>{rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </div>
      )}

      {tab === 'Agenda' && (
        <div className="mt-4">
          {shown.length ? <Table label="Compliance agenda" head={['Company', 'Obligation', 'Due', 'Status', 'Timing', '']} rows={shown.sort((a, b) => Number(b.status === 'Overdue') - Number(a.status === 'Overdue') || a.due.localeCompare(b.due)).map(row)} pageSize={10} /> : <EmptyState title="No obligations match" body="Change the filters. Companies only get obligations their modules and headcount make applicable." />}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Panel title="Filing health by obligation">
              <ul className="space-y-2.5">
                {byRule.map(({ r, applicable, rate, overdue }) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">{r.name}<span className="ml-2 text-xs text-slate">{applicable} compan{applicable === 1 ? 'y' : 'ies'}</span></span>
                    <span className="flex shrink-0 items-center gap-2">{overdue > 0 && <Badge tone="red">{overdue} overdue</Badge>}<span className="num text-xs font-semibold">{rate}% on time</span></span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Insight">
              <p className="text-sm leading-relaxed text-slate">{k.overdue ? `${k.overdue} filing${k.overdue === 1 ? ' is' : 's are'} overdue across ${k.tenantsOverdue} compan${k.tenantsOverdue === 1 ? 'y' : 'ies'}. Penalties accrue from the due date, so record the filing receipt as soon as the company shares it.` : 'Nothing is overdue. Reminders go out automatically in each company inbox as due dates approach.'} Rules decide who is in scope: payroll obligations need the Payroll module, WHT needs Vendors or Expenses, and ITF needs five or more staff.</p>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'Calendar' && (
        <div className="mt-4">
          <Panel pad={false}>
            <div className="flex items-center justify-between border-b border-line p-3">
              <Btn v="ghost" s="sm" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={16} /></Btn>
              <div className="font-display text-sm font-semibold text-ink">{MONTHS[ym.m - 1]} {ym.y}</div>
              <Btn v="ghost" s="sm" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={16} /></Btn>
            </div>
            <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold uppercase text-slate">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const iso = d >= 1 && d <= dim ? isoOf(ym.y, ym.m, d) : ''
                const items = iso ? shown.filter((o) => o.due === iso) : []
                return (
                  <button key={i} disabled={!iso} onClick={() => setDay(iso)} className={`min-h-16 border-b border-r border-line p-1.5 text-left align-top sm:min-h-20 ${iso ? 'hover:bg-teal/5' : 'bg-ink/[0.02]'} ${iso === todayIso() ? 'bg-teal/10' : ''}`} aria-label={iso ? `${fmtDay(iso)}, ${items.length} obligations` : undefined}>
                    <div className="text-xs text-slate">{iso ? d : ''}</div>
                    {items.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{(['Overdue', 'Due soon', 'Upcoming', 'Filed'] as Status[]).filter((s) => items.some((o) => o.status === s)).map((s) => <span key={s} className="flex items-center gap-1 text-[11px] font-semibold text-ink"><span className={`h-2 w-2 rounded-full ${DOT[s]}`} />{items.filter((o) => o.status === s).length}</span>)}</div>}
                  </button>
                )
              })}
            </div>
          </Panel>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate">{(Object.keys(DOT) as Status[]).map((s) => <span key={s} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${DOT[s]}`} />{s}</span>)}</div>
        </div>
      )}

      {tab === 'Rules' && (
        <div className="mt-4">
          <Table label="Statutory rules" head={['Obligation', 'Authority', 'Cadence', 'Applies when', 'Reminder', 'Status', '']} pageSize={12} rows={rules.map((r) => [
            <div key="n"><div className="font-medium text-ink">{r.name}</div><div className="text-xs text-slate">{r.penalty}</div></div>,
            r.authority,
            r.freq === 'Monthly' ? `By ${r.day === 'eom' ? 'month end' : `the ${r.day}th`} of next month` : `${r.day} ${MONTHS[(r.dueMonth ?? 1) - 1]} yearly`,
            `${r.modulesAny.length ? r.modulesAny.join(' or ') + ' module' : 'Every company'}${r.minEmployees > 1 ? `, ${r.minEmployees}+ staff` : ''}`,
            `${r.leadDays} days before`,
            <Badge key="s" tone={r.enabled ? 'green' : 'gray'}>{r.enabled ? 'Active' : 'Off'}</Badge>,
            manage ? <Btn key="e" v="ghost" s="sm" onClick={() => { setEdit({ ...r }); setErr('') }}>Edit</Btn> : '',
          ])} />
          <p className="mt-3 text-xs text-slate">Dates are BizFlow reminder dates, not legal advice. Check with the relevant authority for the current deadline.</p>
        </div>
      )}

      <Overlay open={!!sel} onClose={() => setOpen(null)} title={sel ? `${sel.rule.name} · ${sel.period}` : ''} side>
        {sel && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[sel.status]}>{sel.status}</Badge><span className="text-sm text-slate">{sel.company} · due {fmtDay(sel.due)} · {dueText(sel)}</span></div>
            <p className="text-sm text-slate">{sel.rule.note} Authority: {sel.rule.authority}. Late penalty: {sel.rule.penalty}.</p>
            {sel.filing ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-line p-3 text-sm"><div className="font-semibold text-ink">Filed {fmtDay(sel.filing.at.slice(0, 10))} by {sel.filing.by}</div>{sel.filing.reference && <div className="text-slate">Reference {sel.filing.reference}</div>}<div className="mt-1 text-slate">Evidence: {sel.filing.evidence}</div></div>
                {manage && <>
                  <Field label="Reason for reopening"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
                  {err && <p role="alert" className="text-sm text-err">{err}</p>}
                  <Btn v="secondary" onClick={reopen}>Reopen filing</Btn>
                </>}
              </div>
            ) : manage ? (
              <div className="space-y-3">
                <Field label="Filing date"><input type="date" className={inputCls} max={todayIso()} value={form.filedOn} onChange={(e) => setForm({ ...form, filedOn: e.target.value })} /></Field>
                <Field label="Receipt or reference number" hint="Optional"><input className={inputCls} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
                <Field label="Evidence note" hint="What proves it was filed, for example where the receipt is stored."><textarea className={`${inputCls} h-24 py-2`} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} /></Field>
                {form.filedOn > sel.due && <p className="text-xs text-amber-700">This date is {daysBetween(sel.due, form.filedOn)} days after the due date and will count as late.</p>}
                {err && <p role="alert" className="text-sm text-err">{err}</p>}
                <Btn onClick={file}>Mark as filed</Btn>
              </div>
            ) : <p className="text-sm text-slate">You can view this obligation. Customer support or admin roles record filings.</p>}
          </div>
        )}
      </Overlay>

      <Overlay open={!!day} onClose={() => setDay(null)} title={day ? fmtDay(day) : ''} side>
        {dayList.length ? <ul className="space-y-2">{dayList.map((o) => <li key={o.key}><button className="flex w-full items-center justify-between gap-2 rounded-lg border border-line p-3 text-left hover:bg-teal/5" onClick={() => { setDay(null); openIt(o) }}><span><span className="block text-sm font-medium text-ink">{o.rule.name}</span><span className="text-xs text-slate">{o.company} · {o.period}</span></span><Badge tone={TONE[o.status]}>{o.status}</Badge></button></li>)}</ul> : <p className="text-sm text-slate">Nothing falls due on this day.</p>}
      </Overlay>

      <Overlay open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit ${edit.name}` : ''} side>
        {edit && (
          <div className="space-y-3">
            <Field label="Due day" hint={edit.freq === 'Monthly' ? 'Day of the following month, 1 to 28, or 31 for month end.' : 'Day of the due month.'}><input type="number" min={1} max={31} className={inputCls} value={edit.day === 'eom' ? 31 : edit.day} onChange={(e) => setEdit({ ...edit, day: +e.target.value >= 29 && edit.freq === 'Monthly' ? 'eom' : Math.max(1, Math.min(31, +e.target.value || 1)) })} /></Field>
            <Field label="Reminder lead time (days)"><input type="number" min={1} max={60} className={inputCls} value={edit.leadDays} onChange={(e) => setEdit({ ...edit, leadDays: Math.max(1, Math.min(60, +e.target.value || 1)) })} /></Field>
            <Field label="Minimum staff"><input type="number" min={1} className={inputCls} value={edit.minEmployees} onChange={(e) => setEdit({ ...edit, minEmployees: Math.max(1, +e.target.value || 1) })} /></Field>
            <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Rule is active</label>
            <Btn onClick={() => { saveRule(edit, by); toast('Rule saved'); setEdit(null) }}>Save rule</Btn>
          </div>
        )}
      </Overlay>
    </div>
  )
}
