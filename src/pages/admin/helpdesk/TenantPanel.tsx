import { Link } from 'react-router'
import { Badge, Panel } from '../../../components/ui'
import { useAudit, useTenants } from '../../../tenant/store'
import { healthOf } from '../../../platform/health'
import { useBilling } from '../../../data/billing'
import { slugOf } from '../../../billing/insights'
import { fmtN, useInvoices } from '../../../billing/ledger'
import type { Ticket } from '../../../platform/helpdesk'
import { P_TONE } from './shared'

/** Ticket to tenant context: health, plan, status, seats, billing exposure and the company's other open tickets. */
export default function TenantPanel({ t, all, onOpen, canOpenCompany }: { t: Ticket; all: Ticket[]; onOpen: (id: string) => void; canOpenCompany: boolean }) {
  const tenant = useTenants()[t.slug]
  const audit = useAudit()
  const s = useBilling()
  if (!tenant) return <Panel title="Company"><p className="text-sm text-slate">The workspace <code>{t.slug}</code> no longer exists, so no company context is available.</p></Panel>
  const h = healthOf(tenant, audit)
  const sub = s.subs.find((x) => slugOf(x) === t.slug) ?? s.subs.find((x) => x.company === tenant.profile.name)
  /* Open invoices come from the invoice ledger (issued and overdue, net of payments and credits), the same source as Billing operations. */
  const { invoices } = useInvoices()
  const open = invoices.filter((i) => i.tenant.slug === t.slug && (i.status === 'Issued' || i.status === 'Overdue'))
  const overdue = open.filter((i) => i.status === 'Overdue')
  const owed = open.reduce((n, i) => n + i.balance, 0)
  const oldest = overdue.reduce<number>((m, i) => Math.max(m, i.daysOverdue), 0)
  const others = all.filter((x) => x.slug === t.slug && x.id !== t.id && x.status !== 'Resolved')
  return (
    <Panel title="Company context" action={canOpenCompany ? <Link to={`/admin/businesses/${t.slug}`} className="text-sm font-semibold text-teal hover:underline">Open business<span className="sr-only"> {tenant.profile.name}</span></Link> : undefined}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate">Company</dt><dd className="font-semibold">{tenant.profile.name}</dd></div>
        <div><dt className="text-xs text-slate">Health score</dt><dd><Badge tone={h.tone}>{h.score} · {h.label}</Badge></dd></div>
        <div><dt className="text-xs text-slate">Plan</dt><dd className="font-semibold">{tenant.plan}</dd></div>
        <div><dt className="text-xs text-slate">Workspace status</dt><dd className="font-semibold">{tenant.status}</dd></div>
        <div><dt className="text-xs text-slate">Employees</dt><dd className="font-semibold">{tenant.employees.toLocaleString()}</dd></div>
        <div><dt className="text-xs text-slate">Subscription</dt><dd className="font-semibold">{sub ? sub.status.replace('_', ' ') : 'No billing record'}</dd></div>
      </dl>
      <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${overdue.length ? 'border-red-200 bg-red-50' : 'border-line bg-cloud'}`}>
        <div className="font-semibold">{open.length ? `${open.length} open invoice${open.length === 1 ? '' : 's'}: ${fmtN(owed)}${overdue.length ? ` (${overdue.length} overdue)` : ''}` : 'No open invoices'}</div>
        {open.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-slate">{open.slice(0, 4).map((i) => <li key={i.id} className="flex justify-between gap-2"><span><span className="font-mono">{i.number}</span> · {i.status === 'Overdue' ? `${i.daysOverdue} day${i.daysOverdue === 1 ? '' : 's'} overdue` : `due ${i.dueDate}`}</span><span className="num">{fmtN(i.balance)}</span></li>)}</ul>
        ) : <p className="mt-0.5 text-xs text-slate">{sub?.status === 'trial' ? `On trial until ${sub.trialEndsAt ?? 'the trial end'}, nothing invoiced yet.` : 'Everything invoiced to this company has been paid.'}</p>}
        {oldest > 0 && <p className="mt-1 text-xs text-slate">Oldest overdue invoice is {oldest} days late.</p>}
        {sub && <p className="mt-1 text-xs text-slate">From the invoice ledger. Subscription: {sub.status.replace('_', ' ')}.</p>}
      </div>
      {h.actions.length > 0 && <p className="mt-3 text-xs text-slate"><b className="text-ink">Suggested:</b> {h.actions[0]}</p>}
      <div className="mt-3 border-t border-line pt-3">
        <h3 className="text-xs font-semibold text-slate">Other open tickets ({others.length})</h3>
        {others.length === 0 ? <p className="mt-1 text-sm text-slate">None. This is the only open ticket for this company.</p> : (
          <ul className="mt-1 space-y-1">{others.map((o) => <li key={o.id}><button onClick={() => onOpen(o.id)} className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-cloud"><span className="font-mono text-xs text-teal">{o.id}</span><span className="min-w-0 flex-1 truncate">{o.subject}</span><Badge tone={P_TONE[o.priority]}>{o.priority}</Badge></button></li>)}</ul>
        )}
      </div>
    </Panel>
  )
}
