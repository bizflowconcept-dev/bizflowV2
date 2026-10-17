import { useMemo, useState } from 'react'
import { Btn, Field, inputCls, Overlay, useToast } from '../components/ui'
import type { Employee } from '../data/demo'
import { DEFAULT_NOTICE, EXIT_TYPES, REASONS, REHIRE, TODAY, activeExit, addDays, initiateExit, shortfallDays } from './store'
import type { ExitCase, ExitType } from './store'

const area = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'

/** Initiate an exit (HR) or submit a resignation (employee). */
export default function ExitForm({ open, onClose, slug, employees, me, by, onDone }: { open: boolean; onClose: () => void; slug: string; employees: Employee[]; me?: Employee; by: string; onDone?: (c: ExitCase) => void }) {
  const self = !!me
  const toast = useToast()
  const pool = useMemo(() => employees.filter((e) => !activeExit(slug, e.id)).sort((a, b) => a.name.localeCompare(b.name)), [employees, slug, open]) // eslint-disable-line
  const [empId, setEmpId] = useState('')
  const [type, setType] = useState<ExitType>('Resignation')
  const [cat, setCat] = useState<string>(REASONS[0])
  const [reason, setReason] = useState('')
  const [given, setGiven] = useState(TODAY)
  const [days, setDays] = useState(DEFAULT_NOTICE)
  const [waived, setWaived] = useState(false)
  const [lwd, setLwd] = useState('')
  const [rehire, setRehire] = useState<string>('Eligible')
  const [err, setErr] = useState('')
  const emp = me ?? pool.find((e) => e.id === (empId || pool[0]?.id))
  const lastDay = lwd || addDays(given, days)
  const short = shortfallDays({ noticeGiven: given, lastWorkingDay: lastDay, noticePeriodDays: days, noticeWaived: waived })

  const submit = () => {
    if (!emp) return setErr('Choose an employee.')
    if (!reason.trim()) return setErr('Add a few details about the reason.')
    if (lastDay < given) return setErr('The last working day cannot be before the notice date.')
    if (activeExit(slug, emp.id)) return setErr('This employee already has an exit in progress.')
    const c = initiateExit(slug, emp, { type: self ? 'Resignation' : type, reasonCat: cat, reason: reason.trim(), noticeGiven: given, noticePeriodDays: days, noticeWaived: waived, lastWorkingDay: lastDay, rehire: self ? 'Review' : rehire }, by, self)
    toast(self ? 'Resignation submitted. HR will review it.' : `Exit started for ${emp.name}`)
    setReason(''); setLwd(''); setErr(''); onClose(); onDone?.(c)
  }

  return (
    <Overlay open={open} onClose={onClose} title={self ? 'Submit resignation' : 'Initiate staff exit'} side>
      <div className="space-y-4">
        {self ? (
          <p className="rounded-lg bg-softmint px-3 py-2 text-sm text-slate">Your resignation goes to your line manager and HR for acceptance. You can withdraw it until it is accepted.</p>
        ) : (
          <Field label="Employee">
            <select className={inputCls} value={emp?.id ?? ''} onChange={(e) => setEmpId(e.target.value)}>{pool.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.dept}</option>)}</select>
          </Field>
        )}
        {!self && <Field label="Exit type"><select className={inputCls} value={type} onChange={(e) => setType(e.target.value as ExitType)}>{EXIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>}
        <Field label="Reason category"><select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)}>{REASONS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Details"><textarea className={area} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What led to this decision?" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={self ? 'Date of notice' : 'Notice date'}><input type="date" className={inputCls} value={given} onChange={(e) => setGiven(e.target.value)} /></Field>
          <Field label="Notice period (days)"><input type="number" min={0} className={inputCls} value={days} onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))} /></Field>
        </div>
        <Field label="Proposed last working day" hint={`Default is notice date plus ${days} days.`}><input type="date" className={inputCls} value={lastDay} onChange={(e) => setLwd(e.target.value)} /></Field>
        {!self && (
          <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={waived} onChange={(e) => setWaived(e.target.checked)} /><span>Waive the notice shortfall<span className="block text-xs text-slate">No deduction or pay in lieu is raised for any shortfall.</span></span></label>
        )}
        <div className={`rounded-lg border px-3 py-2 text-sm ${short ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-line bg-cloud text-slate'}`}>
          {waived ? 'Notice shortfall waived.' : short ? `Notice shortfall of ${short} day${short === 1 ? '' : 's'}. ${self || type === 'Resignation' ? 'It is deducted from final pay.' : 'Handled in the final settlement.'}` : 'Full notice period is served.'}
        </div>
        {!self && <Field label="Rehire eligibility"><select className={inputCls} value={rehire} onChange={(e) => setRehire(e.target.value)}>{REHIRE.map((t) => <option key={t}>{t}</option>)}</select></Field>}
        {err && <p role="alert" className="text-sm text-err">{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><Btn v="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>{self ? 'Submit resignation' : 'Start exit'}</Btn></div>
      </div>
    </Overlay>
  )
}
