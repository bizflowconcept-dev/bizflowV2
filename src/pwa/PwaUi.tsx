import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share, SquarePlus, WifiOff, RefreshCw, X, Check } from 'lucide-react'
import { router } from '../routes'
import { useTenants } from '../tenant/store'
import { TenantMark } from '../tenant/ui'
import { LogoMark } from '../components/ui'
import { openInstall, usePwa } from './pwa'

const KEY = 'bf-pwa-dismissed'
const DAYS = 14

const useSnoozed = () => {
  const [v, setV] = useState(() => Number(localStorage.getItem(KEY) || 0) > Date.now() - DAYS * 864e5)
  return [v, () => { localStorage.setItem(KEY, String(Date.now())); setV(true) }] as const
}

function useTenantInPath() {
  const path = useSyncExternalStore((f) => router.subscribe(f), () => router.state.location.pathname)
  const tenants = useTenants()
  const m = path.match(/^\/w\/([^/]+)/)
  const slug = m?.[1] || (path.startsWith('/admin/business') ? (JSON.parse(localStorage.getItem('bf-business-session') || 'null')?.slug as string | undefined) : undefined)
  return { path, tenant: slug ? tenants[slug] : undefined }
}

const offlineNote = (path: string) =>
  path.startsWith('/admin/business/performance') ? 'Offline. Clock-ins are saved on this device and sync when you reconnect.'
    : path.startsWith('/admin/business/approvals') ? 'Offline. You can read requests; decisions need a connection.'
    : path.startsWith('/admin/business/tasks') ? 'Offline. Your tasks are available; updates sync when you reconnect.'
    : 'You are offline. Pages you have opened still work; changes need a connection.'

export default function PwaUi() {
  const p = usePwa()
  const { tenant, path } = useTenantInPath()
  const [snoozed, snooze] = useSnoozed()
  const [ready, setReady] = useState(false)
  const [back, setBack] = useState(false)
  const [done, setDone] = useState(false)
  const [wasOff, setWasOff] = useState(false)

  useEffect(() => { const t = setTimeout(() => setReady(true), 20000); return () => clearTimeout(t) }, [])
  useEffect(() => {
    if (!p.online) { setWasOff(true); return }
    if (!wasOff) return
    setBack(true)
    const t = setTimeout(() => { setBack(false); setWasOff(false) }, 3000)
    return () => clearTimeout(t)
  }, [p.online, wasOff])

  const name = tenant?.profile.name ?? 'BizFlow'
  const mark = tenant ? <TenantMark t={tenant} size={40} /> : <LogoMark size={40} />
  const installable = !p.installed && (p.canInstall || p.ios)
  const showCard = installable && ready && !snoozed && !p.sheet && path.startsWith('/admin/business') && !path.startsWith('/admin/business/performance') && !path.startsWith('/admin/business/login')

  const run = async () => {
    if (p.canInstall) { const ok = await p.install(); if (ok) setDone(true); p.closeSheet() }
  }

  return (
    <>
      {(!p.online || back) && (
        <div role="status" aria-live="polite" className={`fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] text-center text-[13px] font-semibold ${p.online ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-black'}`}>
          {p.online ? <><Check size={14} /> Back online</> : <><WifiOff size={14} /> {offlineNote(path)}</>}
        </div>
      )}

      {p.update && (
        <div role="status" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[90] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-white p-3 pl-4 text-sm shadow-xl md:bottom-6 md:left-auto md:right-6 md:mx-0">
          <RefreshCw size={16} className="shrink-0 text-teal" />
          <span className="min-w-0 flex-1 break-words text-ink">A new version of BizFlow is ready.</span>
          <button onClick={p.applyUpdate} className="min-h-9 shrink-0 cursor-pointer rounded-md bg-teal px-3 text-[13px] font-semibold text-white">Refresh</button>
        </div>
      )}

      {showCard && (
        <div role="dialog" aria-label={`Install ${name}`} className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-md rounded-2xl border border-line bg-white p-4 shadow-2xl md:bottom-6 md:left-auto md:right-6 md:mx-0 md:w-[380px]">
          <button onClick={snooze} aria-label="Dismiss" className="absolute right-2 top-2 flex size-8 cursor-pointer items-center justify-center rounded-md text-slate hover:bg-ink/5"><X size={16} /></button>
          <div className="flex items-start gap-3 pr-6">
            <span className="shrink-0">{mark}</span>
            <div className="min-w-0">
              <div className="break-words font-display text-[15px] font-semibold leading-tight text-ink">Install {name}</div>
              <p className="mt-1 text-[13px] leading-snug text-slate">Open it from your home screen, clock in faster, approve on the go and keep working through weak network.</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => (p.canInstall ? run() : openInstall())} className="min-h-10 flex-1 cursor-pointer rounded-md bg-teal px-3 text-sm font-semibold text-white">{p.canInstall ? 'Install app' : 'How to install'}</button>
            <button onClick={snooze} className="min-h-10 cursor-pointer rounded-md px-3 text-sm font-semibold text-slate hover:bg-ink/5">Not now</button>
          </div>
        </div>
      )}

      <Sheet open={p.sheet} onClose={p.closeSheet} name={name} mark={mark} canInstall={p.canInstall} ios={p.ios} installed={p.installed || done} onInstall={run} />
    </>
  )
}

function Sheet({ open, onClose, name, mark, canInstall, ios, installed, onInstall }: { open: boolean; onClose: () => void; name: string; mark: React.ReactNode; canInstall: boolean; ios: boolean; installed: boolean; onInstall: () => void }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  const steps: [React.ReactNode, string][] = ios
    ? [[<Share size={18} />, 'Tap the Share button in Safari’s toolbar.'], [<SquarePlus size={18} />, 'Choose “Add to Home Screen”.'], [<Check size={18} />, `Tap Add. ${name} now opens like an app.`]]
    : [[<Download size={18} />, 'Open your browser menu, or look for the install icon in the address bar.'], [<SquarePlus size={18} />, `Choose “Install ${name}” or “Add to Home screen”.`], [<Check size={18} />, 'Confirm, and it opens in its own window.']]
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-midnight/60 pt-[env(safe-area-inset-top)] p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Install ${name}`} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3">
          <span className="shrink-0">{mark}</span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-display text-lg font-semibold text-ink">{installed ? `${name} is installed` : `Install ${name}`}</h2>
            <p className="mt-0.5 text-[13px] text-slate">Faster launch, full screen, offline fallback and shortcuts to Clock in, Approvals and Tasks.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate hover:bg-ink/5"><X size={18} /></button>
        </div>
        {installed ? (
          <p className="mt-4 rounded-lg bg-softmint p-3 text-sm text-ink">Open it from your home screen or app launcher.</p>
        ) : canInstall ? (
          <button onClick={onInstall} className="mt-5 min-h-11 w-full cursor-pointer rounded-md bg-teal text-sm font-semibold text-white">Install app</button>
        ) : (
          <ol className="mt-4 space-y-2.5">
            {steps.map(([ic, t], i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm text-ink">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-softmint text-teal">{ic}</span>
                <span className="min-w-0 break-words pt-1">{t}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
