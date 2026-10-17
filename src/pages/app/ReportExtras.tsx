import { useState } from 'react'
import { Badge, Btn, ExportButton, Field, inputCls, Overlay, Panel, useToast } from '../../components/ui'
import { ROLES } from '../../components/app/AppLayout'
import type { RoleKey } from '../../components/app/AppLayout'
import { employeesForTenant } from '../../data/demo'
import { DEPARTMENT_MODULES, recordAudit } from '../../tenant/store'
import type { Department } from '../../tenant/store'

/* ---------- Report scheduling ---------- */
export type Schedule = { id: string; report: string; reportTitle: string; frequency: 'Weekly' | 'Monthly'; day: string; format: 'PDF' | 'CSV'; recipients: string[]; by: string; last?: string }
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const MONTH_DAYS = ['1st', '5th', '15th', 'Last day']

export function ReportSchedules({ slug, by, reports, activeId, canManage }: { slug: string; by: string; reports: { id: string; title: string }[]; activeId: string; canManage: boolean }) {
  const toast = useToast()
  const key = `bf-report-schedules-${slug}`
  const [list, setList] = useState<Schedule[]>(() => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } })
  const [draft, setDraft] = useState<Schedule | null>(null)
  const people = employeesForTenant(slug).filter((e) => e.status === 'Active')
  const visible = list.filter((s) => reports.some((r) => r.id === s.report))
  const persist = (next: Schedule[]) => { setList(next); try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* storage full */ } }
  const blank = (): Schedule => { const r = reports.find((x) => x.id === activeId) ?? reports[0]; return { id: '', report: r.id, reportTitle: r.title, frequency: 'Weekly', day: 'Monday', format: 'PDF', recipients: [], by } }
  const describe = (s: Schedule) => `${s.reportTitle}, ${s.frequency.toLowerCase()} on ${s.frequency === 'Weekly' ? s.day : s.day + ' of the month'} as ${s.format} to ${s.recipients.length} recipient${s.recipients.length === 1 ? '' : 's'}`
  const save = () => {
    if (!draft || !draft.recipients.length) return
    const isNew = !draft.id
    const item = { ...draft, id: draft.id || Date.now().toString(36) }
    persist(isNew ? [...list, item] : list.map((s) => (s.id === item.id ? item : s)))
    recordAudit(slug, isNew ? 'Report scheduled' : 'Report schedule changed', undefined, describe(item), { category: 'General', ref: item.id })
    setDraft(null); toast(isNew ? 'Report scheduled.' : 'Schedule updated.')
  }
  const remove = (s: Schedule) => { persist(list.filter((x) => x.id !== s.id)); recordAudit(slug, 'Report schedule removed', describe(s), undefined, { category: 'General', ref: s.id }); toast('Schedule removed.') }
  const sendNow = (s: Schedule) => { persist(list.map((x) => (x.id === s.id ? { ...x, last: new Date().toISOString() } : x))); recordAudit(slug, 'Scheduled report sent', undefined, describe(s), { category: 'General', ref: s.id }); toast(`${s.reportTitle} (${s.format}) sent to ${s.recipients.length} recipient${s.recipients.length === 1 ? '' : 's'}.`) }
  const toggle = (id: string) => draft && setDraft({ ...draft, recipients: draft.recipients.includes(id) ? draft.recipients.filter((x) => x !== id) : [...draft.recipients, id] })
  return (
    <Panel title="Scheduled reports" action={canManage ? <Btn s="sm" onClick={() => setDraft(blank())}>Schedule report</Btn> : undefined}>
      {visible.length === 0 ? <p className="text-sm text-slate">No scheduled reports. Schedule one to email it to colleagues weekly or monthly.</p> : (
        <ul className="divide-y divide-line">
          {visible.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{s.reportTitle}</div><div className="text-xs text-slate">{s.frequency} · {s.frequency === 'Weekly' ? s.day : `${s.day} of the month`} · {s.recipients.length} recipient{s.recipients.length === 1 ? '' : 's'}{s.last ? ` · last sent ${new Date(s.last).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</div></div>
              <Badge>{s.format}</Badge>
              {canManage && <div className="flex gap-1"><Btn s="sm" v="secondary" onClick={() => sendNow(s)}>Send now</Btn><Btn s="sm" v="ghost" onClick={() => setDraft(s)}>Edit</Btn><Btn s="sm" v="ghost" onClick={() => remove(s)}>Delete</Btn></div>}
            </li>
          ))}
        </ul>
      )}
      <Overlay open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit report schedule' : 'Schedule report'}>
        {draft && (
          <div className="space-y-4">
            <Field label="Report"><select className={inputCls} value={draft.report} onChange={(e) => setDraft({ ...draft, report: e.target.value, reportTitle: reports.find((r) => r.id === e.target.value)?.title ?? '' })}>{reports.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Frequency"><select className={inputCls} value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as Schedule['frequency'], day: e.target.value === 'Weekly' ? 'Monday' : '1st' })}><option>Weekly</option><option>Monthly</option></select></Field>
              <Field label={draft.frequency === 'Weekly' ? 'Day' : 'Day of month'}><select className={inputCls} value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })}>{(draft.frequency === 'Weekly' ? DAYS : MONTH_DAYS).map((d) => <option key={d}>{d}</option>)}</select></Field>
              <Field label="Format"><select className={inputCls} value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value as Schedule['format'] })}><option>PDF</option><option>CSV</option></select></Field>
            </div>
            <Field label={`Recipients (${draft.recipients.length})`}>
              <div className="max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {people.map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"><input type="checkbox" className="size-4 accent-teal" checked={draft.recipients.includes(p.id)} onChange={() => toggle(p.id)} /><span className="flex-1">{p.name}</span><span className="text-xs text-slate">{p.role}</span></label>)}
              </div>
            </Field>
            <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setDraft(null)}>Cancel</Btn><Btn disabled={!draft.recipients.length} onClick={save}>{draft.id ? 'Save changes' : 'Schedule'}</Btn></div>
          </div>
        )}
      </Overlay>
    </Panel>
  )
}

/* ---------- Permissions matrix (derived, read-only) ---------- */
const ROLE_KEYS = (Object.keys(ROLES) as RoleKey[])
const MODULE_NAMES: Record<string, string> = { dashboard: 'Dashboard', performance: 'Performance', my: 'My BizFlow', leave: 'Leave', attendance: 'Attendance', organization: 'Organisation', travel: 'Travel', vendors: 'Vendors', approvals: 'Approvals', tasks: 'Tasks', crm: 'CRM', documents: 'Documents', sign: 'Sign', people: 'Employees', payroll: 'Payroll', accounting: 'Accounting', procurement: 'Procurement', assets: 'Assets', fleet: 'Fleet', health: 'Health', reports: 'Reports', settings: 'Settings' }
const hasMod = (k: RoleKey, m: string) => ROLES[k].modules.includes(m)
const hasPerm = (k: RoleKey, p: string) => ROLES[k].can.includes(p as never)
const Mark = ({ on }: { on: boolean }) => on ? <span className="font-semibold text-ok" aria-label="Allowed">Yes</span> : <span className="text-slate/50" aria-label="Not allowed">-</span>

export function PermissionsMatrix({ departments }: { departments: Department[] }) {
  const [view, setView] = useState<'modules' | 'features'>('modules')
  const modules = Object.keys(MODULE_NAMES).filter((m) => ROLE_KEYS.some((k) => hasMod(k, m)))
  const perms = Array.from(new Set(ROLE_KEYS.flatMap((k) => ROLES[k].can))).sort()
  const cols = view === 'modules' ? modules.map((m) => MODULE_NAMES[m]) : perms
  const cell = (k: RoleKey, i: number) => view === 'modules' ? hasMod(k, modules[i]) : hasPerm(k, perms[i])
  const head = ['Role', ...cols]
  const rows = ROLE_KEYS.map((k) => [ROLES[k].title, ...cols.map((_, i) => (cell(k, i) ? 'Yes' : 'No'))])
  const dm = DEPARTMENT_MODULES.filter((m) => m.id !== 'performance')
  return (
    <div className="space-y-5">
      <Panel title="Permissions matrix" action={<div className="flex gap-2"><div role="group" aria-label="Matrix view" className="flex overflow-hidden rounded-md border border-line text-sm">{(['modules', 'features'] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`cursor-pointer px-3 py-1.5 font-semibold ${view === v ? 'bg-teal text-white' : 'bg-white text-slate'}`}>{v === 'modules' ? 'Modules' : 'Features'}</button>)}</div><ExportButton name={`permissions-${view}`} head={head} rows={rows} /></div>}>
        <p className="mb-3 text-sm text-slate">What each standard role can open{view === 'features' ? ' and do' : ''}. Business owners and admins have full access. This view is derived from the role definitions and cannot be edited here.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead><tr className="text-left text-xs text-slate"><th className="sticky left-0 bg-white py-2 pr-4 font-medium">Role</th>{cols.map((c) => <th key={c} className="px-2 py-2 text-center font-medium">{c}</th>)}</tr></thead>
            <tbody>{ROLE_KEYS.map((k) => <tr key={k} className="border-t border-line"><td className="sticky left-0 bg-white py-2 pr-4 font-medium">{ROLES[k].title}<div className="text-xs font-normal text-slate">{ROLES[k].scope === 'Own' ? 'Own records' : 'Company scope'}</div></td>{cols.map((c, i) => <td key={c} className="px-2 py-2 text-center"><Mark on={cell(k, i)} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Department overrides">
        {departments.length === 0 ? <p className="text-sm text-slate">No department policies. Staff use the standard role access above.</p> : (
          <div className="overflow-x-auto">
            <p className="mb-3 text-sm text-slate">A department policy replaces the standard module list for its members. Create or edit departments above.</p>
            <table className="w-full min-w-max text-sm">
              <thead><tr className="text-left text-xs text-slate"><th className="py-2 pr-4 font-medium">Department</th><th className="px-2 py-2 font-medium">Base role</th>{dm.map((m) => <th key={m.id} className="px-2 py-2 text-center font-medium">{m.name}</th>)}</tr></thead>
              <tbody>{departments.map((d) => <tr key={d.id} className="border-t border-line"><td className="py-2 pr-4 font-medium">{d.name}<div className="text-xs font-normal text-slate">{d.memberEmails.length} member{d.memberEmails.length === 1 ? '' : 's'}</div></td><td className="px-2 py-2"><Badge tone="teal">{d.roleKey}</Badge></td>{dm.map((m) => { const on = d.modules.includes(m.id); const n = m.features.filter((f) => d.features.includes(f.id)).length; return <td key={m.id} className="px-2 py-2 text-center">{on ? <span className="font-semibold text-ok" title={m.features.filter((f) => d.features.includes(f.id)).map((f) => f.name).join(', ')}>{n}/{m.features.length}</span> : <span className="text-slate/50">-</span>}</td> })}</tr>)}</tbody>
            </table>
            <p className="mt-2 text-xs text-slate">Numbers show features enabled out of those available in the module.</p>
          </div>
        )}
      </Panel>
    </div>
  )
}
