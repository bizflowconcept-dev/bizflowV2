/* Simulated retry run. Rules and the schedule live in retryRules.ts. */
import { subActions } from '../data/billing'
import { unit } from './insights'
import { recordPayment } from './ledger'
import type { Invoice } from './ledger'
import { METHODS } from './ledgerStore'
import type { Method } from './ledgerStore'
import { DEFAULT_RULES, SUCCESS_ODDS, getRules, saveRules, store } from './retryRules'
import type { LogEntry, RetryRule, Run } from './retryRules'
export * from './retryRules'

export function ruleFor(inv: Invoice): RetryRule { return getRules()[inv.method] }

export function runRetries(all: Invoice[], actor: string, offset: number, applyOutcomes: boolean): { run: Run; error: string } {
  const st = store.get(); const rules = getRules(); const runNo = st.runs.length + 1
  const done = (id: string) => st.runs.flatMap((r) => r.entries).filter((e) => e.invoiceId === id && e.outcome !== 'Waiting').reduce((n, e) => Math.max(n, e.attempt), 0)
  const entries: LogEntry[] = []; let recovered = 0; let attempts = 0
  const live = [...all]
  for (const inv of all.filter((i) => i.status === 'Overdue')) {
    const rule = rules[inv.method]; const d = inv.daysOverdue + offset
    if (!rule.enabled) { entries.push({ id: `${inv.id}:skip`, invoiceId: inv.id, number: inv.number, tenant: inv.tenant.name, method: inv.method, attempt: 0, daysOverdue: d, amount: inv.balance, outcome: 'Waiting', note: `Retries are switched off for ${inv.method.toLowerCase()}.` }); continue }
    const due = rule.spacing.filter((x) => x <= d).length
    let made = done(inv.id); let paid = false
    if (made >= due && made < rule.spacing.length) {
      entries.push({ id: `${inv.id}:wait`, invoiceId: inv.id, number: inv.number, tenant: inv.tenant.name, method: inv.method, attempt: made, daysOverdue: d, amount: inv.balance, outcome: 'Waiting', note: `Next retry on day ${rule.spacing[made]} (${rule.spacing[made] - d} day${rule.spacing[made] - d === 1 ? '' : 's'} away).` })
    }
    while (made < due && !paid) {
      made++; attempts++
      const ok = unit(`${inv.id}:${made}:${runNo}`) < (SUCCESS_ODDS[inv.method][made - 1] ?? 0.05)
      if (ok) {
        const err = recordPayment(live, inv, inv.balance, inv.method, `RETRY-${Math.floor(unit(`${inv.id}:ref:${made}`) * 900000 + 100000)}`, `Automatic retry ${made} of ${rule.spacing.length}`, 'Retry engine')
        if (!err) { paid = true; recovered += inv.balance }
        entries.push({ id: `${inv.id}:${made}`, invoiceId: inv.id, number: inv.number, tenant: inv.tenant.name, method: inv.method, attempt: made, daysOverdue: d, amount: inv.balance, outcome: err ? 'Failed' : 'Recovered', note: err || `Attempt ${made} succeeded${rule.notify ? ', receipt sent to the customer' : ''}.` })
      } else {
        entries.push({ id: `${inv.id}:${made}`, invoiceId: inv.id, number: inv.number, tenant: inv.tenant.name, method: inv.method, attempt: made, daysOverdue: d, amount: inv.balance, outcome: 'Failed', note: `${inv.method === 'Card' ? 'Card declined' : inv.method === 'Bank transfer' ? 'No transfer received' : 'Debit rejected'} on attempt ${made}${rule.notify ? '; customer notified' : ''}.` })
      }
    }
    if (!paid && made >= rule.spacing.length && (d >= rule.downgradeAfter)) {
      const action: 'Downgrade' | 'Suspend' = d >= rule.suspendAfter ? 'Suspend' : 'Downgrade'
      const had = st.escalations[inv.tenant.id]
      if (!had || (had.action === 'Downgrade' && action === 'Suspend')) {
        let applied = false
        if (applyOutcomes && inv.tenant.real) {
          if (action === 'Suspend') subActions.suspend(inv.tenant.id, actor)
          else subActions.setStatus(inv.tenant.id, 'grace', actor)
          applied = true
        }
        store.set((s) => ({ ...s, escalations: { ...s.escalations, [inv.tenant.id]: { action, at: '2026-10-08', applied } } }))
        entries.push({ id: `${inv.id}:esc`, invoiceId: inv.id, number: inv.number, tenant: inv.tenant.name, method: inv.method, attempt: made, daysOverdue: d, amount: inv.balance, outcome: 'Escalated', action, note: `${action === 'Suspend' ? 'Suspend' : 'Downgrade to starter limits'} rule reached at day ${d}${applied ? ' and applied to the subscription' : ' (recorded only, not applied)'}.` })
      }
    }
  }
  const run: Run = { id: `RUN-${String(runNo).padStart(3, '0')}`, at: '2026-10-08', by: actor, offset, applied: applyOutcomes, entries, recovered, attempts }
  store.set((s) => ({ ...s, runs: [run, ...s.runs].slice(0, 20) }))
  return { run, error: '' }
}

export function resetRules(actor: string) { return saveRules(DEFAULT_RULES, actor, 'Restored default retry rules') }

export function recoveryStats(runs: Run[]) {
  const entries = runs.flatMap((r) => r.entries).filter((e) => e.attempt > 0 && (e.outcome === 'Recovered' || e.outcome === 'Failed'))
  const by = METHODS.map((m) => { const e = entries.filter((x) => x.method === m); const ok = e.filter((x) => x.outcome === 'Recovered'); return { method: m, attempts: e.length, recovered: ok.length, amount: ok.reduce((n, x) => n + x.amount, 0), rate: e.length ? ok.length / e.length : 0 } })
  const ok = entries.filter((e) => e.outcome === 'Recovered')
  return { attempts: entries.length, recovered: ok.length, amount: ok.reduce((n, e) => n + e.amount, 0), rate: entries.length ? ok.length / entries.length : 0, avgAttempts: ok.length ? ok.reduce((n, e) => n + e.attempt, 0) / ok.length : 0, by }
}
