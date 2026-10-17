import { useState } from 'react'
import { Btn, Field, Panel, useToast } from '../../../components/ui'
import { PRIORITIES, SLA_PLANS, resetPolicies, savePolicies, usePolicies } from '../../../platform/helpdeskConfig'
import type { PolicyTable } from '../../../platform/helpdeskConfig'

export default function SlaPolicies({ manage, by }: { manage: boolean; by: string }) {
  const saved = usePolicies()
  const toast = useToast()
  const [draft, setDraft] = useState<PolicyTable | null>(null)
  const cur = draft ?? saved
  const edit = (plan: string, p: (typeof PRIORITIES)[number], k: 'first' | 'resolve', v: string) => {
    const n = Number(v)
    setDraft({ ...cur, [plan]: { ...cur[plan], [p]: { ...cur[plan][p], [k]: Number.isFinite(n) ? n : 0 } } })
  }
  const errors: string[] = []
  for (const plan of SLA_PLANS) for (const p of PRIORITIES) {
    const x = cur[plan]?.[p]; if (!x) continue
    if (x.first <= 0 || x.resolve <= 0) errors.push(`${plan} ${p}: hours must be above zero`)
    else if (x.first > x.resolve) errors.push(`${plan} ${p}: first response cannot be longer than resolution`)
  }
  return (
    <div className="space-y-4">
      <Panel title="How the clocks work">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate">
          <li><b className="text-ink">First response</b> runs from creation until the first public reply. Internal notes do not stop it, and it never pauses.</li>
          <li><b className="text-ink">Resolution</b> runs until the ticket is Resolved and pauses while the status is Waiting on customer.</li>
          <li>A ticket is <b className="text-ink">at risk</b> when a running clock has used more than 75% of its window or has under an hour left.</li>
          <li>The policy row is chosen by the company plan and the ticket priority. Changes apply to open tickets straight away and are written to the audit log.</li>
        </ul>
      </Panel>
      {SLA_PLANS.map((plan) => (
        <Panel key={plan} title={`${plan} plan`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="sr-only">{plan} SLA policy in hours</caption>
              <thead><tr className="text-left text-xs text-slate"><th scope="col" className="pb-2 font-medium">Priority</th><th scope="col" className="pb-2 font-medium">First response (hours)</th><th scope="col" className="pb-2 font-medium">Resolution (hours)</th></tr></thead>
              <tbody>{PRIORITIES.map((p) => (
                <tr key={p} className="border-t border-line/70">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">{p}</th>
                  {(['first', 'resolve'] as const).map((k) => (
                    <td key={k} className="py-2 pr-3"><input type="number" min={0.25} step={0.25} disabled={!manage} aria-label={`${plan} ${p} ${k === 'first' ? 'first response' : 'resolution'} hours`} className="h-9 w-28 rounded-md border border-line bg-white px-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:bg-cloud" value={cur[plan]?.[p]?.[k] ?? ''} onChange={(e) => edit(plan, p, k, e.target.value)} /></td>
                  ))}
                </tr>))}</tbody>
            </table>
          </div>
        </Panel>
      ))}
      {errors.length > 0 && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-err">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      {manage ? (
        <div className="flex flex-wrap gap-2">
          <Btn disabled={!draft || errors.length > 0} onClick={() => { savePolicies(draft!, by); setDraft(null); toast('SLA policies saved') }}>Save policies</Btn>
          <Btn v="secondary" disabled={!draft} onClick={() => setDraft(null)}>Discard changes</Btn>
          <Btn v="ghost" onClick={() => { resetPolicies(by); setDraft(null); toast('Policies reset to defaults') }}>Reset to defaults</Btn>
        </div>
      ) : <Field label="Read only"><p className="text-sm text-slate">You need the Manage Support permission to change SLA policies.</p></Field>}
    </div>
  )
}
