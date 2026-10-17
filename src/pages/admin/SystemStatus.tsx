import { useState } from 'react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { QUEUE, SERVICE_LIST, createIncident, publishRelease, updateIncident, useIncidents, useReleases } from '../../platform/sysops'
import type { IStatus, Incident, Severity } from '../../platform/sysops'
import { fmtAt } from '../../platform/persist'
import { useAdmin } from './AdminLayout'

const SEV: Record<Severity, string> = { Minor: 'amber', Major: 'red' }

export default function SystemStatus() {
  const incidents = useIncidents()
  const releases = useReleases()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const [tab, setTab] = useState('Status')
  const [newInc, setNewInc] = useState(false)
  const [newRel, setNewRel] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const open = incidents.filter((i) => i.status !== 'Resolved')
  const svcState = (name: string) => { const hit = open.filter((i) => i.service === name); return hit.some((i) => i.severity === 'Major') ? 'Down' : hit.length ? 'Degraded' : 'Operational' }
  const tone = (s: string) => (s === 'Operational' ? 'green' : s === 'Degraded' ? 'amber' : 'red')
  const overall = open.some((i) => i.severity === 'Major') ? 'Major outage' : open.length ? 'Partial degradation' : 'All systems operational'
  const manage = can('system')
  const cur = incidents.find((i) => i.id === sel)

  return (
    <div>
      <PageHeader eyebrow="System" title="Status and releases" desc="Service status, incidents and public release notes." actions={manage ? <><Btn v="secondary" onClick={() => setNewRel(true)}>Publish release notes</Btn><Btn onClick={() => setNewInc(true)}>Open incident</Btn></> : undefined} />
      <div role="status" className={`mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${open.length ? (open.some((i) => i.severity === 'Major') ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900') : 'border-green-200 bg-green-50 text-green-900'}`}><span className="size-2.5 rounded-full bg-current" aria-hidden />{overall}</div>
      <Tabs tabs={['Status', 'Incidents', 'Release notes']} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Status' && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Panel><Stat label="Open incidents" value={String(open.length)} /></Panel>
              <Panel><Stat label="Jobs queued" value={String(Object.values(QUEUE).reduce((a, b) => a + b, 0))} sub="across all queues" /></Panel>
              <Panel><Stat label="Average uptime, 90 days" value={`${(SERVICE_LIST.reduce((a, s) => a + s.uptime, 0) / SERVICE_LIST.length).toFixed(2)}%`} /></Panel>
            </div>
            <Table label="Services" head={['Service', 'Status', 'Uptime, 90 days', 'Error rate', 'Queue depth', 'Median response']} rows={SERVICE_LIST.map((s) => {
              const st = svcState(s.name)
              return [s.name, <Badge key="b" tone={tone(st)}>{st}</Badge>, `${(st === 'Operational' ? s.uptime : s.uptime - 0.04).toFixed(2)}%`, `${(st === 'Operational' ? s.err : s.err * 3).toFixed(2)}%`, String(QUEUE[s.name] ?? 0), s.ms ? `${s.ms} ms` : '-']
            })} />
            <Panel title="Last incident">{incidents[0] ? <p className="text-sm"><b>{incidents[0].id}</b> {incidents[0].title} on {incidents[0].service}, {incidents[0].status.toLowerCase()} since {fmtAt(incidents[0].startedAt)}.</p> : <p className="text-sm text-slate">No incidents recorded.</p>}</Panel>
          </div>
        )}
        {tab === 'Incidents' && (incidents.length ? <Table label="Incidents" head={['Incident', 'Service', 'Severity', 'Status', 'Started', 'Resolved']} rows={incidents.map((i) => [
          <button key="t" onClick={() => setSel(i.id)} className="cursor-pointer text-left"><span className="font-mono text-xs text-slate">{i.id}</span><span className="block font-semibold text-teal hover:underline">{i.title}</span></button>,
          i.service, <Badge key="s" tone={SEV[i.severity]}>{i.severity}</Badge>, <Badge key="st" tone={i.status === 'Resolved' ? 'green' : 'amber'}>{i.status}</Badge>, fmtAt(i.startedAt), i.resolvedAt ? fmtAt(i.resolvedAt) : '-',
        ])} /> : <Panel pad={false}><EmptyState title="No incidents" body="Opened incidents appear here with their update history." /></Panel>)}
        {tab === 'Release notes' && (
          <div className="space-y-4">{releases.map((r) => (
            <Panel key={r.id}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold">{r.version}</span><Badge tone={r.kind === 'Feature' ? 'teal' : r.kind === 'Fix' ? 'amber' : 'blue'}>{r.kind}</Badge><span className="ml-auto text-xs text-slate">{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
              <h3 className="mt-2 font-semibold">{r.title}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate">{r.items.map((x) => <li key={x}>{x}</li>)}</ul>
            </Panel>))}</div>
        )}
      </div>
      <Overlay open={newInc} onClose={() => setNewInc(false)} title="Open an incident"><NewIncident onDone={(f) => { createIncident(f, by); setNewInc(false); toast('Incident opened. The service now shows as affected.') }} /></Overlay>
      <Overlay open={newRel} onClose={() => setNewRel(false)} title="Publish release notes"><NewRelease onDone={(r) => { publishRelease(r); setNewRel(false); toast('Release notes published') }} /></Overlay>
      <Overlay open={!!cur} onClose={() => setSel(null)} title={cur ? `${cur.id} · ${cur.title}` : 'Incident'} side>{cur && <IncidentDetail i={cur} by={by} manage={manage} />}</Overlay>
    </div>
  )
}

function NewIncident({ onDone }: { onDone: (f: { title: string; service: string; severity: Severity }) => void }) {
  const [f, setF] = useState({ title: '', service: SERVICE_LIST[0].name, severity: 'Minor' as Severity })
  return (
    <div className="space-y-3">
      <Field label="What is happening"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Affected service"><select className={inputCls} value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })}>{SERVICE_LIST.map((s) => <option key={s.name}>{s.name}</option>)}</select></Field>
      <Field label="Severity" hint="Major marks the service as down."><select className={inputCls} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Severity })}><option>Minor</option><option>Major</option></select></Field>
      <Btn disabled={!f.title.trim()} onClick={() => onDone(f)}>Open incident</Btn>
    </div>
  )
}
function NewRelease({ onDone }: { onDone: (r: { version: string; date: string; title: string; kind: 'Feature' | 'Improvement' | 'Fix'; items: string[] }) => void }) {
  const [f, setF] = useState({ version: '', title: '', kind: 'Feature' as 'Feature' | 'Improvement' | 'Fix', items: '' })
  const items = f.items.split('\n').map((x) => x.trim()).filter(Boolean)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3"><Field label="Version"><input className={inputCls} value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="2026.11" /></Field><Field label="Type"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}><option>Feature</option><option>Improvement</option><option>Fix</option></select></Field></div>
      <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Changes, one per line"><textarea rows={4} className={`${inputCls} h-auto py-2`} value={f.items} onChange={(e) => setF({ ...f, items: e.target.value })} /></Field>
      <Btn disabled={!f.version.trim() || !f.title.trim() || !items.length} onClick={() => onDone({ version: f.version.trim(), title: f.title.trim(), kind: f.kind, date: new Date().toISOString().slice(0, 10), items })}>Publish</Btn>
    </div>
  )
}
function IncidentDetail({ i, by, manage }: { i: Incident; by: string; manage: boolean }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [st, setSt] = useState<IStatus>(i.status === 'Resolved' ? 'Resolved' : 'Monitoring')
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><Badge tone={SEV[i.severity]}>{i.severity}</Badge><Badge tone={i.status === 'Resolved' ? 'green' : 'amber'}>{i.status}</Badge><span className="text-sm text-slate">{i.service}</span></div>
      {manage && i.status !== 'Resolved' && (
        <Panel title="Post an update">
          <Field label="New status"><select className={inputCls} value={st} onChange={(e) => setSt(e.target.value as IStatus)}>{['Investigating', 'Identified', 'Monitoring', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <textarea aria-label="Update message" rows={3} className={`${inputCls} mt-3 h-auto py-2`} value={text} onChange={(e) => setText(e.target.value)} placeholder="What changed?" />
          <div className="mt-3 flex gap-2"><Btn onClick={() => { updateIncident(i.id, st, text.trim(), by); setText(''); toast(st === 'Resolved' ? `${i.id} resolved` : 'Update posted') }}>{st === 'Resolved' ? 'Resolve incident' : 'Post update'}</Btn></div>
        </Panel>
      )}
      <Panel title="Timeline"><Timeline items={i.updates.map((u) => ({ t: fmtAt(u.at), a: u.by, x: u.text }))} /></Panel>
    </div>
  )
}
