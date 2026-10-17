import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check, Eye, FileUp, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Badge, Btn, Field, Overlay, Stepper, inputCls, useToast } from '../../components/ui'
import { businessSession, completeInvite, createInvite, demoAccountsFor, findInvite, inviteState, useApplyBrand, useOnboardingSubmissions, useTenants, useTenant, host } from '../../tenant/store'
import { StateScreen } from '../../tenant/states'
import { PoweredBy, TenantMark } from '../../tenant/ui'
import { STATES } from '../app/CompanySettings'

const STEPS = ['About you', 'Contact', 'Identity', 'Employment', 'Payroll', 'Emergency', 'Documents', 'Review']
const BANKS = ['Access Bank', 'GTBank', 'First Bank', 'UBA', 'Wema Bank', 'Stanbic IBTC', 'Fidelity Bank', 'Kuda', 'Opay']
const DOCS = ['Passport photograph', 'Valid ID (NIN slip, passport or driver\'s licence)', 'Highest qualification certificate', 'Signed offer letter']
type V = Record<string, string>
type UploadedDocument = { name: string; url: string }

export default function EmployeeOnboarding() {
  const { slug = '', code = '' } = useParams()
  const t = useTenant(slug)
  const nav = useNavigate()
  const toast = useToast()
  useTenants()
  const inv = findInvite(code)
  const st = inviteState(inv, slug)
  const session = businessSession()
  const signedInAccount = t && session?.slug === t.slug ? demoAccountsFor(t).find((account) => account.email === session.email && account.roleKey === 'businessdev') : undefined
  const accountNames = signedInAccount?.name.split(' ') ?? []
  const [at, setAt] = useState(0)
  const [done, setDone] = useState(false)
  const [approvalNotice, setApprovalNotice] = useState(false)
  const [v, setV] = useState<V>({ first: accountNames[0] ?? '', middle: '', last: accountNames.slice(1).join(' '), preferred: accountNames[0] ?? '', dob: '', gender: 'Female', marital: 'Single', nationality: 'Nigerian', origin: '', lga: '', nin: '', taxId: '', passport: '', email: signedInAccount?.email ?? '', phone: '', altPhone: '', address: '', city: '', state: t?.profile.state ?? 'Lagos', title: signedInAccount?.title ?? 'Assigned by HR', dept: signedInAccount ? 'Business Development' : 'Assigned by HR', employeeId: 'Assigned on approval', manager: 'Assigned by HR', location: t?.profile.state ?? 'Lagos', workMode: 'Hybrid', grade: 'Assigned by HR', start: '2026-11-03', type: 'Full-time', bank: 'GTBank', acct: '', acctName: signedInAccount?.name ?? '', rsa: '', pension: '', hmo: '', blood: 'Prefer not to say', accessibility: '', ecName: '', ecRel: 'Spouse', ecPhone: '', ecEmail: '', ecAddress: '' })
  const [files, setFiles] = useState<Record<string, UploadedDocument>>({})
  useApplyBrand(t)
  if (!t) return <StateScreen icon="link" title="We could not find this workspace" body="Check the address in your invitation, or ask your HR team to send a new link." actions={<Btn to="/">Go to BizFlow</Btn>} />
  if (st !== 'ok' && !done) {
    const M = {
      invalid: ['link', 'This onboarding link is not valid', 'The link may have been copied incorrectly. Ask your HR team to send you a new one.'],
      expired: ['clock', 'This onboarding link has expired', 'Links are valid for 7 days. Ask your HR team to send you a fresh link.'],
      revoked: ['ban', 'This onboarding link was cancelled', `${t.profile.name} cancelled this invitation. Contact HR if you think this is a mistake.`],
      used: ['lock', 'This link has already been used', 'Your details were submitted. Sign in to your workspace instead.'],
      'wrong-tenant': ['shield', 'This link belongs to a different company', `For security, this invitation cannot be used with ${t.profile.name}. Open the link exactly as it was sent to you.`],
    } as const
    const [ic, ti, bo] = M[st]
    return <StateScreen tenant={t} icon={ic} title={ti} body={bo} actions={st === 'used' ? <Btn to={`/w/${t.slug}/login`}>Go to sign in</Btn> : <Btn v="secondary" to={`/w/${t.slug}/login`}>Contact HR / sign in</Btn>} />
  }
  const p = (k: string) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }), className: inputCls })
  const sel = (k: string, o: string[]) => <select {...p(k)}>{o.map((x) => <option key={x}>{x}</option>)}</select>
  const valid = [v.first && v.last && v.dob, /\S+@\S+/.test(v.email) && v.phone && v.address, v.nationality && v.origin, v.title && v.start, /^\d{10}$/.test(v.acct), v.ecName && v.ecPhone && /\S+@\S+/.test(v.ecEmail) && v.ecAddress, true, true][at]
  const grid = 'grid gap-4 sm:grid-cols-2'
  const advance = () => {
    if (!valid) return
    if (at < STEPS.length - 1) {
      if (at === 6) toast('Uploaded documents saved to your onboarding draft.')
      setAt((current) => Math.min(current + 1, STEPS.length - 1))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    completeInvite(code, `${v.first} ${v.middle ? `${v.middle} ` : ''}${v.last}`, { email: v.email, phone: v.phone, title: v.title, department: v.dept, documents: Object.values(files).map((file) => file.name) })
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-line bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4"><TenantMark t={t} size={36} /><div className="min-w-0"><div className="truncate font-display text-base font-semibold">{t.profile.name}</div><div className="font-mono text-[11px] text-slate">{host(t.slug)}/onboarding/{code}</div></div></div></header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {done ? (
          <div className="rounded-lg border border-line bg-white p-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-softmint text-teal"><Check size={28} /></span>
            <h1 className="mt-5 text-2xl font-semibold">Your part is complete, {v.first}</h1>
            <p className="mt-2 text-slate">Your details and documents have been submitted securely to HR for review. Workspace access starts only after HR approves your onboarding.</p>
            <Btn className="mt-6" onClick={() => setApprovalNotice(true)}>Open my dashboard</Btn>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-midnight text-white on-dark">
              <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-mint"><Sparkles size={13} />Welcome to the team</div><h1 className="text-2xl font-semibold md:text-3xl">Let’s build your employee profile</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/65">Complete your details once, securely. HR will review your submission before your workspace access and department setup are activated.</p></div><div className="rounded-lg border border-white/10 bg-white/5 px-5 py-4 text-center"><div className="num font-display text-3xl font-semibold text-mint">{Math.round(((at + 1) / STEPS.length) * 100)}%</div><div className="mt-1 text-xs text-white/55">Profile progress</div></div></div>
              <div className="h-1 bg-white/10"><div className="h-full bg-mint transition-all" style={{ width: `${((at + 1) / STEPS.length) * 100}%` }} /></div>
            </div>
            <div className="my-6 overflow-x-auto"><Stepper steps={STEPS} at={at} /></div>
            <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
            <form key={at} onSubmit={(e) => { e.preventDefault(); advance() }} className="rounded-xl border border-line bg-white p-5 shadow-sm md:p-7">
              <div className="mb-5 flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wider text-teal">Step {at + 1} of {STEPS.length}</div><h2 className="mt-1 text-xl font-semibold">{STEPS[at]}</h2></div><Badge tone="teal">Autosaved</Badge></div>
              {at === 0 && <div className={grid}><Field label="First name"><input {...p('first')} /></Field><Field label="Middle name (optional)"><input {...p('middle')} /></Field><Field label="Last name"><input {...p('last')} /></Field><Field label="Preferred name"><input {...p('preferred')} /></Field><Field label="Date of birth"><input type="date" {...p('dob')} /></Field><Field label="Gender">{sel('gender', ['Female', 'Male', 'Prefer not to say'])}</Field><Field label="Marital status">{sel('marital', ['Single', 'Married', 'Other', 'Prefer not to say'])}</Field><Field label="Blood group (optional)">{sel('blood', ['Prefer not to say', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'])}</Field></div>}
              {at === 1 && <div className={grid}><Field label="Personal email"><input type="email" {...p('email')} /></Field><Field label="Primary phone"><input {...p('phone')} placeholder="+234" /></Field><Field label="Alternative phone (optional)"><input {...p('altPhone')} placeholder="+234" /></Field><Field label="City / town"><input {...p('city')} /></Field><div className="sm:col-span-2"><Field label="Residential address"><textarea rows={2} {...p('address')} className={`${inputCls} h-auto py-2`} /></Field></div><Field label="State of residence">{sel('state', STATES)}</Field><div className="sm:col-span-2"><Field label="Accessibility or workplace support (optional)" hint="Tell HR about any accommodation that would help you work comfortably."><textarea rows={2} {...p('accessibility')} className={`${inputCls} h-auto py-2`} /></Field></div></div>}
              {at === 2 && <div><div className="mb-4 rounded-lg border border-teal/20 bg-softmint/50 p-4 text-sm"><div className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-teal" /><p><b>Used only for verified employment records.</b><br /><span className="text-slate">Sensitive identity and statutory details are restricted to authorised HR and payroll roles.</span></p></div></div><div className={grid}><Field label="Nationality"><input {...p('nationality')} /></Field><Field label="State of origin">{sel('origin', ['', ...STATES])}</Field><Field label="Local government area"><input {...p('lga')} /></Field><Field label="NIN (optional)"><input inputMode="numeric" maxLength={11} {...p('nin')} /></Field><Field label="Tax identification number (optional)"><input {...p('taxId')} /></Field><Field label="International passport number (optional)"><input {...p('passport')} /></Field></div></div>}
              {at === 3 && <div><div className="mb-4 rounded-md border border-info/30 bg-blue-50 p-3 text-sm text-blue-800"><b>Confirmed by HR</b><br />These details form part of your approved employment record. Contact HR if anything is incorrect.</div><div className={grid}><Field label="Employee ID"><input disabled {...p('employeeId')} /></Field><Field label="Job title"><input disabled {...p('title')} /></Field><Field label="Department"><input disabled {...p('dept')} /></Field><Field label="Line manager"><input disabled {...p('manager')} /></Field><Field label="Employment type"><input disabled {...p('type')} /></Field><Field label="Start date"><input disabled type="date" {...p('start')} /></Field><Field label="Primary location"><input disabled {...p('location')} /></Field><Field label="Work arrangement"><input disabled {...p('workMode')} /></Field><Field label="Grade / level"><input disabled {...p('grade')} /></Field></div></div>}
              {at === 4 && <div className={grid}><Field label="Bank">{sel('bank', BANKS)}</Field><Field label="Account number" hint="10-digit NUBAN"><input inputMode="numeric" maxLength={10} {...p('acct')} /></Field><div className="sm:col-span-2"><Field label="Account name"><input {...p('acctName')} /></Field></div><Field label="Pension administrator (optional)"><input {...p('pension')} placeholder="e.g. Stanbic IBTC Pension" /></Field><Field label="RSA PIN (optional)"><input {...p('rsa')} placeholder="PEN100..." /></Field><Field label="HMO provider / ID (optional)"><input {...p('hmo')} /></Field></div>}
              {at === 5 && <div className={grid}><Field label="Contact name"><input {...p('ecName')} /></Field><Field label="Relationship">{sel('ecRel', ['Spouse', 'Parent', 'Sibling', 'Friend', 'Other'])}</Field><Field label="Phone"><input {...p('ecPhone')} /></Field><Field label="Email"><input type="email" {...p('ecEmail')} /></Field><div className="sm:col-span-2"><Field label="Address"><textarea rows={2} {...p('ecAddress')} className={`${inputCls} h-auto py-2`} /></Field></div></div>}
              {at === 6 && (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {DOCS.map((d) => (
                    <li key={d} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <FileUp size={18} className="shrink-0 text-teal" /><span className="min-w-0 flex-1">{d}{files[d] && <span className="block truncate text-xs text-ok">{files[d].name} · Saved</span>}</span>
                      {files[d] ? <span className="flex items-center gap-1"><Btn type="button" s="sm" v="ghost" onClick={() => window.open(files[d].url, '_blank', 'noopener,noreferrer')}><Eye size={14} />View</Btn><label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-3 text-[13px] font-semibold text-teal hover:bg-softmint"><RefreshCw size={14} />Replace<input type="file" accept="image/*,.pdf,.doc,.docx" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) { URL.revokeObjectURL(files[d].url); setFiles({ ...files, [d]: { name: file.name, url: URL.createObjectURL(file) } }); toast(`${d} replaced and saved.`) } }} /></label><button type="button" aria-label={`Remove ${d}`} className="cursor-pointer p-2 text-slate hover:text-err" onClick={() => { URL.revokeObjectURL(files[d].url); const next = { ...files }; delete next[d]; setFiles(next) }}><X size={16} /></button></span> : <label className="cursor-pointer text-[13px] font-semibold text-teal">Upload<input type="file" accept="image/*,.pdf,.doc,.docx" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setFiles({ ...files, [d]: { name: file.name, url: URL.createObjectURL(file) } }); toast(`${d} uploaded and saved.`) } }} /></label>}
                    </li>
                  ))}
                </ul>
              )}
              {at === 7 && (
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {([['Name', `${v.first} ${v.middle} ${v.last}`.replace(/\s+/g, ' ')], ['Date of birth', v.dob], ['Email', v.email], ['Phone', v.phone], ['Identity', `${v.nationality} · ${v.origin || 'State not supplied'} · ${v.lga || 'LGA not supplied'}`], ['Role', `${v.title} · ${v.dept}`], ['Employment', `${v.type} · ${v.workMode} · starts ${v.start}`], ['Location', v.location], ['Bank', `${v.bank} · ${v.acct}`], ['Pension', `${v.pension || 'Provider not supplied'} · ${v.rsa || 'RSA PIN not supplied'}`], ['Emergency contact', `${v.ecName} (${v.ecRel}) · ${v.ecPhone} · ${v.ecEmail}`], ['Emergency address', v.ecAddress], ['Documents', `${Object.keys(files).length} of ${DOCS.length} uploaded`]] as const).map(([k, x]) => <div key={k}><dt className="text-xs text-slate">{k}</dt><dd className="font-medium">{x || '—'}</dd></div>)}
                </dl>
              )}
              <div className="mt-7 flex justify-between"><Btn type="button" v="ghost" disabled={at === 0} onClick={() => setAt((current) => Math.max(0, current - 1))}>Back</Btn><Btn type="submit" disabled={!valid}>{at === STEPS.length - 1 ? 'Submit to HR for review' : at === 6 ? 'Save documents & continue' : `Next: ${STEPS[at + 1]}`}</Btn></div>
            </form>
            <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-xl border border-line bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={16} className="text-teal" />Your data is protected</div><p className="mt-2 text-xs leading-relaxed text-slate">Only authorised HR and payroll staff can review sensitive fields. Your manager receives only the details needed for team setup.</p></div>
              <div className="rounded-xl border border-line bg-white p-4"><div className="text-sm font-semibold">Before you submit</div><ul className="mt-2 space-y-2 text-xs text-slate"><li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-teal" />Confirm names match your official documents.</li><li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-teal" />Use your active 10-digit NUBAN account.</li><li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-teal" />Upload clear, readable document copies.</li></ul></div>
              <p className="px-1 text-xs text-slate">Need help? Contact your HR team before submitting.</p>
            </aside>
            </div>
          </>
        )}
        <div className="mt-8 flex justify-center"><PoweredBy /></div>
      </main>
      <Overlay open={approvalNotice} onClose={() => setApprovalNotice(false)} title="HR approval pending">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Your onboarding has not yet been approved.</b><p className="mt-1">HR is reviewing your information and uploaded documents. You will receive access after approval, or a request if more details are needed.</p></div>
        <div className="mt-4 rounded-lg bg-cloud p-4 text-sm"><div className="font-semibold">What happens next</div><ul className="mt-2 space-y-1.5 text-slate"><li>1. HR verifies your profile and documents.</li><li>2. Responsible departments receive setup instructions.</li><li>3. You are notified when workspace access is active.</li></ul></div>
        <div className="mt-6 flex justify-end"><Btn onClick={() => { setApprovalNotice(false); nav(`/w/${t.slug}/onboarding-status`) }}>Check approval status</Btn></div>
      </Overlay>
    </div>
  )
}

export function OnboardingStatus() {
  const { slug = '' } = useParams()
  const tenant = useTenant(slug)
  const nav = useNavigate()
  const session = businessSession()
  const submissions = useOnboardingSubmissions(slug)
  const account = tenant && session?.slug === tenant.slug ? demoAccountsFor(tenant).find((item) => item.email === session.email) : undefined
  const submission = submissions.find((item) => item.email === account?.email)
  useApplyBrand(tenant)
  if (!tenant || !account) return <StateScreen icon="lock" title="Sign in to check onboarding" body="Use your new-staff account to view the latest HR review status." actions={<Btn to={`/w/${slug}/login`}>Go to sign in</Btn>} />
  if (!submission) return <StateScreen tenant={tenant} icon="link" title="No onboarding submission found" body="Start your secure self-onboarding to submit your details to HR." actions={<Btn onClick={() => nav(`/w/${slug}/onboarding/${createInvite(slug)}`)}>Start onboarding</Btn>} />
  const more = submission.status === 'More details required'
  const approved = submission.status === 'Approved'
  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-line bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4"><TenantMark t={tenant} size={36} /><div><div className="font-display font-semibold">{tenant.profile.name}</div><div className="text-xs text-slate">Staff onboarding status</div></div></div></header>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
          <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${approved ? 'bg-green-50 text-green-700' : more ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>{submission.status}</span>
          <h1 className="mt-4 text-2xl font-semibold">{approved ? 'Your workspace is ready' : more ? 'HR needs more information' : 'Your onboarding is with HR'}</h1>
          <p className="mt-2 text-sm text-slate">{approved ? 'HR approved your onboarding and the responsible departments have received their setup instructions.' : more ? submission.note || 'Review your details and submit the requested information.' : 'HR is checking your profile and documents. Dashboard access remains locked until approval.'}</p>
          <div className="mt-6 grid gap-3 rounded-lg bg-cloud p-4 text-sm sm:grid-cols-2"><div><span className="text-xs text-slate">Employee</span><div className="font-semibold">{submission.name}</div></div><div><span className="text-xs text-slate">Submitted</span><div className="font-semibold">{new Date(submission.submitted).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><div><span className="text-xs text-slate">Department</span><div className="font-semibold">{submission.department}</div></div><div><span className="text-xs text-slate">Documents</span><div className="font-semibold">{submission.documents.length} uploaded</div></div></div>
          {approved && <div className="mt-5 rounded-lg bg-softmint p-4"><div className="text-sm font-semibold">Setup notifications sent</div><ul className="mt-2 space-y-1 text-xs text-slate">{submission.notifications.map((notification) => <li key={notification}>✓ {notification}</li>)}</ul></div>}
          <div className="mt-6 flex flex-wrap gap-2">{approved ? <Btn onClick={() => { localStorage.setItem('bf-role', account.roleKey); nav('/admin/business/my') }}>Open my workspace</Btn> : more ? <Btn onClick={() => nav(`/w/${slug}/onboarding/${createInvite(slug)}`)}>Update my submission</Btn> : <Btn v="secondary" to={`/w/${slug}/login`}>Back to sign in</Btn>}</div>
        </div>
        <div className="mt-8 flex justify-center"><PoweredBy /></div>
      </main>
    </div>
  )
}
