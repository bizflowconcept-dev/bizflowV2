import { useMemo, useState } from 'react'
import { Badge, Btn, EmptyState, Field, PageHeader, Panel, Table, inputCls, useToast } from '../../components/ui'
import { useAdmin } from './AdminLayout'
import { fmtN, useInvoices } from '../../billing/ledger'
import { METHODS } from '../../billing/ledgerStore'
import type { Method } from '../../billing/ledgerStore'
import { MAX_ATTEMPTS, recoveryStats, resetRules, runRetries, saveRules, useRecovery, validateRule } from '../../billing/recovery'
import type { RetryRule, Rules } from '../../billing/recovery'

const toDays = (v: string) => v.split(/[,\s]+/).filter(Boolean).map(Number)
const same = (a: Rules, b: Rules) => JSON.stringify(a) === JSON.stringify(b)

export default function PaymentRecovery() {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const st = useRecovery()
  const { invoices } = useInvoices()
  const edit = can('payments')
  const [draft, setDraft] = useState<Rules | null>(null)
  const [spacingText, setSpacingText] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [offset, setOffset] = useState(0)
  const [apply, setApply] = useState(false)
  const rules = draft ?? st.rules
  const stats = useMemo(() => recoveryStats(st.runs), [st.runs])
  const overdue = invoices.filter((i) => i.status === 'Overdue')
  const latest = st.runs[0]
  const dirty = !!draft && !same(draft, st.rules)

  const patch = (m: Method, p: Partial<RetryRule>) => setDraft({ ...rules, [m]: { ...rules[m], ...p } })
  const errors = (m: Method) => validateRule(rules[m])
  const save = () => {
    if (!draft) return
    const changed = METHODS.filter((m) => JSON.stringify(draft[m]) !== JSON.stringify(st.rules[m]))
    const e = saveRules(draft, actor, `Updated retry rules: ${changed.join(', ') || 'no change'}`)
    if (e) { setErr(e); return }
    setErr(''); setDraft(null); setSpacingText({}); toast('Retry rules saved')
  }
  const run = () => {
    const { error } = runRetries(invoices, actor, offset, apply)
    if (error) { toast(error, 'err'); return }
    toast('Retry run complete')
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Finance" title="Payment recovery" desc="Decide how many times, and when, BizFlow retries an overdue invoice before it downgrades or suspends the workspace." actions={<Btn v="secondary" to="/admin/billing/invoices">Invoices</Btn>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Overdue now', fmtN(overdue.reduce((n, i) => n + i.balance, 0)), `${overdue.length} invoices`], ['Recovered by retries', fmtN(stats.amount), `${stats.recovered} payments`], ['Retry success rate', stats.attempts ? `${Math.round(stats.rate * 100)}%` : 'No runs yet', `${stats.attempts} attempts`], ['Attempts to recover', stats.recovered ? stats.avgAttempts.toFixed(1) : 'n/a', 'Average per recovered invoice']].map(([l, v, h]) => (
          <div key={l} className="rounded-xl border border-line bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate">{l}</div><div className="num mt-1 text-2xl font-bold">{v}</div><div className="mt-0.5 text-xs text-slate">{h}</div></div>
        ))}
      </div>

      <Panel title="Retry rules by payment method" action={<span className="text-xs text-slate">Last changed {st.updatedAt} by {st.updatedBy}</span>}>
        <div className="grid gap-4 lg:grid-cols-3">
          {METHODS.map((m) => {
            const r = rules[m]; const es = errors(m)
            return (
              <fieldset key={m} disabled={!edit} className="space-y-3 rounded-lg border border-line p-4">
                <legend className="px-1 text-sm font-semibold">{m}</legend>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.enabled} onChange={(e) => patch(m, { enabled: e.target.checked })} /> Retry automatically</label>
                <Field label="Retry on these days overdue" hint={`Up to ${MAX_ATTEMPTS}, increasing, e.g. 1, 3, 5, 7`}>
                  <input className={inputCls} value={spacingText[m] ?? r.spacing.join(', ')} onChange={(e) => { setSpacingText({ ...spacingText, [m]: e.target.value }); patch(m, { spacing: toDays(e.target.value) }) }} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Downgrade on day"><input type="number" min={1} className={inputCls} value={r.downgradeAfter} onChange={(e) => patch(m, { downgradeAfter: Number(e.target.value) })} /></Field>
                  <Field label="Suspend on day"><input type="number" min={1} className={inputCls} value={r.suspendAfter} onChange={(e) => patch(m, { suspendAfter: Number(e.target.value) })} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.notify} onChange={(e) => patch(m, { notify: e.target.checked })} /> Tell the customer after each attempt</label>
                {es.length > 0 && <ul role="alert" className="space-y-0.5 text-[13px] text-err">{es.map((e) => <li key={e}>{e}</li>)}</ul>}
              </fieldset>
            )
          })}
        </div>
        {err && <p role="alert" className="mt-3 text-sm text-err">{err}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {edit ? <>
            <Btn onClick={save} disabled={!dirty || METHODS.some((m) => errors(m).length > 0)}>Save rules</Btn>
            <Btn v="ghost" onClick={() => { setDraft(null); setSpacingText({}); setErr('') }} disabled={!dirty}>Discard</Btn>
            <Btn v="ghost" onClick={() => { const e = resetRules(actor); if (e) setErr(e); else { setDraft(null); setSpacingText({}); toast('Default rules restored') } }}>Restore defaults</Btn>
          </> : <span className="text-sm text-slate">Your role can view the rules but not change them.</span>}
          <span className="text-xs text-slate">The reminder timeline on Collections follows the card rule.</span>
        </div>
      </Panel>

      <Panel title="Simulate a retry run">
        <p className="text-sm text-slate">Runs the current saved rules against today&apos;s overdue invoices with a repeatable pseudo-random outcome. Recovered invoices are paid in the ledger. Nothing is charged for real.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Move the clock forward (days)"><input type="number" min={0} max={30} className={inputCls} value={offset} onChange={(e) => setOffset(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} /></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} /> Apply downgrade and suspend to real subscriptions</label>
          <Btn onClick={run} disabled={!edit || dirty}>Run retries now</Btn>
        </div>
        {dirty && <p className="mt-2 text-xs text-slate">Save or discard your rule changes before running.</p>}
      </Panel>

      <Panel title={latest ? `Latest run ${latest.id}` : 'Retry log'} pad={false} action={latest && <Badge tone={latest.applied ? 'amber' : 'gray'}>{latest.applied ? 'Escalations applied' : 'Escalations recorded only'}</Badge>}>
        {!latest ? <EmptyState title="No runs yet" body="Run the retries to see each attempt, its outcome and any escalation here." /> : (
          <Table label="Retry log" head={['Invoice', 'Tenant', 'Method', 'Day', 'Attempt', 'Outcome', 'Amount', 'Detail']} right={[6]} pageSize={10}
            rows={latest.entries.map((e) => [e.number, e.tenant, e.method, String(e.daysOverdue), e.attempt ? String(e.attempt) : '-', <Badge key="o" tone={e.outcome === 'Recovered' ? 'green' : e.outcome === 'Failed' ? 'red' : e.outcome === 'Escalated' ? 'amber' : 'gray'}>{e.outcome}</Badge>, fmtN(e.amount), e.note])} />
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Recovery by method" pad={false}>
          <Table label="Recovery by method" head={['Method', 'Attempts', 'Recovered', 'Rate', 'Amount']} right={[1, 2, 3, 4]} pageSize={3} rows={stats.by.map((b) => [b.method, String(b.attempts), String(b.recovered), b.attempts ? `${Math.round(b.rate * 100)}%` : '-', fmtN(b.amount)])} />
        </Panel>
        <Panel title="Rule changes">
          {st.history.length === 0 ? <p className="text-sm text-slate">Default rules are in force. Changes are listed here and in the audit log.</p> : <ul className="space-y-1.5 text-[13px] text-slate">{st.history.map((h, i) => <li key={i}>{h.at}: {h.summary} ({h.by})</li>)}</ul>}
        </Panel>
      </div>
    </div>
  )
}
