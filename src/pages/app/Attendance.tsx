import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, CircleAlert, Clock, Laptop, MapPin, ShieldCheck } from 'lucide-react'
import { Avatar, Badge, Btn, Field, inputCls, Overlay, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { employeesForTenant, isOwnDataset } from '../../data/demo'
import { useTenant } from '../../tenant/store'
import { attendanceOn, isApprover } from '../../performance/engine'
import { addSite, removeSite, clock, clockIn, clockOut, deviceInfo, DEFAULT_RULES, nearest, reviewRecord, saveRules, todayKey, useAttendance } from '../../attendance/store'
import type { Rec, Rules, Site, Stamp } from '../../attendance/store'

const MANAGE = ['md', 'admin', 'hr', 'manager', 'operations']
const CONFIGURE = ['md', 'admin', 'hr']
const dist = (m: number | null) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)

function Selfie({ rec, size = 36 }: { rec: Rec; size?: number }) {
  return rec.in.selfie
    ? <img src={rec.in.selfie} alt={`Check-in selfie of ${rec.name}`} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <Avatar name={rec.name} size={size} />
}

function useStream(active: boolean) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'idle' | 'live' | 'denied'>('idle')
  useEffect(() => {
    if (!active) return
    let stream: MediaStream | undefined, dead = false
    if (!navigator.mediaDevices?.getUserMedia) { setState('denied'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
      .then((s) => { if (dead) { s.getTracks().forEach((t) => t.stop()); return } stream = s; if (video.current) { video.current.srcObject = s; void video.current.play() } setState('live') })
      .catch(() => setState('denied'))
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()); setState('idle') }
  }, [active])
  return { video, state }
}

function stamp(canvas: HTMLCanvasElement, lines: string[]) {
  const g = canvas.getContext('2d')!
  g.fillStyle = 'rgba(11,37,48,.72)'; g.fillRect(0, canvas.height - 44, canvas.width, 44)
  g.fillStyle = '#fff'; g.font = '600 12px Inter, sans-serif'
  lines.forEach((l, i) => g.fillText(l, 10, canvas.height - 26 + i * 15))
}

function ClockInFlow({ open, onClose, slug, sites, rules, who }: { open: boolean; onClose: () => void; slug: string; sites: Site[]; rules: Rules; who: { empId: string; name: string; dept: string } }) {
  const toast = useToast()
  const [loc, setLoc] = useState<{ stamp: Stamp; near: string } | null>(null)
  const [locErr, setLocErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [shot, setShot] = useState<{ url: string; source: 'Camera' | 'Simulated' } | null>(null)
  const [reason, setReason] = useState('')
  const [device, setDevice] = useState<ReturnType<typeof deviceInfo> | null>(null)
  const step = !loc ? 1 : !shot ? 2 : 3
  const { video, state } = useStream(open && !!loc && !shot)

  useEffect(() => { if (!open) { setLoc(null); setShot(null); setLocErr(''); setReason(''); setBusy(false) } else setDevice(deviceInfo()) }, [open])

  const build = (lat: number, lng: number, accuracy: number, source: Stamp['source']) => {
    const n = nearest(sites, { lat, lng })
    if (!n) { setLocErr('No attendance site is set up yet.'); return }
    const inside = n.d <= rules.radius
    setLoc({ near: n.s.name, stamp: { t: new Date().toISOString(), site: inside ? n.s.name : `Off-site · ${dist(n.d)} from ${n.s.name}`, inside, lat, lng, accuracy, distance: n.d, source } })
  }
  const locate = () => {
    setBusy(true); setLocErr('')
    if (!navigator.geolocation) { setBusy(false); setLocErr('This browser cannot share location.'); return }
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); build(p.coords.latitude, p.coords.longitude, p.coords.accuracy, 'GPS') },
      (e) => { setBusy(false); setLocErr(e.code === 1 ? 'Location permission was blocked. Allow it in the browser to check in.' : 'Could not read your location. Move to an open area and try again.') },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }
  const demoLocation = () => sites[0] && build(sites[0].lat + 0.0004, sites[0].lng + 0.0003, 18, 'Simulated')

  const capture = () => {
    const v = video.current; if (!v || !loc) return
    const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * ((v.videoHeight || 480) / (v.videoWidth || 640)))
    const g = c.getContext('2d')!; g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(v, 0, 0, c.width, c.height); g.setTransform(1, 0, 0, 1, 0, 0)
    stamp(c, [`${who.name} · ${new Date(loc.stamp.t).toLocaleString('en-NG')}`, loc.stamp.site])
    setShot({ url: c.toDataURL('image/jpeg', 0.6), source: 'Camera' })
  }
  const simulate = () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240
    const g = c.getContext('2d')!; g.fillStyle = '#0B2530'; g.fillRect(0, 0, 320, 240)
    g.fillStyle = '#35D0BA'; g.beginPath(); g.arc(160, 100, 56, 0, 7); g.fill()
    g.fillStyle = '#0B2530'; g.font = '700 40px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(who.name.split(' ').map((x) => x[0]).slice(0, 2).join(''), 160, 114)
    g.textAlign = 'left'; stamp(c, [`SIMULATED · ${who.name}`, loc?.stamp.site ?? ''])
    setShot({ url: c.toDataURL('image/jpeg', 0.6), source: 'Simulated' })
  }
  const needsReason = !!loc && !loc.stamp.inside
  const ready = !!loc && !!shot && (!needsReason || reason.trim().length >= 10)
  const submit = () => {
    if (!loc || !shot) return
    const rec = clockIn(slug, { ...who, stamp: loc.stamp, selfie: shot.url, selfieSource: shot.source, reason: needsReason ? reason.trim() : undefined })
    toast(rec.flags.length ? 'Checked in. Sent to HR for verification.' : `Checked in at ${clock(rec.in.t)}`)
    onClose()
  }

  const row = (n: number, icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <div className={`flex gap-3 rounded-md border p-3 ${step === n ? 'border-teal bg-softmint/40' : 'border-line'}`}>
      <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step > n ? 'bg-teal text-white' : step === n ? 'bg-ink text-white' : 'bg-cloud text-slate'}`}>{step > n ? <Check size={14} /> : icon}</div>
      <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">{title}</div>{body}</div>
    </div>
  )

  return (
    <Overlay open={open} onClose={onClose} title="Clock in" wide>
      <div className="space-y-3">
        <p className="text-xs text-slate">Three checks confirm you are really here: your location, the device you are using, and a live selfie taken now. Nothing can be uploaded from your gallery.</p>
        {row(1, <MapPin size={14} />, 'Location', loc ? (
          <div className="mt-1 text-slate"><b className="text-ink">{loc.stamp.site}</b> · {loc.stamp.inside ? <span className="text-ok">inside the {rules.radius} m site boundary</span> : <span className="text-warn">outside the site boundary</span>}<div className="num mt-0.5 text-xs">{loc.stamp.lat.toFixed(5)}, {loc.stamp.lng.toFixed(5)} · ±{Math.round(loc.stamp.accuracy)} m · {loc.stamp.source === 'GPS' ? 'device GPS' : 'simulated'}</div></div>
        ) : (
          <div className="mt-1"><p className="text-slate">We read your position once, only at the moment you clock in. It is not tracked afterwards.</p>
            {locErr && <p role="alert" className="mt-2 text-xs text-err">{locErr}</p>}
            <div className="mt-2 flex flex-wrap gap-2"><Btn s="sm" onClick={locate} disabled={busy}>{busy ? 'Locating…' : 'Share my location'}</Btn><Btn s="sm" v="secondary" onClick={demoLocation}>Use demo location</Btn></div></div>
        ))}
        {row(2, <Laptop size={14} />, 'Device', device && (
          <div className="mt-1 text-slate"><b className="text-ink">{device.label}</b><div className="num text-xs">{device.id} · captured automatically</div></div>
        ))}
        {row(3, <Camera size={14} />, 'Live selfie', shot ? (
          <div className="mt-2 flex items-start gap-3"><img src={shot.url} alt="Your check-in selfie" className="w-40 rounded-md border border-line" /><div className="text-xs text-slate">{shot.source === 'Camera' ? 'Captured from your camera and stamped with the time and place.' : 'Simulated image. HR will see this check-in is flagged.'}<div><button type="button" className="mt-2 font-semibold text-teal underline" onClick={() => setShot(null)}>Retake</button></div></div></div>
        ) : loc ? (
          <div className="mt-2">
            {state === 'denied' ? (
              <div className="rounded-md bg-cloud p-3 text-xs text-slate">Camera is not available or permission was blocked. Allow camera access to take your selfie.<div className="mt-2"><Btn s="sm" v="secondary" onClick={simulate}>Use a simulated selfie (demo)</Btn></div></div>
            ) : (
              <><div className="relative w-full max-w-xs overflow-hidden rounded-md bg-ink"><video ref={video} muted playsInline className="aspect-[4/3] w-full -scale-x-100 object-cover" /><div className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-mint/70" /></div>
                <p className="mt-2 text-xs text-slate">Centre your face in the circle, in good light, then capture.</p>
                <Btn className="mt-2" s="sm" onClick={capture} disabled={state !== 'live'}><Camera size={14} />Capture selfie</Btn></>
            )}
          </div>
        ) : <p className="mt-1 text-slate">Unlocks once your location is confirmed.</p>)}
        {needsReason && shot && (
          <Field label="Why are you checking in away from the office?" hint="Required. HR reviews every off-site check-in.">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={inputCls} placeholder="e.g. Client meeting at a customer site" />
          </Field>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-slate">Shift starts {rules.start}. Grace of {rules.grace} minutes.</span>
          <Btn onClick={submit} disabled={!ready}>Confirm check-in</Btn>
        </div>
      </div>
    </Overlay>
  )
}

function Detail({ rec, onClose, canReview, me, slug }: { rec: Rec | null; onClose: () => void; canReview: boolean; me: { name: string; empId: string }; slug: string }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  useEffect(() => setNote(''), [rec?.id])
  if (!rec) return null
  const own = rec.empId === me.empId
  const decide = (s: 'Verified' | 'Rejected') => {
    if (s === 'Rejected' && note.trim().length < 5) { toast('Add a reason before rejecting', 'err'); return }
    reviewRecord(slug, rec.id, s, me.name, note.trim()); toast(`Check-in ${s.toLowerCase()}`); onClose()
  }
  const kv = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5 text-sm"><span className="text-slate">{k}</span><span className="text-right font-medium">{v}</span></div>
  return (
    <Overlay open onClose={onClose} title={`${rec.name} · ${rec.date}`} side>
      <div className="flex items-center gap-3"><Selfie rec={rec} size={72} /><div><div className="font-semibold">{rec.name}</div><div className="text-xs text-slate">{rec.dept} · {rec.empId}</div><div className="mt-1 flex flex-wrap gap-1.5"><Badge tone={rec.status === 'Late' ? 'amber' : 'green'}>{rec.status}</Badge>{rec.flags.map((f) => <Badge key={f} tone="red">{f}</Badge>)}</div></div></div>
      <div className="mt-4 divide-y divide-line">
        {kv('Clock in', clock(rec.in.t))}{kv('Clock out', rec.out ? clock(rec.out.t) : 'Still in')}
        {kv('Location', rec.in.site)}{kv('Distance from site', dist(rec.in.distance))}
        {kv('Coordinates', <span className="num">{rec.in.lat.toFixed(4)}, {rec.in.lng.toFixed(4)} · ±{Math.round(rec.in.accuracy)} m</span>)}
        {kv('Device', rec.in.device.label)}{kv('Device ID', <span className="num">{rec.in.device.id} {rec.in.device.known ? '· registered' : '· new'}</span>)}
        {kv('Selfie', rec.in.selfieSource === 'None' ? 'Archived' : rec.in.selfieSource)}
      </div>
      {rec.in.reason && <div className="mt-3 rounded-md bg-cloud p-3 text-sm"><b>Reason given:</b> {rec.in.reason}</div>}
      {rec.review?.status === 'Pending' && canReview && (
        own ? <p className="mt-4 rounded-md bg-cloud p-3 text-sm text-slate">You cannot verify your own check-in. Another reviewer will.</p> : (
          <div className="mt-4 space-y-2"><Field label="Reviewer note" hint="Required to reject."><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
            <div className="flex gap-2"><Btn onClick={() => decide('Verified')}>Verify</Btn><Btn v="secondary" onClick={() => decide('Rejected')}>Reject</Btn></div></div>)
      )}
      {rec.review && rec.review.status !== 'Pending' && <div role="status" className="mt-4 rounded-md bg-softmint p-3 text-sm"><b>{rec.review.status}</b> by {rec.review.by} · {rec.review.at && new Date(rec.review.at).toLocaleString('en-NG')}{rec.review.note && <><br />{rec.review.note}</>}</div>}
    </Overlay>
  )
}

const reviewBadge = (r: Rec) => r.review ? <Badge tone={r.review.status === 'Verified' ? 'green' : r.review.status === 'Rejected' ? 'red' : 'amber'}>{r.review.status === 'Pending' ? 'Needs review' : r.review.status}</Badge> : <Badge tone="green">Auto-verified</Badge>

export default function Attendance({ date }: { date: string }) {
  const { role, r, can } = useRole()
  const tenant = useTenant()
  const slug = tenant?.slug ?? 'demo'
  const toast = useToast()
  const { records, rules, sites } = useAttendance(slug)
  const employees = employeesForTenant(slug)
  const meEmp = employees.find((e) => e.name === r.user)
  const me = { empId: meEmp?.id ?? r.id, name: r.user, dept: meEmp?.dept ?? r.title }
  const manage = MANAGE.includes(role)
  const canConfigure = CONFIGURE.includes(role) && can('attendance.manage')
  const canReviewExceptions = manage && can('attendance.manage')
  const [tab, setTab] = useState('My attendance')
  const [flow, setFlow] = useState(false)
  const [view, setView] = useState<Rec | null>(null)
  const [now, setNow] = useState(new Date())
  const [siteDraft, setSiteDraft] = useState({ name: '', lat: '', lng: '' })
  const [siteErr, setSiteErr] = useState('')
  const [draft, setDraft] = useState<Rules>(rules)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => setDraft(rules), [rules])

  const today = todayKey()
  const isToday = date === today
  const dayLong = new Date(date + 'T00:00:00Z').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const mine = records.filter((x) => x.empId === me.empId)
  const mineToday = mine.find((x) => x.date === today)
  const dayRows = useMemo(() => employees.filter((e) => e.status !== 'Onboarding').map((e) => ({ e, a: attendanceOn(e, isApprover(e, employees), date, records) })), [employees, date, records])
  const myDay = dayRows.find((x) => x.e.id === me.empId)?.a ?? (meEmp ? attendanceOn(meEmp, false, date, records) : null)
  const pending = records.filter((x) => x.review?.status === 'Pending')
  const tabs = ['My attendance', ...(manage ? ['Team', `Exceptions${pending.length ? ` (${pending.length})` : ''}`, 'Rules & sites'] : [])]
  const key = tab.split(' (')[0]

  const out = () => {
    if (!mineToday) return
    const done = (s: Stamp, m: string) => { clockOut(slug, mineToday.id, s); toast(m) }
    const fallback = () => { const s = sites[0]; if (!s) { toast('Add an attendance site first'); return } done({ t: new Date().toISOString(), site: s.name, inside: true, lat: s.lat, lng: s.lng, accuracy: 18, distance: 30, source: 'Simulated' }, 'Clocked out (simulated location)') }
    if (!navigator.geolocation) { fallback(); return }
    navigator.geolocation.getCurrentPosition(
      (p) => { const n = nearest(sites, { lat: p.coords.latitude, lng: p.coords.longitude }); if (!n) { fallback(); return } const inside = n.d <= rules.radius; done({ t: new Date().toISOString(), site: inside ? n.s.name : `Off-site · ${dist(n.d)} from ${n.s.name}`, inside, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, distance: n.d, source: 'GPS' }, 'Clocked out') },
      fallback,
      { timeout: 8000 },
    )
  }

  const hours = (x: Rec) => x.out ? `${((new Date(x.out.t).getTime() - new Date(x.in.t).getTime()) / 3.6e6).toFixed(1)} h` : '—'

  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-6 space-y-5">
        {key === 'My attendance' && (
          <>
            <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
              <Panel>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate">{now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                <div className="num mt-1 font-display text-5xl font-semibold tracking-tight">{now.toLocaleTimeString('en-NG', { hour12: false })}</div>
                {!mineToday && sites.length === 0 && <><p className="mt-3 text-sm text-slate">No attendance site has been set up yet, so check-in is not available. {canConfigure ? 'Add your office location to start recording attendance.' : 'Ask your administrator to add an office location.'}</p>{canConfigure && <Btn className="mt-4" s="lg" onClick={() => setTab('Rules & sites')}><MapPin size={16} />Set up attendance sites</Btn>}</>}
                {!mineToday && sites.length > 0 && <><p className="mt-3 text-sm text-slate">You have not clocked in today. Shift starts at {rules.start}, with {rules.grace} minutes of grace.</p><Btn className="mt-4" s="lg" onClick={() => setFlow(true)}><Clock size={16} />Clock in</Btn></>}
                {mineToday && (
                  <div className="mt-4 flex items-start gap-4"><Selfie rec={mineToday} size={64} />
                    <div className="text-sm"><div className="font-semibold">Clocked in at {clock(mineToday.in.t)} <Badge tone={mineToday.status === 'Late' ? 'amber' : 'green'}>{mineToday.status === 'Late' ? `${mineToday.minutesLate} min late` : 'On time'}</Badge></div>
                      <div className="mt-0.5 text-slate">{mineToday.in.site} · {mineToday.in.device.label}</div>
                      {mineToday.flags.length > 0 && <div className="mt-1 flex items-center gap-1.5 text-xs text-warn"><CircleAlert size={13} />Sent to HR: {mineToday.flags.join(', ')}</div>}
                      {mineToday.out ? <div className="mt-2 text-slate">Clocked out at {clock(mineToday.out.t)} · {hours(mineToday)}</div> : <Btn className="mt-3" s="sm" v="secondary" onClick={out}>Clock out</Btn>}
                    </div></div>
                )}
              </Panel>
              <Panel title="Why this is trustworthy">
                <ul className="space-y-3 text-sm">
                  {[[<MapPin size={15} key="a" />, 'Geofenced', `Check-in counts inside ${rules.radius} m of a company site. Anywhere else needs a reason.`], [<Laptop size={15} key="b" />, 'Device-bound', 'Your first device is registered. A different one is flagged for HR.'], [<Camera size={15} key="c" />, 'Live selfie only', 'Taken at the moment of check-in and stamped with time and place.'], [<ShieldCheck size={15} key="d" />, 'No self-approval', 'Flagged check-ins are decided by another person, with a note.']].map(([i, h, d]) => (
                    <li key={String(h)} className="flex gap-3"><span className="mt-0.5 text-teal">{i}</span><span><b>{h}.</b> <span className="text-slate">{d}</span></span></li>))}
                </ul>
                <p className="mt-3 border-t border-line pt-3 text-xs text-slate">Selfies are used only for attendance, visible to HR and your manager, and removed after 90 days.</p>
              </Panel>
            </div>
            {!isToday && myDay && (
              <Panel title={`My day · ${dayLong}`}>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
                  <Badge tone={myDay.tone}>{myDay.label}</Badge>
                  {myDay.in && <div><div className="text-xs text-slate">Clocked in</div><div className="num font-semibold">{myDay.in}</div></div>}
                  {myDay.out && <div><div className="text-xs text-slate">Clocked out</div><div className="num font-semibold">{myDay.out}</div></div>}
                  {myDay.hours != null && <div><div className="text-xs text-slate">Hours</div><div className="num font-semibold">{myDay.hours.toFixed(1)} h</div></div>}
                  {myDay.lateMins > 0 && <div><div className="text-xs text-slate">Late by</div><div className="num font-semibold text-warn">{myDay.lateMins} min</div></div>}
                  {myDay.site && <div><div className="text-xs text-slate">Location</div><div className="font-semibold">{myDay.site}</div></div>}
                </div>
                {!myDay.rec && myDay.in && <p className="mt-3 text-xs text-slate">From the attendance history. Times are as recorded for that day.</p>}
                {myDay.rec && <Btn className="mt-3" s="sm" v="secondary" onClick={() => setView(myDay.rec!)}>View check-in details</Btn>}
              </Panel>
            )}
            <Panel title="My recent check-ins" pad={false}>
              {mine.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate">Your check-ins will appear here.</p> : (
                <Table head={['Date', 'In', 'Out', 'Hours', 'Location', 'Status', 'Verification']} rows={mine.slice(0, 12).map((x) => [x.date, clock(x.in.t), x.out ? clock(x.out.t) : '—', hours(x), x.in.site, <Badge key="s" tone={x.status === 'Late' ? 'amber' : 'green'}>{x.status}</Badge>, reviewBadge(x)])} />
              )}
            </Panel>
          </>
        )}

        {key === 'Team' && (() => {
          const active = dayRows.filter((x) => x.e.status === 'Active' || x.a.rec)
          const present = active.filter((x) => x.a.label === 'On time' || x.a.label === 'Late')
          const late = active.filter((x) => x.a.label === 'Late').length
          const away = active.filter((x) => x.a.label === 'Absent' || x.a.label === 'Not in yet').length
          const leave = active.filter((x) => x.a.label === 'On leave').length
          const recorded = active.some((x) => !['Weekend', 'Upcoming', 'No record'].includes(x.a.label))
          const order = (l: string) => ['Late', 'On time', 'Not in yet', 'Absent', 'On leave'].indexOf(l)
          return (
            <>
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                {[['Checked in', String(present.length), `of ${active.length} staff`], ['Late', String(late), `after ${rules.start} + ${rules.grace} min`], [isToday ? 'Not yet in' : 'Absent', String(away), isToday ? 'including remote and field' : 'no check-in, no leave'], ['On leave', String(leave), 'approved leave']].map(([l, v, sub]) => <Panel key={l}><Stat label={l} value={v} sub={sub} /></Panel>)}
              </div>
              {pending.length > 0 && isToday && <p className="text-xs text-slate">{pending.length} check-in{pending.length === 1 ? '' : 's'} need review under Exceptions.</p>}
              <Panel title={`${isToday ? 'Today' : 'Team'} · ${dayLong}`} pad={false}>
                {!recorded ? <p className="px-5 py-10 text-center text-sm text-slate">No attendance is recorded for this day. It is a weekend, a future date or before staff started.</p> : (
                  <Table pageSize={12} head={['Employee', 'Location', 'In', 'Out', 'Hours', 'Status', 'Verification', '']} rows={[...active].sort((a, b) => order(a.a.label) - order(b.a.label)).map(({ e, a }) => [
                    <span key="n" className="flex items-center gap-3 font-semibold">{a.rec ? <Selfie rec={a.rec} size={28} /> : <Avatar name={e.name} size={28} />}{e.name}</span>,
                    a.site ?? (a.label === 'Not in yet' || a.label === 'Absent' ? e.branch : '—'), a.in ?? '—', a.out ?? '—', a.hours != null ? `${a.hours.toFixed(1)} h` : '—',
                    <Badge key="s" tone={a.tone}>{a.label === 'Not in yet' && (e.mode === 'Remote' || e.mode === 'Field') ? e.mode : a.label}</Badge>,
                    a.rec ? reviewBadge(a.rec) : a.in ? <span key="v" className="text-xs text-slate">History</span> : '—',
                    a.rec ? <Btn key="v" s="sm" v="secondary" onClick={() => setView(a.rec!)}>View</Btn> : '',
                  ])} />
                )}
              </Panel>
            </>
          )
        })()}

        {key === 'Exceptions' && (
          <Panel title="Check-ins awaiting a decision" pad={false}>
            {pending.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate">Nothing to review. Every check-in passed location, device and selfie checks.</p> : (
              <Table head={['Employee', 'Date', 'Flags', 'Location', 'Reason given', '']} rows={pending.map((x) => [<span key="n" className="flex items-center gap-3 font-semibold"><Selfie rec={x} size={28} />{x.name}</span>, x.date, <span key="f" className="flex flex-wrap gap-1">{x.flags.map((f) => <Badge key={f} tone="red">{f}</Badge>)}</span>, x.in.site, <span key="r" className="text-xs text-slate">{x.in.reason ?? '—'}</span>, <Btn key="b" s="sm" onClick={() => setView(x)}>Review</Btn>])} />
            )}
          </Panel>
        )}

        {key === 'Rules & sites' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Company sites" pad={false}>
              {sites.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate">No sites yet. Add your first office or work location so staff can check in inside its boundary.</p>}
              {sites.length > 0 && <Table head={['Site', 'Coordinates', 'Boundary', '']} rows={sites.map((s) => [s.name, <span key="c" className="num text-xs">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</span>, `${rules.radius} m`, canConfigure && isOwnDataset(slug) ? <Btn key="r" s="sm" v="ghost" onClick={() => removeSite(slug, s.id)}>Remove</Btn> : ''])} />}
              {canConfigure && isOwnDataset(slug) && (
                <form className="space-y-3 border-t border-line p-5" onSubmit={(e) => {
                  e.preventDefault()
                  const lat = Number(siteDraft.lat), lng = Number(siteDraft.lng)
                  if (!siteDraft.name.trim()) { setSiteErr('Give the site a name.'); return }
                  if (siteDraft.lat === '' || siteDraft.lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setSiteErr('Enter valid latitude and longitude, or use your current location.'); return }
                  addSite(slug, { name: siteDraft.name.trim(), lat, lng }); setSiteDraft({ name: '', lat: '', lng: '' }); setSiteErr(''); toast('Site added')
                }}>
                  <Field label="Site name"><input className={inputCls} value={siteDraft.name} onChange={(e) => setSiteDraft({ ...siteDraft, name: e.target.value })} placeholder="e.g. Head office" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Latitude"><input className={inputCls} inputMode="decimal" value={siteDraft.lat} onChange={(e) => setSiteDraft({ ...siteDraft, lat: e.target.value })} /></Field>
                    <Field label="Longitude"><input className={inputCls} inputMode="decimal" value={siteDraft.lng} onChange={(e) => setSiteDraft({ ...siteDraft, lng: e.target.value })} /></Field>
                  </div>
                  {siteErr && <p role="alert" className="text-sm text-err">{siteErr}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Btn type="submit">{sites.length ? 'Add site' : 'Add your first site'}</Btn>
                    <Btn type="button" v="secondary" onClick={() => { if (!navigator.geolocation) { setSiteErr('This browser cannot share location.'); return } navigator.geolocation.getCurrentPosition((p) => setSiteDraft((d) => ({ ...d, lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) })), () => setSiteErr('Could not read your location. Enter the coordinates instead.'), { timeout: 10000 }) }}>Use my current location</Btn>
                  </div>
                </form>
              )}
            </Panel>
            <Panel title="Shift and boundary rules">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveRules(slug, draft); toast('Attendance rules saved') }}>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Shift starts"><input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} disabled={!canConfigure} className={inputCls} /></Field>
                  <Field label="Grace (min)"><input type="number" min={0} max={120} value={draft.grace} onChange={(e) => setDraft({ ...draft, grace: Number(e.target.value) })} disabled={!canConfigure} className={inputCls} /></Field>
                  <Field label="Boundary (m)"><input type="number" min={25} max={2000} value={draft.radius} onChange={(e) => setDraft({ ...draft, radius: Number(e.target.value) })} disabled={!canConfigure} className={inputCls} /></Field>
                </div>
                {canConfigure ? <div className="flex gap-2"><Btn type="submit" disabled={JSON.stringify(draft) === JSON.stringify(rules)}>Save rules</Btn><Btn v="secondary" type="button" onClick={() => setDraft(DEFAULT_RULES)}>Reset to default</Btn></div> : <p className="text-sm text-slate">Only HR and administrators can change the rules.</p>}
                <p className="text-xs text-slate">Remote and field staff check in from anywhere with a reason, and HR confirms. Rule changes are written to the audit trail.</p>
              </form>
            </Panel>
          </div>
        )}
      </div>
      <ClockInFlow open={flow} onClose={() => setFlow(false)} slug={slug} sites={sites} rules={rules} who={me} />
      <Detail rec={view} onClose={() => setView(null)} canReview={canReviewExceptions} me={me} slug={slug} />
    </div>
  )
}
