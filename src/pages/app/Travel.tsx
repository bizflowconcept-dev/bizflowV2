import { useMemo, useState } from 'react'
import { BusFront, Plane, Receipt, Ship } from 'lucide-react'
import { Avatar, Badge, Btn, EmptyState, Field, Flow, inputCls, Overlay, PageHeader, Panel, Stat, Tabs, useToast } from '../../components/ui'
import { employeesForTenant, isOwnDataset, ngn } from '../../data/demo'
import type { Employee } from '../../data/demo'
import { useRole } from '../../components/app/AppLayout'
import { useTenant } from '../../tenant/store'

type Level = 'Junior' | 'Mid-level' | 'Senior' | 'Executive'
type Traveler = { id: string; name: string; level: Level; bank: string; account: string }
type Extra = { label: string; amount: number }
type TravelRequest = {
  id: string; owner: string; ownerId: string; branch: string; destination: string; purpose: string; mode: 'Flight' | 'Road' | 'Water'
  days: number; nights: number; travelers: Traveler[]; extras: Extra[]; status: string; preparation: string; disbursement: string
  preparationEvidence?: string; paymentEvidence?: string; retirement?: { amount: number; note: string; receipts: string[] }
}

const LEVELS: Level[] = ['Junior', 'Mid-level', 'Senior', 'Executive']
const initialPolicy: Record<Level, { day: number; night: number }> = {
  Junior: { day: 18000, night: 28000 },
  'Mid-level': { day: 28000, night: 42000 },
  Senior: { day: 45000, night: 65000 },
  Executive: { day: 75000, night: 105000 },
}
const levelFor = (salary: number): Level => salary >= 2000000 ? 'Executive' : salary >= 1000000 ? 'Senior' : salary >= 600000 ? 'Mid-level' : 'Junior'
const allowanceFor = (traveler: Traveler, days: number, nights: number, policy: typeof initialPolicy) => policy[traveler.level].day * days + policy[traveler.level].night * nights

const seedRequestsFor = (employees: Employee[]): TravelRequest[] => {
  const business = employees.find((employee) => employee.dept === 'Business Development') ?? employees[0]
  const partner = employees.find((employee) => employee.id !== business.id && employee.salary >= 1000000) ?? employees[1] ?? business
  const operations = employees.find((employee) => /operations|payment operations/i.test(employee.dept)) ?? employees[2] ?? business
  const traveler = (employee: Employee, bank: string, account: string): Traveler => ({ id: employee.id, name: employee.name, level: levelFor(employee.salary), bank, account })
  return [
    {
      id: 'TRV-2026-042', owner: business.name, ownerId: business.id, branch: business.branch, destination: 'Abuja', purpose: 'Partner meetings and new-market development presentation.', mode: 'Flight', days: 3, nights: 2,
      travelers: [traveler(business, 'GTBank', '•••• 4821'), traveler(partner, 'Access Bank', '•••• 1904')],
      extras: [{ label: 'Client gifts', amount: 85000 }, { label: 'Local transport', amount: 60000 }], status: 'Approved', preparation: 'Pending', disbursement: 'Pending',
    },
    {
      id: 'TRV-2026-037', owner: operations.name, ownerId: operations.id, branch: operations.branch, destination: 'Regional operations site', purpose: 'Operational site review and vendor performance meeting.', mode: 'Road', days: 2, nights: 1,
      travelers: [traveler(operations, 'UBA', '•••• 7730')],
      extras: [{ label: 'Safety equipment', amount: 45000 }], status: 'Approved', preparation: 'Ready', disbursement: 'Paid', preparationEvidence: 'Travel booking confirmation.pdf', paymentEvidence: 'Transfer receipt TRX-884120.pdf',
    },
  ]
}

export default function Travel() {
  const tenant = useTenant()
  const { role, r } = useRole()
  const toast = useToast()
  const employees = employeesForTenant(tenant?.slug)
  const initialRequests = isOwnDataset(tenant?.slug) ? [] : seedRequestsFor(employees)
  const [requests, setRequests] = useState(initialRequests)
  const [policy, setPolicy] = useState(initialPolicy)
  const [tab, setTab] = useState('My travel')
  const [selected, setSelected] = useState(initialRequests[0]?.id ?? '')
  const [createOpen, setCreateOpen] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [retireOpen, setRetireOpen] = useState(false)
  const [days, setDays] = useState(3)
  const [nights, setNights] = useState(2)
  const [travelerIds, setTravelerIds] = useState<string[]>([])
  const [mode, setMode] = useState<'Flight' | 'Road' | 'Water'>('Flight')
  const canPrepare = role === 'admin' || role === 'md' || role === 'operations'
  const canFinance = role === 'md' || role === 'finance'
  const canSetPolicy = role === 'admin' || role === 'md'
  const canViewCompany = ['admin', 'md', 'hr', 'finance', 'operations', 'bdmanager', 'manager', 'auditor'].includes(role)
  if (!tenant) return null

  const employeeForUser = employees.find((employee) => employee.id === r.id || employee.name === r.user) ?? employees[0]
  const current = requests.find((request) => request.id === selected) ?? requests[0] as TravelRequest | undefined
  const tabs = ['My travel', ...(canViewCompany ? ['Company requests'] : []), ...(canPrepare ? ['Travel preparation'] : []), ...(canFinance ? ['Finance & disbursement'] : []), ...(canSetPolicy ? ['Allowance policy'] : [])]
  const makeTraveler = (id: string): Traveler => {
    const employee = employees.find((item) => item.id === id) ?? employeeForUser
    return { id: employee.id, name: employee.name, level: levelFor(employee.salary), bank: ['GTBank', 'Access Bank', 'UBA', 'Wema Bank'][employees.indexOf(employee) % 4], account: `•••• ${String(4100 + employees.indexOf(employee) * 317).slice(-4)}` }
  }
  const draftTravelers = useMemo(() => [makeTraveler(employeeForUser.id), ...travelerIds.filter((id) => id !== employeeForUser.id).map(makeTraveler)], [travelerIds, employeeForUser.id]) // eslint-disable-line
  const draftAllowance = draftTravelers.reduce((sum, traveler) => sum + allowanceFor(traveler, days, nights, policy), 0)

  const createRequest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const extras = [
      { label: 'Gifts', amount: Number(data.get('gifts')) || 0 },
      { label: 'Entertainment', amount: Number(data.get('entertainment')) || 0 },
      { label: 'Local transport / other', amount: Number(data.get('other')) || 0 },
    ].filter((extra) => extra.amount > 0)
    const request: TravelRequest = {
      id: `TRV-2026-${String(43 + requests.length).padStart(3, '0')}`, owner: employeeForUser.name, ownerId: employeeForUser.id, branch: employeeForUser.branch,
      destination: String(data.get('destination')), purpose: String(data.get('purpose')), mode, days, nights, travelers: draftTravelers, extras,
      status: 'Pending approval', preparation: 'Waiting for approval', disbursement: 'Waiting for approval',
    }
    setRequests([request, ...requests]); setSelected(request.id); setCreateOpen(false); setTab('My travel'); setTravelerIds([]); toast(`${request.id} submitted for approval.`)
  }
  const patch = (change: Partial<TravelRequest>) => setRequests(requests.map((request) => request.id === current?.id ? { ...request, ...change } : request))
  const retire = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const receipts = [...((event.currentTarget.elements.namedItem('receipts') as HTMLInputElement).files ?? [])].map((file) => file.name)
    patch({ retirement: { amount: Number(data.get('amount')), note: String(data.get('note')), receipts }, status: 'Retirement submitted' })
    setRetireOpen(false); toast('Travel retirement submitted to Finance with receipts.')
  }

  return (
    <div>
      <PageHeader eyebrow="Operations · Travel" title="Travel management" desc="From staff request and allowance calculation to branch preparation, disbursement and post-trip retirement." actions={<Btn onClick={() => setCreateOpen(true)}>New travel request</Btn>} />
      <Tabs tabs={tabs} value={tabs.includes(tab) ? tab : 'My travel'} onChange={setTab} />
      <div className="mt-6">
        {(tab === 'My travel' || tab === 'Company requests') && (!current ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No travel requests yet" body="Request travel for yourself or a team and the allowance is calculated from your policy." action={<Btn onClick={() => setCreateOpen(true)}>Create your first travel request</Btn>} /></div> : <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
          <Panel title={tab === 'My travel' ? 'My requests and notifications' : 'Company travel requests'} pad={false}>
            <div className="divide-y divide-line">{requests.filter((request) => tab === 'Company requests' || request.owner === r.user || request.travelers.some((traveler) => traveler.name === r.user)).map((request) => <button key={request.id} onClick={() => setSelected(request.id)} className={`flex w-full cursor-pointer gap-3 p-4 text-left ${selected === request.id ? 'bg-softmint/60' : 'hover:bg-cloud'}`}><span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${request.mode === 'Flight' ? 'bg-blue-50 text-info' : request.mode === 'Water' ? 'bg-softmint text-teal' : 'bg-amber-50 text-warn'}`}>{request.mode === 'Flight' ? <Plane size={19} /> : request.mode === 'Water' ? <Ship size={19} /> : <BusFront size={19} />}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{request.destination}</span><span className="block text-xs text-slate">{request.id} · {request.owner} · {request.days} days / {request.nights} nights</span><span className="mt-2 block"><Badge tone={request.status.includes('Pending') ? 'amber' : request.status.includes('Retirement') ? 'blue' : 'green'}>{request.status}</Badge></span></span></button>)}</div>
          </Panel>
          <Panel title={`${current.id} · ${current.destination}`} action={<Badge tone="teal">{current.mode}</Badge>}>
            <Flow steps={['Request', 'Approval', 'Travel preparation', 'Disbursement', 'Travel', 'Retirement'].map((step, index) => {
              const done = [true, current.status !== 'Pending approval', current.preparation === 'Ready', current.disbursement === 'Paid', current.status === 'Retirement submitted', !!current.retirement][index]
              return `${done ? '✓ ' : ''}${step}`
            })} />
            <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-slate">Responsible staff</span><div className="font-semibold">{current.owner}</div></div><div><span className="text-xs text-slate">Origin branch</span><div className="font-semibold">{current.branch}</div></div><div><span className="text-xs text-slate">Duration</span><div className="font-semibold">{current.days} days · {current.nights} nights</div></div><div><span className="text-xs text-slate">Travelers</span><div className="font-semibold">{current.travelers.length}</div></div></div>
            <div className="mt-4 rounded-lg bg-cloud p-4 text-sm"><b>Purpose</b><p className="mt-1 text-slate">{current.purpose}</p></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><div className="text-xs font-semibold uppercase tracking-wider text-slate">Travelers</div><div className="mt-2 space-y-2">{current.travelers.map((traveler) => <div key={traveler.id} className="flex items-center gap-3 rounded-md border border-line p-2.5"><Avatar name={traveler.name} size={28} /><span className="min-w-0 flex-1"><b className="block truncate text-sm">{traveler.name}</b><span className="text-xs text-slate">{traveler.level}</span></span>{(canFinance || traveler.name === r.user) && <span className="num text-xs font-semibold">{ngn(allowanceFor(traveler, current.days, current.nights, policy))}</span>}</div>)}</div></div>
              <div><div className="text-xs font-semibold uppercase tracking-wider text-slate">Status notifications</div><div className="mt-2 space-y-2">{[['Approval', current.status], ['Travel preparation', current.preparation], ['Finance disbursement', current.disbursement]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm"><span>{label}</span><Badge tone={value === 'Ready' || value === 'Paid' || value === 'Approved' ? 'green' : 'amber'}>{value}</Badge></div>)}</div></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">{current.status === 'Pending approval' && (role === 'md' ? <Btn onClick={() => patch({ status: 'Approved', preparation: 'Pending', disbursement: 'Pending' })}>Give final approval</Btn> : <Badge tone="amber">Awaiting MD final approval</Badge>)}{current.status !== 'Pending approval' && !current.retirement && (current.owner === r.user || current.travelers.some((traveler) => traveler.name === r.user)) && <Btn v="secondary" onClick={() => setRetireOpen(true)}><Receipt size={15} />Retire expenses</Btn>}</div>
          </Panel>
        </div>)}

        {tab === 'Travel preparation' && <div className="space-y-5">
          <div className="rounded-lg border border-info/30 bg-blue-50 p-4 text-sm text-blue-800"><b>Privacy applied:</b> branch administrators see destinations, travelers and transport requirements. Individual staff allowances and bank details are hidden.</div>
          <div className="grid gap-4 md:grid-cols-2">{requests.filter((request) => request.status !== 'Pending approval').map((request) => <Panel key={request.id} title={`${request.id} · ${request.destination}`} action={<Badge tone={request.preparation === 'Ready' ? 'green' : 'amber'}>{request.preparation}</Badge>}><div className="grid grid-cols-2 gap-4 text-sm"><div><span className="text-xs text-slate">Mode</span><div className="font-semibold">{request.mode}</div></div><div><span className="text-xs text-slate">Travelers</span><div className="font-semibold">{request.travelers.length} staff</div></div><div><span className="text-xs text-slate">Branch</span><div className="font-semibold">{request.branch}</div></div><div><span className="text-xs text-slate">Duration</span><div className="font-semibold">{request.days}d / {request.nights}n</div></div></div><div className="mt-4 flex flex-wrap gap-2">{request.travelers.map((traveler) => <Badge key={traveler.id} tone="gray">{traveler.name}</Badge>)}</div>{request.preparationEvidence ? <div className="mt-4 rounded-md bg-softmint p-3 text-xs"><b>Preparation evidence:</b> {request.preparationEvidence}</div> : <label className="mt-4 inline-flex h-9 cursor-pointer items-center rounded-md bg-teal px-3 text-sm font-semibold text-white">Confirm ready + evidence<input type="file" className="sr-only" onChange={(event) => { setSelected(request.id); const file = event.target.files?.[0]; setRequests(requests.map((item) => item.id === request.id && file ? { ...item, preparation: 'Ready', preparationEvidence: file.name } : item)); if (file) toast('Travel preparation confirmed and staff notified.') }} /></label>}</Panel>)}</div>
        </div>}

        {tab === 'Finance & disbursement' && <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3"><Panel><Stat label="Pending disbursement" value={ngn(requests.filter((request) => request.disbursement !== 'Paid').reduce((sum, request) => sum + request.travelers.reduce((total, traveler) => total + allowanceFor(traveler, request.days, request.nights, policy), 0) + request.extras.reduce((total, extra) => total + extra.amount, 0), 0))} /></Panel><Panel><Stat label="Travelers awaiting payment" value={String(requests.filter((request) => request.disbursement !== 'Paid').reduce((sum, request) => sum + request.travelers.length, 0))} /></Panel><Panel><Stat label="Retirements received" value={String(requests.filter((request) => request.retirement).length)} /></Panel></div>
          {requests.map((request) => {
            const allowance = request.travelers.reduce((sum, traveler) => sum + allowanceFor(traveler, request.days, request.nights, policy), 0)
            const extras = request.extras.reduce((sum, extra) => sum + extra.amount, 0)
            return <Panel key={request.id} title={`${request.id} · ${request.destination}`} action={<Badge tone={request.disbursement === 'Paid' ? 'green' : 'amber'}>{request.disbursement}</Badge>}><div className="overflow-x-auto"><table className="w-full min-w-max text-left text-sm"><thead><tr className="border-b border-line text-xs text-slate"><th className="pb-2 font-semibold">Traveler</th><th className="pb-2 font-semibold">Level</th><th className="pb-2 font-semibold">Bank account</th><th className="pb-2 text-right font-semibold">Allowance</th></tr></thead><tbody>{request.travelers.map((traveler) => <tr key={traveler.id} className="border-b border-line/60"><td className="py-2 font-semibold">{traveler.name}</td><td className="py-2">{traveler.level}</td><td className="py-2">{traveler.bank} · {traveler.account}</td><td className="num py-2 text-right font-semibold">{ngn(allowanceFor(traveler, request.days, request.nights, policy))}</td></tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-lg bg-cloud p-4 text-sm"><div><div>Staff allowances <b className="num">{ngn(allowance)}</b></div><div>Approved additional expenses <b className="num">{ngn(extras)}</b></div><div className="mt-1 text-lg font-semibold">Total <span className="num">{ngn(allowance + extras)}</span></div></div>{request.paymentEvidence ? <div className="text-xs text-ok"><b>Payment evidence</b><br />{request.paymentEvidence}</div> : <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-teal px-3 text-sm font-semibold text-white">Confirm payment + evidence<input type="file" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; setRequests(requests.map((item) => item.id === request.id && file ? { ...item, disbursement: 'Paid', paymentEvidence: file.name } : item)); if (file) toast('Disbursement confirmed and travelers notified.') }} /></label>}</div>{request.retirement && <div className="mt-3 rounded-md border border-info/30 bg-blue-50 p-3 text-sm"><b>Retirement submitted:</b> {ngn(request.retirement.amount)} · {request.retirement.note} · {request.retirement.receipts.length} receipt(s)</div>}</Panel>
          })}
        </div>}

        {tab === 'Allowance policy' && <div className="space-y-5"><Panel title="Company travel allowance policy" action={<Btn s="sm" onClick={() => setPolicyOpen(true)}>Edit rates</Btn>}><p className="mb-4 text-sm text-slate">Rates are automatically applied per traveler based on staff level. Finance sees calculated allowances; travel-preparation admins do not.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{LEVELS.map((level) => <div key={level} className="rounded-lg border border-line p-4"><div className="font-semibold">{level}</div><div className="mt-3 text-xs text-slate">Per travel day</div><div className="num text-lg font-semibold">{ngn(policy[level].day)}</div><div className="mt-2 text-xs text-slate">Per night</div><div className="num text-lg font-semibold">{ngn(policy[level].night)}</div></div>)}</div></Panel></div>}
      </div>

      <Overlay open={createOpen} onClose={() => setCreateOpen(false)} title="New travel request" wide>
        <form onSubmit={createRequest} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Traveling from"><input disabled value={employeeForUser.branch} className={inputCls} /></Field><Field label="Destination"><input required name="destination" placeholder="City or location" className={inputCls} /></Field><Field label="Mode of travel"><div className="grid grid-cols-3 gap-2">{(['Flight', 'Road', 'Water'] as const).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`cursor-pointer rounded-md border px-2 py-2 text-sm font-semibold ${mode === item ? 'border-teal bg-softmint text-teal' : 'border-line'}`}>{item}</button>)}</div></Field><Field label="Duration"><div className="grid grid-cols-2 gap-2"><input aria-label="Number of days" min="1" type="number" value={days} onChange={(event) => setDays(Number(event.target.value))} className={inputCls} /><input aria-label="Number of nights" min="0" type="number" value={nights} onChange={(event) => setNights(Number(event.target.value))} className={inputCls} /></div><span className="mt-1 block text-xs text-slate">{days} days · {nights} nights</span></Field><div className="sm:col-span-2"><Field label="Purpose of travel"><textarea required name="purpose" rows={3} className={`${inputCls} h-auto py-2`} /></Field></div></div>
          <div><div className="text-sm font-semibold">Add other staff</div><p className="mt-1 text-xs text-slate">Each traveler’s allowance is calculated from their own staff level.</p><div className="mt-2 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">{employees.filter((employee) => employee.id !== employeeForUser.id).map((employee) => {
            const added = travelerIds.includes(employee.id)
            return <button key={employee.id} type="button" aria-pressed={added} onClick={() => setTravelerIds(added ? travelerIds.filter((id) => id !== employee.id) : [...travelerIds, employee.id])} className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 text-left ${added ? 'border-teal bg-softmint' : 'border-line'}`}><Avatar name={employee.name} size={28} /><span className="min-w-0 flex-1"><b className="block truncate text-sm">{employee.name}</b><span className="text-xs text-slate">{levelFor(employee.salary)} · {employee.dept}</span></span><span className="text-xs font-semibold text-teal">{added ? 'Added' : 'Add'}</span></button>
          })}</div></div>
          <div><div className="text-sm font-semibold">Additional travel expenses</div><div className="mt-2 grid gap-3 sm:grid-cols-3"><Field label="Gifts (₦)"><input name="gifts" min="0" type="number" className={inputCls} /></Field><Field label="Entertainment (₦)"><input name="entertainment" min="0" type="number" className={inputCls} /></Field><Field label="Local transport / other (₦)"><input name="other" min="0" type="number" className={inputCls} /></Field></div></div>
          <div className="rounded-lg bg-midnight p-4 text-white"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs text-white/60">Calculated staff allowance</div><div className="num mt-1 text-2xl font-semibold">{ngn(draftAllowance)}</div></div><div className="text-right text-xs text-white/60">{draftTravelers.length} traveler{draftTravelers.length === 1 ? '' : 's'}<br />{days} days · {nights} nights</div></div></div>
          <div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setCreateOpen(false)}>Cancel</Btn><Btn type="submit">Submit travel request</Btn></div>
        </form>
      </Overlay>

      <Overlay open={policyOpen} onClose={() => setPolicyOpen(false)} title="Edit travel allowance rates">
        <div className="space-y-4">{LEVELS.map((level) => <div key={level} className="rounded-lg border border-line p-3"><div className="mb-2 font-semibold">{level}</div><div className="grid grid-cols-2 gap-3"><Field label="Per day"><input type="number" value={policy[level].day} onChange={(event) => setPolicy({ ...policy, [level]: { ...policy[level], day: Number(event.target.value) } })} className={inputCls} /></Field><Field label="Per night"><input type="number" value={policy[level].night} onChange={(event) => setPolicy({ ...policy, [level]: { ...policy[level], night: Number(event.target.value) } })} className={inputCls} /></Field></div></div>)}</div><div className="flex justify-end"><Btn onClick={() => { setPolicyOpen(false); toast('Travel allowance policy updated.') }}>Save policy</Btn></div>
      </Overlay>

      <Overlay open={retireOpen} onClose={() => setRetireOpen(false)} title={`Retire expenses · ${current?.id ?? ''}`}>
        <form onSubmit={retire} className="space-y-4"><p className="text-sm text-slate">Submit receipts after travel, including personal funds used because of extra costs or a delayed company disbursement.</p><Field label="Total amount spent (₦)"><input required name="amount" type="number" className={inputCls} /></Field><Field label="Retirement note"><textarea required name="note" rows={3} placeholder="Explain extra expenses or any personal funds used." className={`${inputCls} h-auto py-2`} /></Field><Field label="Receipts and evidence"><input required multiple name="receipts" type="file" accept="image/*,.pdf" className={`${inputCls} h-auto py-2`} /></Field><div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setRetireOpen(false)}>Cancel</Btn><Btn type="submit">Submit retirement</Btn></div></form>
      </Overlay>
    </div>
  )
}
