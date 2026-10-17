import { Link } from 'react-router'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { Badge, Panel } from '../components/ui'
import { ngn } from '../data/demo'
import { vendorsForTenant } from '../data/vendors'
import { invoicesFor, useCompliance } from './store'

const money = (n: number) => (n >= 1e6 ? `₦${(n / 1e6).toFixed(1)}M` : ngn(n))

export default function VendorAnalytics({ slug }: { slug: string }) {
  const state = useCompliance()
  const vendors = vendorsForTenant(slug)
  const inv = invoicesFor(state, slug)
  const open = inv.filter((i) => i.state !== 'paid')
  const sum = (xs: typeof inv) => xs.reduce((a, i) => a + i.amount, 0)
  const overdue = open.filter((i) => i.state === 'overdue')
  const severe = overdue.filter((i) => i.overdueDays > 30)
  const soon = open.filter((i) => i.state === 'due-soon')
  const paid = inv.filter((i) => i.state === 'paid')
  const avg = (k: 'onTime' | 'quality' | 'compliance') => Math.round(vendors.reduce((a, v) => a + v[k], 0) / Math.max(1, vendors.length))
  const flagged = vendors.filter((v) => v.status !== 'Active').length
  const buckets: [string, number, number, string][] = [
    ['Overdue over 30 days', sum(severe), severe.length, 'bg-err'],
    ['Overdue up to 30 days', sum(overdue) - sum(severe), overdue.length - severe.length, 'bg-warn'],
    ['Due within 7 days', sum(soon), soon.length, 'bg-info'],
    ['Due later', sum(open) - sum(overdue) - sum(soon), open.length - overdue.length - soon.length, 'bg-teal'],
  ]
  const max = Math.max(1, ...buckets.map((b) => b[1]))
  const watch = Object.values(overdue.reduce<Record<string, { name: string; cat: string; amt: number; days: number; reason: boolean; status: string }>>((m, i) => {
    const c = m[i.vendor.id] ?? { name: i.vendor.name, cat: i.vendor.category, amt: 0, days: 0, reason: true, status: i.vendor.status }
    c.amt += i.amount; c.days = Math.max(c.days, i.overdueDays); c.reason = c.reason && !i.needsReason; m[i.vendor.id] = c; return m
  }, {})).sort((a, b) => b.amt - a.amt).slice(0, 5)

  const stats: [string, string, string, boolean?][] = [
    ['Outstanding to vendors', money(sum(open)), `${open.length} unpaid invoices across ${new Set(open.map((i) => i.vendor.id)).size} vendors`],
    ['Overdue', money(sum(overdue)), `${overdue.length} invoices, ${severe.length} past 30 days`, overdue.length > 0],
    ['Due in 7 days', money(sum(soon)), `${soon.length} invoices to schedule`],
    ['Paid this cycle', money(sum(paid)), `${paid.length} invoices settled with a payment reference`],
  ]
  return (
    <section aria-label="Vendor analytics" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div><div className="text-xs font-semibold uppercase tracking-wider text-teal">Vendor analytics</div><h2 className="mt-1 font-display text-xl font-semibold">What you owe, who is late, who is at risk</h2></div>
        <Link to="/admin/business/vendors" className="inline-flex items-center gap-1 text-xs font-semibold text-teal">Open vendors <ArrowRight size={13} /></Link>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(([l, v, d, bad]) => <Panel key={l}><div className="text-xs font-semibold uppercase tracking-wider text-slate">{l}</div><div className={`num mt-1 text-2xl font-semibold ${bad ? 'text-err' : ''}`}>{v}</div><div className="mt-1 text-xs text-slate">{d}</div></Panel>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Payables ageing">
          <div className="space-y-3.5">
            {buckets.map(([l, v, n, c]) => <div key={l}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span>{l}</span><span className="num font-semibold">{money(v)} <span className="font-sans text-xs font-normal text-slate">· {n}</span></span></div><div className="h-2 overflow-hidden rounded-full bg-cloud"><div className={`h-full rounded-full ${c}`} style={{ width: `${Math.max(v ? 3 : 0, (v / max) * 100)}%` }} /></div></div>)}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-center sm:grid-cols-4">
            {[['On-time delivery', `${avg('onTime')}%`], ['Quality', `${avg('quality')}%`], ['Compliance', `${avg('compliance')}%`], ['Watchlist / suspended', String(flagged)]].map(([l, v]) => <div key={l}><div className="num text-lg font-semibold">{v}</div><div className="text-[11px] text-slate">{l}</div></div>)}
          </div>
        </Panel>
        <Panel title="Vendors needing action" action={<Badge tone={watch.length ? 'red' : 'green'}>{watch.length} overdue</Badge>}>
          {watch.length === 0 ? <p className="text-sm text-slate">No vendor has an overdue invoice.</p> : (
            <ul className="divide-y divide-line">
              {watch.map((w) => (
                <li key={w.name} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0"><div className="text-sm font-semibold">{w.name}</div><div className="text-xs text-slate">{w.cat} · {w.days} days overdue</div>
                    {!w.reason && <div className="mt-1 flex items-center gap-1 text-xs text-err"><CircleAlert size={12} />Delay reason not logged</div>}</div>
                  <div className="num shrink-0 text-sm font-semibold">{money(w.amt)}</div>
                </li>))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  )
}
