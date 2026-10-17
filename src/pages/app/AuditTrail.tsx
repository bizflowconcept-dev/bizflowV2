import { useMemo, useState } from 'react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, useToast } from '../../components/ui'
import { AUDIT_CATEGORIES, categoryOf, useAudit, useTenant } from '../../tenant/store'
import type { AuditEntry } from '../../tenant/store'
import { useRole } from '../../components/app/AppLayout'

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const stamp = (iso: string) => { const d = new Date(iso); return `${dayKey(d)} ${timeKey(d)}:${pad(d.getSeconds())}` }

/* djb2-style chained hash: each code depends on the previous code, so editing or removing any earlier entry changes every later code. */
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h }
const chain = (all: AuditEntry[]) => {
  const asc = [...all].sort((a, b) => a.at.localeCompare(b.at) || (a.seq ?? 0) - (b.seq ?? 0))
  const codes = new Map<string, string>()
  let prev = 'GENESIS'
  const ids = new Set<string>()
  let ok = true
  let last = ''
  for (const e of asc) {
    if (ids.has(e.id) || e.at < last || isNaN(Date.parse(e.at))) ok = false
    ids.add(e.id); last = e.at
    const h = hash([prev, e.id, e.at, e.actor, e.action, e.from ?? '', e.to ?? '', e.ref ?? '', e.result ?? ''].join('|')).toString(16).toUpperCase().padStart(8, '0')
    codes.set(e.id, h); prev = h
  }
  return { codes, ok, head: prev }
}

export default function AuditTrail() {
  const t = useTenant()
  const { r, role, can } = useRole()
  const rows = useAudit(t?.slug)
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tFrom, setTFrom] = useState('')
  const [tTo, setTTo] = useState('')
  const [dept, setDept] = useState('All')
  const [who, setWho] = useState('All')
  const [cat, setCat] = useState('All')
  const [res, setRes] = useState('All')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const [person, setPerson] = useState<string | null>(null)

  const { codes, ok, head } = useMemo(() => chain(rows), [rows])
  const allowed = can('company.audit.view')
  const depts = useMemo(() => ['All', ...Array.from(new Set(rows.map((x) => x.department).filter(Boolean) as string[])).sort()], [rows])
  const people = useMemo(() => ['All', ...Array.from(new Set(rows.map((x) => x.actor))).sort()], [rows])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((e) => {
      const d = new Date(e.at)
      if (from && dayKey(d) < from) return false
      if (to && dayKey(d) > to) return false
      const tk = timeKey(d)
      if (tFrom && tTo && tFrom > tTo) { if (tk < tFrom && tk > tTo) return false } else { if (tFrom && tk < tFrom) return false; if (tTo && tk > tTo) return false }
      if (dept !== 'All' && e.department !== dept) return false
      if (who !== 'All' && e.actor !== who) return false
      if (cat !== 'All' && (e.category ?? categoryOf(e.action)) !== cat) return false
      if (res !== 'All' && (e.result ?? 'Success') !== res) return false
      if (s && !`${e.action} ${e.ref ?? ''} ${e.from ?? ''} ${e.to ?? ''}`.toLowerCase().includes(s)) return false
      return true
    }).sort((a, b) => b.at.localeCompare(a.at) || (b.seq ?? 0) - (a.seq ?? 0))
  }, [rows, from, to, tFrom, tTo, dept, who, cat, res, q])

  if (!t) return null
  if (!allowed) return (
    <div>
      <PageHeader eyebrow="Insights & Control" title="Audit trail" />
      <div className="rounded-lg border border-line bg-white"><EmptyState title="Only company administrators and the CEO/MD can view the audit trail" body="Every action is still recorded. Ask your administrator if you need access to the history." /></div>
    </div>
  )

  const catOf = (e: AuditEntry) => e.category ?? categoryOf(e.action)
  const users = new Set(list.map((e) => e.actor)).size
  const failedIn = list.filter((e) => e.result === 'Failed' && catOf(e) === 'Security').length
  const reqs = list.filter((e) => catOf(e) === 'Requests').length
  const reset = () => { setFrom(''); setTo(''); setTFrom(''); setTTo(''); setDept('All'); setWho('All'); setCat('All'); setRes('All'); setQ('') }
  const head2 = ['When', 'Employee', 'Employee ID', 'Department', 'Role', 'Category', 'Action', 'Ref', 'Previous', 'New', 'Result', 'Device', 'Integrity']
  const csvRows = () => list.map((e) => [stamp(e.at), e.actor, e.actorId ?? '', e.department ?? '', e.role, catOf(e), e.action, e.ref ?? '', e.from ?? '', e.to ?? '', e.result ?? 'Success', e.device, codes.get(e.id) ?? ''])
  const exportCsv = () => {
    const csv = [head2, ...csvRows()].map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${t.slug}-audit-trail-${dayKey(new Date())}.csv`
    a.click()
    toast(`${list.length} audit events exported`)
  }
  const timeline = person ? rows.filter((e) => e.actor === person).sort((a, b) => b.at.localeCompare(a.at) || (b.seq ?? 0) - (a.seq ?? 0)).slice(0, 60) : []

  return (
    <div>
      <PageHeader eyebrow="Insights & Control" title="Audit trail" desc={`Complete, time-stamped record of who did what in ${t.profile.name}.`} actions={<Btn v="secondary" onClick={exportCsv}>Export CSV</Btn>} />
      <div role="status" className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] ${ok ? 'border-teal/30 bg-softmint text-midnight' : 'border-err/40 bg-red-50 text-red-900'}`}>
        <b>{ok ? 'Chain verified' : 'Chain check failed'}</b>
        <span>{ok ? `${rows.length} events, each code is chained to the one before it.` : 'Duplicate or out-of-order entries were detected.'}</span>
        <span className="ml-auto font-mono text-xs">Head {head}</span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Events in range" value={String(list.length)} />
        <Stat label="Active users" value={String(users)} />
        <Stat label="Failed sign-ins" value={String(failedIn)} />
        <Stat label="Requests and approvals" value={String(reqs)} />
      </div>
      <Panel title="Filters" action={<button onClick={reset} className="cursor-pointer text-[13px] font-semibold text-teal">Reset</button>} className="mb-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="From date"><input type="date" className={inputCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To date"><input type="date" className={inputCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="From time"><input type="time" className={inputCls} value={tFrom} onChange={(e) => setTFrom(e.target.value)} /></Field>
          <Field label="To time" hint={tFrom && tTo && tFrom > tTo ? 'Overnight window' : undefined}><input type="time" className={inputCls} value={tTo} onChange={(e) => setTTo(e.target.value)} /></Field>
          <Field label="Department"><select className={inputCls} value={dept} onChange={(e) => setDept(e.target.value)}>{depts.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Employee"><select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>{people.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Category"><select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)}>{['All', ...AUDIT_CATEGORIES].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Result"><select className={inputCls} value={res} onChange={(e) => setRes(e.target.value)}>{['All', 'Success', 'Failed'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <div className="mt-3"><Field label="Search action or reference"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. REQ-1042, Lead stage changed" /></Field></div>
      </Panel>
      {list.length === 0 ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No events match these filters" body="Widen the date or time range, or reset the filters." action={<Btn v="secondary" onClick={reset}>Reset filters</Btn>} /></div> : (
        <Table label="Audit trail" pageSize={15} head={['When', 'Employee', 'Department', 'Role', 'Category', 'Action', 'Ref', 'Previous', 'New', 'Result', 'Device', 'Integrity']} rows={list.map((e) => [
          <button key="w" onClick={() => setOpen(e)} className="cursor-pointer whitespace-nowrap font-mono text-xs font-semibold text-teal underline-offset-2 hover:underline" aria-label={`Open details for ${e.action}`}>{stamp(e.at)}</button>,
          <span key="e"><button onClick={() => setPerson(e.actor)} className="cursor-pointer font-medium text-ink hover:text-teal">{e.actor}</button><span className="block font-mono text-[11px] text-slate">{e.actorId || '—'}</span></span>,
          e.department || '—', e.role, <Badge key="c">{catOf(e)}</Badge>, e.action, e.ref ?? '—', e.from ?? '—', e.to ?? '—',
          <Badge key="r" tone={(e.result ?? 'Success') === 'Failed' ? 'red' : 'green'}>{e.result ?? 'Success'}</Badge>, e.device,
          <code key="i" className="font-mono text-[11px] text-slate">{codes.get(e.id)}</code>,
        ])} />
      )}

      <Overlay open={!!open} onClose={() => setOpen(null)} title="Audit event" side>
        {open && (
          <dl className="space-y-3 text-sm">
            {([['When', stamp(open.at)], ['Employee', open.actor], ['Employee ID', open.actorId || '—'], ['Department', open.department || '—'], ['Role', open.role], ['Category', catOf(open)], ['Action', open.action], ['Reference', open.ref ?? '—'], ['Previous value', open.from ?? '—'], ['New value', open.to ?? '—'], ['Result', open.result ?? 'Success'], ['Scope', open.scope], ['Company', open.tenant], ['Device', open.device], ['Event ID', open.id], ['Sequence', String(open.seq ?? '—')], ['Integrity code', codes.get(open.id) ?? '—']] as [string, string][]).map(([k, v]) => (
              <div key={k} className="border-b border-line/60 pb-2"><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate">{k}</dt><dd className="mt-0.5 break-words text-ink">{v}</dd></div>
            ))}
            <Btn v="secondary" onClick={() => { setPerson(open.actor); setOpen(null) }}>View {open.actor}'s activity</Btn>
          </dl>
        )}
      </Overlay>
      <Overlay open={!!person} onClose={() => setPerson(null)} title={`Activity timeline: ${person ?? ''}`} side>
        <p className="mb-3 text-xs text-slate">Latest {timeline.length} events, newest first.</p>
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {timeline.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-teal" />
              <div className="font-mono text-[11px] text-slate">{stamp(e.at)} · {catOf(e)}{e.result === 'Failed' ? ' · Failed' : ''}</div>
              <button onClick={() => { setPerson(null); setOpen(e) }} className="cursor-pointer text-left text-sm font-medium text-ink hover:text-teal">{e.action}</button>
              {(e.from || e.to) && <div className="text-xs text-slate">{e.from ?? '—'} → {e.to ?? '—'}</div>}
            </li>
          ))}
        </ol>
      </Overlay>
    </div>
  )
}
