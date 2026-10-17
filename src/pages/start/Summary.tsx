import type { ReactNode } from 'react'
import { BadgePercent, PiggyBank, X } from 'lucide-react'
import { Badge, inputCls } from '../../components/ui'
import { money } from '../../data/billing'
import type { BillingState } from '../../data/billing'
import type { Order } from '../../data/signup'

type Props = {
  billing: BillingState; order: Order; company: string; planName: string; employees: number; annual: boolean
  coupon: { input: string; applied: string; message: string; ok: boolean; editable: boolean; onInput: (v: string) => void; onApply: () => void; onRemove: () => void }
  status: ReactNode; children: ReactNode; showLines: boolean
}

export default function Summary({ billing, order, company, planName, employees, annual, coupon, status, children, showLines }: Props) {
  const m = (n: number) => money(n, 'NGN', { s: billing })
  const t = (n: number) => money(n, 'NGN', { trim: true, s: billing })
  const sv = order.savings
  return (
    <aside className="h-fit rounded-lg border border-line bg-white p-5 lg:sticky lg:top-6" aria-label="Order summary">
      <h2 className="font-display text-base font-semibold">Order summary</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate">Company</dt><dd className="max-w-[170px] truncate font-medium">{company || '—'}</dd></div>
        <div className="flex justify-between"><dt className="text-slate">Plan</dt><dd className="font-medium">{planName || 'Not chosen yet'}</dd></div>
        <div className="flex justify-between"><dt className="text-slate">Billing</dt><dd className="font-medium">{annual ? 'Annual' : 'Monthly'}</dd></div>
        <div className="flex justify-between"><dt className="text-slate">Employees</dt><dd className="num font-medium">{employees || '—'}</dd></div>
        {showLines && (
          <>
            <div className="flex justify-between"><dt className="text-slate">Modules</dt><dd className="num font-medium">{order.modules.length}</dd></div>
            <div className="max-h-44 space-y-1.5 overflow-y-auto border-t border-line pt-2 pr-1">
              {order.mq.lines.map((l) => <div key={l.moduleId} className="flex justify-between gap-3 text-xs"><dt className="truncate text-slate">{l.label}</dt><dd className="num whitespace-nowrap">{t(l.amount)}</dd></div>)}
              {order.addons.map((a) => <div key={a.id} className="flex justify-between gap-3 text-xs"><dt className="truncate text-slate">{a.name} <span className="text-teal">add-on</span></dt><dd className="num whitespace-nowrap">{t(a.amount)}</dd></div>)}
            </div>
            {order.mq.bundles.map((b) => <div key={b.id} className="flex justify-between gap-3 text-xs"><dt className="truncate text-ok">{b.name} bundle</dt><dd className="num whitespace-nowrap text-ok">−{t(b.amount)}</dd></div>)}
            {order.mq.minimumAdjustment > 0 && <div className="flex justify-between gap-3 text-xs"><dt className="text-slate">Starter minimum adjustment</dt><dd className="num">{t(order.mq.minimumAdjustment)}</dd></div>}
          </>
        )}
        {order.discounts.map((d) => <div key={d.label + d.amount} className="flex justify-between gap-3 text-xs"><dt className="truncate text-ok">{d.label}</dt><dd className="num whitespace-nowrap text-ok">−{t(d.amount)}</dd></div>)}
        <div className="flex justify-between border-t border-line pt-2"><dt className="text-slate">Subtotal</dt><dd className="num font-medium">{m(order.net)}</dd></div>
        {order.setup > 0 && <div className="flex justify-between"><dt className="text-slate">One-time setup</dt><dd className="num font-medium">{m(order.setup)}</dd></div>}
        <div className="flex justify-between"><dt className="text-slate">VAT ({order.vatRate}%)</dt><dd className="num font-medium">{m(order.vat)}</dd></div>
        <div className="flex justify-between border-t border-line pt-3 text-base"><dt className="font-semibold">{annual ? 'Total due (annual)' : 'Total due (monthly)'}</dt><dd className="num font-display font-semibold" aria-live="polite">{m(order.total)}</dd></div>
      </dl>
      {showLines && order.modules.length > 0 && (
        <div className="mt-3 space-y-1 rounded-md bg-cloud p-3 text-xs text-slate">
          <div className="flex justify-between"><span>Effective monthly cost</span><b className="num text-ink">{m(order.monthly)}</b></div>
          <div className="flex justify-between"><span>Per employee / month</span><b className="num text-ink">{m(order.perEmployee)}</b></div>
        </div>
      )}
      {sv.total > 0 && (
        <div className="mt-3 rounded-md border border-ok/30 bg-ok/5 p-3 text-xs" role="status">
          <div className="flex items-center gap-1.5 font-semibold text-ok"><PiggyBank size={14} />You save {m(sv.total)}</div>
          <ul className="mt-1 space-y-0.5 text-slate">
            {sv.annual > 0 && <li className="flex justify-between"><span>Annual billing</span><span className="num">{t(sv.annual)}</span></li>}
            {sv.bundles > 0 && <li className="flex justify-between"><span>Bundles</span><span className="num">{t(sv.bundles)}</span></li>}
            {sv.modules > 0 && <li className="flex justify-between"><span>Module discounts</span><span className="num">{t(sv.modules)}</span></li>}
            {sv.coupon > 0 && <li className="flex justify-between"><span>Promotions and coupon</span><span className="num">{t(sv.coupon)}</span></li>}
          </ul>
        </div>
      )}
      {coupon.editable && (
        <div className="mt-4">
          {coupon.applied ? (
            <div className="flex items-center justify-between rounded-md border border-ok/30 bg-ok/5 px-3 py-2 text-sm"><span className="flex items-center gap-1.5 font-semibold text-ok"><BadgePercent size={15} />{coupon.applied}<Badge tone="green">Applied</Badge></span><button type="button" onClick={coupon.onRemove} aria-label="Remove coupon" className="cursor-pointer text-slate hover:text-ink"><X size={15} /></button></div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); coupon.onApply() }} className="flex gap-2">
              <input aria-label="Coupon code" value={coupon.input} onChange={(e) => coupon.onInput(e.target.value.toUpperCase())} placeholder="Coupon code" className={`${inputCls} font-mono uppercase`} />
              <button type="submit" disabled={!coupon.input.trim()} className="h-10 cursor-pointer rounded-md border border-line px-3 text-sm font-semibold text-teal hover:border-teal disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
            </form>
          )}
          {coupon.message && !coupon.applied && <p role="status" className={`mt-1.5 text-xs ${coupon.ok ? 'text-ok' : 'text-err'}`}>{coupon.message}</p>}
        </div>
      )}
      <div className="mt-5 space-y-2">{children}</div>
      <div className="mt-4 text-xs text-slate">Payment status: {status}</div>
    </aside>
  )
}
