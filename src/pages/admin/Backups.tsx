import { useMemo, useState } from 'react'
import { DatabaseBackup, Globe2, History } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Table, useToast } from '../../components/ui'
import { Spark } from '../../components/charts'
import { useTenants } from '../../tenant/store'
import { backupStats, decideRestore, defaultRec, simulateFailedBackup, hoursSince, isStale, POLICIES, REGIONS, requestRestore, runBackupNow, setPolicy, startRestore, STALE_HOURS, useBackups } from '../../platform/backups'
import type { BackupRec, Restore } from '../../platform/backups'
import { fmtAt } from '../../platform/persist'
import { useAdmin } from './AdminLayout'

const TONE: Record<string, string> = { Requested: 'amber', Approved: 'blue', Running: 'blue', Completed: 'green', Rejected: 'red' }
const ago = (iso: string) => { const h = hoursSince(iso); return h < 1 ? 'under 1h ago' : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago` }
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)

export default function Backups() {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const stored = useBackups()
  const tenants = useTenants()
  const list = useMemo(() => Object.values(tenants).map((t) => stored.recs.find((r) => r.slug === t.slug) ?? defaultRec({ slug: t.slug, name: t.profile.name, employees: t.employees })), [tenants, stored])
  const data = { recs: list, restores: stored.restores }
  const stats = useMemo(() => backupStats(data), [list, stored.restores]) // eslint-disable-line react-hooks/exhaustive-deps
  const [filter, setFilter] = useState<'all' | 'stale'>('all')
  const [sel, setSel] = useState<string | null>(null)
  const [req, setReq] = useState<string | null>(null)
  const manage = can('backups')
  const recs = data.recs.filter((r) => filter === 'all' || isStale(r))
  const say = (r: string | null, ok: string) => toast(r ?? ok)
  const name = (slug: string) => data.recs.find((r) => r.slug === slug)?.name ?? slug
  const selected = data.recs.find((r) => r.slug === sel)

  return (
    <div>
      <PageHeader eyebrow="System" title="Data residency and backups" desc="Where each company's data lives, how fresh its backup is, and the two-person route to restore it." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Companies with stale backups', String(stats.stale), stats.failed ? `${stats.failed} last run failed` : 'Older than their policy allows', stats.stale > 0], ['Restores this quarter', String(stats.restoresQ), `${stats.pending} open now`, false], ['Cross-region copies', `${stats.crossRegion} of ${stats.tenants}`, 'Second-region protection', false], ['Protected data', `${stats.totalGb} GB`, 'Encrypted at rest (AES-256)', false]].map(([l, v, s, bad]) => (
          <Panel key={String(l)}><div className="text-xs font-medium text-slate">{l}</div><div className={`num mt-1 font-display text-[24px] font-semibold leading-none ${bad ? 'text-err' : 'text-ink'}`}>{v}</div><div className="mt-1.5 text-xs text-slate">{s}</div></Panel>))}
      </div>

      <Panel className="mt-4" pad={false} title="Companies" action={<div className="flex gap-1">{(['all', 'stale'] as const).map((f) => <Btn key={f} s="sm" v={filter === f ? 'dark' : 'secondary'} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : `Stale (${stats.stale})`}</Btn>)}</div>}>
        {recs.length === 0 ? <div className="p-4"><EmptyState title={list.length ? 'All backups are fresh' : 'No companies yet'} body={list.length ? 'Every company is inside its backup policy.' : 'Backups appear here once a company workspace exists.'} /></div> : (
          <Table label="Backups" pageSize={9} head={['Company', 'Region', 'Policy', 'Last backup', '7-day size', 'Status', '']}
            rows={recs.map((r) => [
              <button key="n" className="cursor-pointer text-left font-semibold text-teal-600 hover:underline" onClick={() => setSel(r.slug)}>{r.name}<span className="block text-xs font-normal text-slate">{r.slug}</span></button>,
              <span key="g" className="inline-flex items-center gap-1"><Globe2 size={13} className="text-slate" />{r.region}</span>, r.policy.split(':')[0],
              <span key="l" className="whitespace-nowrap">{ago(r.lastBackupAt)}<span className="block text-xs text-slate">{fmtAt(r.lastBackupAt)}</span></span>,
              <div key="s" className="h-6 w-20"><Spark data={[...r.history].reverse().map((h) => h.sizeMb)} /></div>,
              isStale(r) ? <Badge key="b" tone="red">{r.lastResult === 'Failed' ? 'Last run failed' : 'Stale'}</Badge> : <Badge key="b" tone="green">Healthy</Badge>,
              manage ? <Btn key="a" s="sm" v="secondary" onClick={() => setReq(r.slug)}>Request restore</Btn> : '',
            ])} />
        )}
      </Panel>

      <Panel className="mt-4" title="Restore requests" action={<History size={15} className="text-slate" />} pad={false}>
        {data.restores.length === 0 ? <div className="p-4"><EmptyState title="No restores yet" body="Requests appear here with their approval trail." /></div> : (
          <ul className="divide-y divide-line">{data.restores.map((r) => <RestoreRow key={r.id} r={r} company={name(r.slug)} manage={manage} actor={actor} say={say} />)}</ul>
        )}
      </Panel>

      <RestoreDialog slug={req} rec={list.find((r) => r.slug === req)} onClose={() => setReq(null)} name={req ? name(req) : ''} actor={actor} say={say} />
      <Overlay open={!!selected} onClose={() => setSel(null)} title={selected?.name ?? ''} side>
        {selected && <Detail r={selected} manage={manage} actor={actor} say={say} />}
      </Overlay>
    </div>
  )
}

function RestoreRow({ r, company, manage, actor, say }: { r: Restore; company: string; manage: boolean; actor: string; say: (r: string | null, ok: string) => void }) {
  const [note, setNote] = useState('')
  const own = r.requestedBy === actor
  return (
    <li className="space-y-2 px-4 py-3 text-sm sm:px-5">
      <div className="flex flex-wrap items-center gap-2"><b>{company}</b><Badge tone={TONE[r.status]}>{r.status}</Badge><span className="text-slate">{r.id} · {r.scope}</span><span className="ml-auto text-xs text-slate">{fmtAt(r.requestedAt)}</span></div>
      <p className="text-slate">{r.reason}</p>
      <p className="text-xs text-slate">Restore to {fmtAt(r.pointInTime)} · requested by {r.requestedBy}{r.decidedBy ? ` · ${r.status === 'Rejected' ? 'rejected' : 'approved'} by ${r.decidedBy}` : ''}{r.note ? ` (${r.note})` : ''}{r.completedAt ? ` · completed ${fmtAt(r.completedAt)}, ${((r.restoredBytes ?? 0) / 1e6).toFixed(0)} MB` : ''}</p>
      {manage && r.status === 'Requested' && (own
        ? <p className="text-xs text-amber-800">You requested this restore, so a different administrator must approve it.</p>
        : <div className="flex flex-wrap gap-2"><input aria-label="Decision note" className={`${inputCls} max-w-xs flex-1`} placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} /><Btn s="sm" onClick={() => say(decideRestore(r.id, actor, true, note), 'Restore approved.')}>Approve</Btn><Btn s="sm" v="secondary" onClick={() => say(decideRestore(r.id, actor, false, note), 'Restore rejected.')}>Reject</Btn></div>)}
      {manage && r.status === 'Approved' && <Btn s="sm" onClick={() => say(startRestore(r.id, actor), 'Restore started.')}><DatabaseBackup size={14} />Run restore</Btn>}
      {r.status === 'Running' && <div role="status" className="flex items-center gap-2 text-xs text-slate"><span className="size-2 animate-pulse rounded-full bg-info" />Restoring… (simulated)</div>}
    </li>
  )
}

function RestoreDialog({ slug, rec, onClose, name, actor, say }: { slug: string | null; rec?: BackupRec; onClose: () => void; name: string; actor: string; say: (r: string | null, ok: string) => void }) {
  const [pit, setPit] = useState(() => localInput(new Date(Date.now() - 36e5 * 6)))
  const [scope, setScope] = useState<Restore['scope']>('Documents only')
  const [reason, setReason] = useState(''), [err, setErr] = useState('')
  return (
    <Overlay open={!!slug} onClose={onClose} title={`Request restore: ${name}`}>
      <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); const r = requestRestore({ slug: slug!, rec: rec!, actor, pointInTime: new Date(pit).toISOString(), scope, reason }); if (r) setErr(r); else { say(null, 'Restore requested. A second administrator must approve it.'); setReason(''); setErr(''); onClose() } }}>
        <Field label="Restore to this point in time"><input type="datetime-local" className={inputCls} value={pit} max={localInput(new Date())} onChange={(e) => setPit(e.target.value)} /></Field>
        <Field label="What to restore"><select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as Restore['scope'])}>{['Documents only', 'Employees and payroll', 'Full workspace'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Why is this needed?"><textarea className={`${inputCls} h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {scope === 'Full workspace' && <p className="rounded-md bg-amber-50 p-3 text-amber-900">A full restore overwrites everything changed since that point. Prefer a narrower scope where possible.</p>}
        {err && <p role="alert" className="text-err">{err}</p>}
        <Btn type="submit">Submit for approval</Btn>
      </form>
    </Overlay>
  )
}

function Detail({ r, manage, actor, say }: { r: BackupRec; manage: boolean; actor: string; say: (r: string | null, ok: string) => void }) {
  const [policy, setPol] = useState<BackupRec['policy']>(r.policy), [region, setReg] = useState<BackupRec['region']>(r.region)
  return (
    <div className="space-y-5 text-sm">
      <dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-slate">Last backup</dt><dd>{fmtAt(r.lastBackupAt)} ({r.lastResult})</dd></div><div><dt className="text-xs text-slate">Freshness limit</dt><dd>{STALE_HOURS[r.policy]} hours</dd></div><div><dt className="text-xs text-slate">Size</dt><dd>{r.sizeMb} MB</dd></div><div><dt className="text-xs text-slate">Encryption</dt><dd>{r.encrypted ? 'AES-256 at rest' : 'Off'}</dd></div></dl>
      <Panel title="Last 7 backups" pad={false}><ul className="divide-y divide-line">{r.history.map((h) => <li key={h.at} className="flex justify-between px-4 py-2"><span>{fmtAt(h.at)}</span><span className="flex gap-3"><span className="num text-slate">{h.sizeMb} MB</span><Badge tone={h.result === 'Success' ? 'green' : 'red'}>{h.result}</Badge></span></li>)}</ul></Panel>
      {manage ? <>
        <Panel title="Residency and retention">
          <Field label="Primary region" hint="Changing region migrates stored data and is audited."><select className={inputCls} value={region} onChange={(e) => setReg(e.target.value as BackupRec['region'])}>{REGIONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <div className="mt-3"><Field label="Backup and retention policy"><select className={inputCls} value={policy} onChange={(e) => setPol(e.target.value as BackupRec['policy'])}>{POLICIES.map((x) => <option key={x}>{x}</option>)}</select></Field></div>
          <Btn className="mt-3" s="sm" onClick={() => say(setPolicy(r, actor, policy, region), 'Policy saved and audited.')}>Save</Btn>
        </Panel>
        <div className="flex flex-wrap gap-2"><Btn v="secondary" onClick={() => say(runBackupNow(r, actor), 'Backup completed.')}>Run backup now</Btn><Btn v="ghost" title="Demo only" onClick={() => say(simulateFailedBackup(r, actor), 'Failed run recorded: the company is now stale.')}>Demo: simulate failed run</Btn></div>
      </> : <p className="rounded-md bg-ink/5 p-3 text-slate">Your role can view backups but not change them.</p>}
    </div>
  )
}
