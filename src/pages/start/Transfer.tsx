import { useEffect, useState } from 'react'
import { Check, CheckCircle2, Copy, Loader2, RefreshCw, Timer } from 'lucide-react'
import { Btn } from '../../components/ui'
import { TRANSFER_WINDOW_MS } from '../../data/signup'
import type { VirtualAccount } from '../../data/signup'

const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" aria-label={`Copy ${label}`} onClick={() => { navigator.clipboard?.writeText(value).catch(() => undefined); setOk(true); setTimeout(() => setOk(false), 1600) }} className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold text-slate hover:border-teal hover:text-teal">
      {ok ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
    </button>
  )
}

export default function Transfer({ va, money, outcome, verifyTick, onNew, onConfirmed }: { va: VirtualAccount; money: string; outcome: string; verifyTick: number; onNew: () => void; onConfirmed: () => void }) {
  const [now, setNow] = useState(Date.now())
  const [state, setState] = useState<'waiting' | 'verifying' | 'notyet' | 'success'>('waiting')
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { setState('waiting') }, [va.reference])
  const left = Math.max(0, va.expiresAt - now)
  const expired = left <= 0 && state !== 'success' && state !== 'verifying'
  const verify = (force: boolean) => {
    setState('verifying')
    setTimeout(() => {
      if (!force && outcome === 'pending') { setState('notyet'); return }
      setState('success'); setTimeout(onConfirmed, 1200)
    }, 2200)
  }
  useEffect(() => { if (verifyTick > 0) verify(false) }, [verifyTick]) // eslint-disable-line react-hooks/exhaustive-deps
  const R = 34, C = 2 * Math.PI * R, frac = Math.min(1, left / TRANSFER_WINDOW_MS)
  const urgent = left < 60_000

  if (state === 'success') return (
    <div className="mt-5 rounded-lg border border-ok/30 bg-ok/5 p-6 text-center" role="status"><CheckCircle2 size={36} className="mx-auto text-ok" /><h3 className="mt-3 text-lg font-semibold">Transfer received</h3><p className="mt-1 text-sm text-slate">We matched {money} to reference {va.reference}.</p></div>
  )
  if (expired) return (
    <div className="mt-5 rounded-lg border border-warn/40 bg-amber-50 p-6 text-center" role="alert">
      <Timer size={32} className="mx-auto text-warn" /><h3 className="mt-3 text-lg font-semibold">This account number has expired</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate">Account numbers are valid for 10 minutes. Please do not send money to {va.number}. Generate a new one to continue.</p>
      <Btn className="mt-4" onClick={onNew}><RefreshCw size={15} />Generate new account number</Btn>
    </div>
  )
  return (
    <div className="mt-5">
      <div className="grid gap-4 rounded-lg border border-line bg-cloud p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <dl className="space-y-3 text-sm">
          {([['Bank', va.bank, false], ['Account number', va.number, true], ['Account name', va.name, false], ['Amount to transfer', money, true], ['Payment reference', va.reference, true]] as const).map(([k, v, copy]) => (
            <div key={k} className="flex items-center justify-between gap-3"><div className="min-w-0"><dt className="text-xs text-slate">{k}</dt><dd className={`break-all font-semibold ${k === 'Account number' ? 'font-mono text-lg tracking-wider text-teal' : k === 'Amount to transfer' ? 'num text-base' : ''}`}>{v}</dd></div>{copy && <CopyBtn value={k === 'Amount to transfer' ? String(va.amount) : v} label={k.toLowerCase()} />}</div>
          ))}
        </dl>
        <div className="flex items-center gap-3 sm:flex-col sm:gap-1" aria-live="off">
          <div className="relative size-20">
            <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden="true"><circle cx="40" cy="40" r={R} fill="none" strokeWidth="6" className="stroke-line" /><circle cx="40" cy="40" r={R} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${urgent ? 'stroke-err' : 'stroke-teal'}`} /></svg>
            <span className={`num absolute inset-0 flex items-center justify-center text-sm font-semibold ${urgent ? 'text-err' : 'text-ink'}`} role="timer" aria-label={`Time left ${mmss(left)}`}>{mmss(left)}</span>
          </div>
          <span className="text-xs text-slate">Expires in {mmss(left)}</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className={`h-full transition-[width] duration-1000 ease-linear ${urgent ? 'bg-err' : 'bg-teal'}`} style={{ width: `${frac * 100}%` }} /></div>
      <p className="mt-3 text-xs text-slate">Transfer the exact amount from any Nigerian bank app or USSD. Different amounts cannot be matched automatically.</p>
      {state === 'notyet' && <p role="status" className="mt-3 rounded-md border border-warn/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">We have not received your transfer yet. Banks can take a minute or two. Try again shortly.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn v="secondary" onClick={() => verify(false)} disabled={state === 'verifying'}>{state === 'verifying' ? <><Loader2 size={15} className="animate-spin" />Verifying transfer...</> : "I've made the transfer"}</Btn>
        <button type="button" disabled={state === 'verifying'} className="cursor-pointer text-xs text-slate underline disabled:opacity-50" onClick={() => verify(true)}>Demo only: simulate transfer received</button>
      </div>
    </div>
  )
}
