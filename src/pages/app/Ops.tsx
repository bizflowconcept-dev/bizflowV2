import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Avatar, Badge, Btn, EmptyState, Field, Flow, inputCls, Overlay, Panel, PageHeader, Stat, Table, Tabs, Timeline, QuickAction, useToast } from '../../components/ui'
import { approvalsForTenant, assetsForTenant, employeesForTenant, isOwnDataset, ngn } from '../../data/demo'
import { useRole } from '../../components/app/AppLayout'
import { auditFor, demoAccountsFor, useTenant } from '../../tenant/store'
import { STEP_OWNER, STEP_ROLES, chainFor, useFlowPolicy } from '../../approvals/flow'
import type { Step } from '../../approvals/flow'
import { DESK_LABEL, handlerFor, useDesk, useFinancePolicy } from '../../finance/policy'
import TaskBoard from '../../tasks/TaskBoard'
import { FleetCompliance } from '../../compliance/ui'

export function Approvals() {
  const tenant = useTenant()
  const approvals = approvalsForTenant(tenant?.slug)
  const [view, setView] = useState('Pending')
  const [sel, setSel] = useState(approvals[0]?.id ?? '')
  const { role, r: me } = useRole()
  const toast = useToast()
  const policy = useFinancePolicy(tenant?.slug ?? '')
  const [desk, setDesk] = useDesk(tenant?.slug ?? '', me.title)
  const [done, setDone] = useState<Record<string, string>>({})
  const [prog, setProg] = useState<Record<string, string[]>>({})
  const flow = useFlowPolicy(tenant?.slug ?? '')
  const [paid, setPaid] = useState<Record<string, string>>({})
  const stOf = (r: (typeof approvals)[0]) => done[r.id] ?? (r.stage === 'Approved' ? 'Approved' : 'Pending')
  const list = approvals.filter((r) => view === 'All' || stOf(r) === view || (view === 'Delegated' && r.id === 'REQ-2276'))
  const r = approvals.find((x) => x.id === sel) ?? approvals[0]
  if (!r) return (
    <div>
      <PageHeader eyebrow="Operations" title="Approval Inbox" desc="Requests waiting on you, and everything you have decided." />
      <Panel><EmptyState title="No requests yet" body="Leave, expense, purchase and asset requests will appear here for approval. Set the approval flow for your company, or submit the first request." action={<><Btn to="/admin/business/settings/approvals">Set approval flow</Btn><Btn v="secondary" to="/admin/business/procurement">New purchase request</Btn></>} /></Panel>
    </div>
  )
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Approval Inbox" desc="Requests waiting on you, and everything you have decided." actions={<QuickAction label="New request" title="New request" v="primary" s="md" done="Request submitted to your manager" fields={[{label:'Type',type:'select',options:['Leave','Expense','Purchase','Asset','Travel'],required:true},{label:'Amount (₦)',type:'number'},{label:'Reason',type:'textarea',required:true}]} />} />
      <Tabs tabs={['All', 'Pending', 'Approved', 'Rejected', 'Delegated']} value={view} onChange={setView} />
      <div className="mt-5 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel pad={false}>
          {list.length === 0 ? <div className="p-12 text-center"><div className="font-display text-xl font-semibold">Nothing in {view.toLowerCase()}</div><p className="text-sm text-slate">New requests assigned to you will appear here.</p></div> : (
            <ul>
              {list.map((x) => (
                <li key={x.id}><button onClick={() => setSel(x.id)} className={`flex w-full cursor-pointer items-center gap-3 border-b border-line/60 px-5 py-3.5 text-left ${sel === x.id ? 'bg-softmint/50' : 'hover:bg-cloud'}`}>
                  <Avatar name={x.who} /><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{x.type} <span className="font-normal text-slate">· {x.who}</span></div><div className="mt-0.5 text-xs text-slate">{x.branch} · {x.dept} · {x.date}</div></div>
                  <div className="num text-right text-sm font-semibold">{x.amount ? ngn(x.amount) : '—'}<div className="mt-0.5"><Badge>{stOf(x) === 'Pending' ? x.pri : stOf(x)}</Badge></div></div>
                </button></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`${r.id} · ${r.type}`}>
          <p className="text-sm">{r.note}</p>
          <div className="num mt-3 font-display text-3xl font-semibold">{r.amount ? ngn(r.amount) : 'No amount'}</div>
          <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate">Approval flow</div>
          {(() => {
            const chain = chainFor(r, flow)
            const doneSteps = prog[r.id] ?? r.done
            const at = stOf(r) === 'Approved' ? chain.length : Math.max(0, chain.findIndex((x) => !doneSteps.includes(x)))
            const approved = stOf(r) === 'Approved'
            const money = r.amount > 0
            const handler = handlerFor(r.amount, policy)
            const stage = chain[at] as Step
            const last = at === chain.length - 1
            const canDecide = STEP_ROLES[stage]?.includes(role) ?? false
            const node = (label: string, state: 'done' | 'now' | 'next' | 'dashed') => `flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-semibold ${state === 'done' ? 'border-teal bg-softmint' : state === 'now' ? 'border-midnight bg-midnight text-white' : state === 'dashed' ? 'border-dashed border-line text-slate' : 'border-line text-slate'}`
            const approve = () => {
              if (!last) { auditFor(`Request approved at ${stage} step`, { category: 'Requests', ref: r.id, from: stage, to: STEP_OWNER[chain[at + 1]] }); setProg({ ...prog, [r.id]: [...doneSteps, stage] }); toast(`${stage} approved ${r.id}. Now with ${STEP_OWNER[chain[at + 1]]}.`); return }
              auditFor(money ? 'Request given final approval' : 'Request approved', { category: 'Requests', ref: r.id, from: 'Pending', to: 'Approved' })
              setDone({ ...done, [r.id]: 'Approved' })
              toast(money ? `${r.id} approved. Finance can now disburse.` : `${r.id} approved`)
            }
            return (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-y-2">
                  {chain.map((s, i) => (
                    <div key={s} className="flex items-center"><div className={node(s, approved || i < at ? 'done' : i === at ? 'now' : 'next')}>{(approved || i < at) && '✓'} {s === 'MD' ? 'MD · final approval' : s}</div>{(i < chain.length - 1 || money) && <span className="mx-1 h-px w-5 bg-line" />}</div>
                  ))}
                  {money && <div className={node('Finance', paid[r.id] ? 'done' : 'dashed')}>{paid[r.id] && '✓'} {DESK_LABEL[handler]} · disburses</div>}
                </div>
                <p className="mt-4 text-xs text-slate">Flow set by {tenant?.profile.name ?? 'your company'}: Audit reviews every request, the MD gives the final approval on requests involving money, and Finance disburses only after that (Finance Officer up to the tier limit, CFO above). Nobody approves after the MD. Requests without money end after Audit.</p>
                {stOf(r) === 'Pending' && (canDecide
                  ? <div className="mt-5 flex gap-2"><Btn onClick={approve}>{stage === 'MD' ? 'Give final approval' : last ? `Approve as ${stage}` : `Approve as ${stage}, pass on`}</Btn><Btn v="secondary" onClick={() => { auditFor(`Request rejected at ${stage} step`, { category: 'Requests', ref: r.id, from: 'Pending', to: 'Rejected' }); setDone({ ...done, [r.id]: 'Rejected' }) }}>Reject</Btn></div>
                  : <div className="mt-5 rounded-md bg-cloud p-3 text-sm text-slate">{role === 'finance' ? 'Finance does not approve requests. It disburses once the MD has approved.' : <>Waiting for <b className="text-ink">{STEP_OWNER[stage]}</b>. Switch to that role to decide this step.</>}</div>)}
                {approved && money && !paid[r.id] && (
                  <div className="mt-5 rounded-md border border-line p-3 text-sm">
                    <div className="font-semibold">Approved by the MD. Awaiting disbursement.</div>
                    <p className="mt-1 text-xs text-slate">No further approval is needed. This {ngn(r.amount)} payment is routed by the company's finance tiers to the <b className="text-ink">{DESK_LABEL[handler]}</b>{policy.mode === 'default' ? ' (BizFlow default)' : ' (custom range)'}.</p>
                    {role === 'finance' ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {desk === handler
                          ? <Btn s="sm" onClick={() => { auditFor('Request disbursed', { category: 'Finance', ref: r.id, from: 'Approved', to: `${ngn(r.amount)} disbursed (PAY-${r.id.slice(-4)})` }); setPaid({ ...paid, [r.id]: `PAY-${r.id.slice(-4)}` }); toast(`${ngn(r.amount)} disbursed by ${me.user} (${DESK_LABEL[desk]})`) }}>Mark as disbursed</Btn>
                          : <span className="text-xs text-slate">Only the {DESK_LABEL[handler]} can release this amount.</span>}
                        <label className="flex items-center gap-2 text-xs text-slate">Working as
                          <select value={desk} onChange={(e) => setDesk(e.target.value as 'officer' | 'cfo')} className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink"><option value="officer">Finance Officer</option><option value="cfo">CFO</option></select></label>
                      </div>
                    ) : <Badge tone="blue">Assigned to {DESK_LABEL[handler]}</Badge>}
                  </div>
                )}
                {paid[r.id] && <div role="status" className="mt-5 rounded-md bg-softmint p-3 text-sm"><b>Disbursed by {me.user}</b> · ref {paid[r.id]}. Recorded in the audit trail.</div>}
              </>
            )
          })()}
          {done[r.id] && <div role="status" className="mt-4 rounded-md bg-softmint p-3 text-sm"><b>Request {done[r.id].toLowerCase()}</b><br />The requester has been notified and the decision is in the audit trail.</div>}
        </Panel>
      </div>
    </div>
  )
}

export function Tasks() {
  const { role, r } = useRole()
  const t = useTenant()
  const slug = t?.slug ?? 'etranzact'
  const people = t ? [...new Set([r.user, ...demoAccountsFor(t).map((account) => account.name), ...employeesForTenant(slug).map((e) => e.name)])] : [r.user]
  return <TaskBoard key={slug + role} scope="Business" tenant={slug} me={r.user} people={people} canManage={role !== 'employee'} mineOnly={role === 'employee'} relatedHint="Related record (optional)" />
}

export function Procurement() {
  const toast = useToast()
  const tenant = useTenant()
  const staff = employeesForTenant(tenant?.slug)
  const demoSeed = [
    { id: 'PR-0418', item: 'Dell Latitude 5440 laptops', quantity: 6, amount: 2640000, branch: 'Abuja Branch', department: 'Operations', costCentre: 'CC-310 Procurement', requester: 'Kabiru Abdullahi', vendor: 'Computer Warehouse Ltd', needed: '18 Oct 2026', reason: 'Replace end-of-life laptops for the Abuja operations and dispatch teams.', stage: 1, status: 'Pending approval', documents: ['Vendor quotation.pdf', 'Laptop specification.pdf'], viewers: ['Chinedu Eze', 'Kunle Ogunleye'] },
    { id: 'PR-0414', item: 'Generator diesel supply', quantity: 2400, amount: 1180000, branch: 'Lagos HQ', department: 'Operations', costCentre: 'CC-410 Operations', requester: 'Emmanuel Ojo', vendor: 'Sahara Fuel Depot', needed: '12 Oct 2026', reason: 'Four-week reserve for the warehouse and dispatch yard generators.', stage: 2, status: 'Purchase order', documents: ['Fuel quotation.pdf'], viewers: ['Ibrahim Musa'] },
    { id: 'PR-0409', item: 'Toyota Hilux brake service', quantity: 1, amount: 420000, branch: 'Ibadan', department: 'Fleet', costCentre: 'CC-330 Fleet', requester: 'Ibrahim Danjuma', vendor: 'Prime Auto Care', needed: '10 Oct 2026', reason: 'Preventive brake replacement following the scheduled fleet inspection.', stage: 3, status: 'Awaiting receipt', documents: ['Inspection report.pdf', 'Workshop estimate.pdf'], viewers: ['Emmanuel Ojo', 'Chinedu Eze'] },
  ]
  const seed: typeof demoSeed = isOwnDataset(tenant?.slug) ? [] : demoSeed
  const [requests, setRequests] = useState(seed)
  const [selected, setSelected] = useState(seed[0]?.id ?? '')
  const [createOpen, setCreateOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState('')
  const [newFiles, setNewFiles] = useState<string[]>([])
  const [newViewers, setNewViewers] = useState<string[]>([])
  const current = requests.find((request) => request.id === selected) ?? requests[0]
  const advance = () => {
    const next = Math.min(5, current.stage + 1)
    const statuses = ['', 'Pending approval', 'Purchase order', 'Awaiting receipt', 'Ready for accounting', 'Posted']
    auditFor(`Purchase request: ${['', 'Approve request', 'Create purchase order', 'Record receipt', 'Post to accounting', 'Posted'][current.stage]}`, { category: 'Requests', ref: current.id, from: current.status, to: statuses[next] })
    setRequests(requests.map((request) => request.id === current.id ? { ...request, stage: next, status: statuses[next] } : request))
    toast(`${current.id} moved to ${statuses[next]}.`)
  }
  const addDocuments = (names: string[]) => {
    if (!names.length) return
    auditFor('Purchase request documents uploaded', { category: 'Requests', ref: current.id, to: names.join(', ').slice(0, 100) })
    setRequests(requests.map((request) => request.id === current.id ? { ...request, documents: [...request.documents, ...names] } : request))
    toast(`${names.length} file${names.length === 1 ? '' : 's'} uploaded to ${current.id}.`)
  }
  const createRequest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const amount = Number(data.get('amount'))
    const request = {
      id: `PR-${String(419 + requests.length).padStart(4, '0')}`,
      item: String(data.get('item')),
      quantity: Number(data.get('quantity')),
      amount,
      branch: String(data.get('branch')),
      department: String(data.get('department')),
      costCentre: String(data.get('costCentre')),
      requester: String(data.get('requester')),
      vendor: String(data.get('vendor')),
      needed: String(data.get('needed')),
      reason: String(data.get('reason')),
      stage: 1,
      status: 'Pending approval',
      documents: newFiles,
      viewers: newViewers,
    }
    auditFor('Purchase request created', { category: 'Requests', ref: request.id, to: `${request.item} (${ngn(request.amount)})` })
    setRequests([request, ...requests])
    setSelected(request.id)
    setCreateOpen(false)
    setNewFiles([])
    setNewViewers([])
    toast(`${request.id} submitted for approval.`)
  }
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Procurement" desc="Detailed requests with supporting evidence, view-only stakeholders and a complete purchase trail." actions={<Btn onClick={() => setCreateOpen(true)}>New purchase request</Btn>} />
      {!current ? <Panel><EmptyState title="No purchase requests yet" body="Raise a purchase request with a quotation and justification. It goes through your approval flow and ends in accounting." action={<Btn onClick={() => setCreateOpen(true)}>Create your first purchase request</Btn>} /></Panel> : <>
      <div className="mb-6 grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <Panel title="Purchase requests" pad={false}>
          <div className="divide-y divide-line">{requests.map((request) => <button key={request.id} onClick={() => setSelected(request.id)} className={`flex w-full cursor-pointer items-start gap-3 p-4 text-left ${selected === request.id ? 'bg-softmint/60' : 'hover:bg-cloud'}`}>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{request.item}</span><span className="mt-1 block text-xs text-slate">{request.id} · {request.branch} · {request.requester}</span><span className="mt-2 flex flex-wrap gap-1.5"><Badge tone="gray">{request.quantity} unit{request.quantity === 1 ? '' : 's'}</Badge><Badge tone="blue">{request.documents.length} document{request.documents.length === 1 ? '' : 's'}</Badge></span></span>
            <span className="text-right"><span className="num block text-sm font-semibold">{ngn(request.amount)}</span><span className="mt-1 block"><Badge tone={request.stage >= 5 ? 'green' : 'amber'}>{request.status}</Badge></span></span>
          </button>)}</div>
        </Panel>
        <Panel title={`${current.id} · ${current.quantity} × ${current.item}`} action={<Badge tone={current.stage >= 5 ? 'green' : 'amber'}>{current.status}</Badge>}>
          <Flow steps={['Request', 'Approval', 'Purchase order', 'Receipt', 'Accounting'].map((step, index) => (index < current.stage ? '✓ ' : '') + step)} />
          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Requested by', current.requester], ['Department', current.department], ['Branch', current.branch], ['Cost centre', current.costCentre], ['Preferred vendor', current.vendor], ['Required by', current.needed],
            ].map(([label, value]) => <div key={label}><div className="text-xs text-slate">{label}</div><div className="mt-0.5 font-semibold">{value}</div></div>)}
          </div>
          <div className="mt-5 rounded-lg bg-cloud p-4"><div className="text-xs font-semibold uppercase tracking-wider text-slate">Business justification</div><p className="mt-1 text-sm">{current.reason}</p><div className="num mt-3 text-2xl font-semibold">{ngn(current.amount)}</div></div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div><div className="flex items-center justify-between"><div className="text-sm font-semibold">Supporting documents</div><label className="cursor-pointer text-xs font-semibold text-teal">Upload files<input type="file" multiple className="sr-only" onChange={(event) => { addDocuments([...(event.target.files ?? [])].map((file) => file.name)); event.target.value = '' }} /></label></div>
              <div className="mt-2 space-y-2">{current.documents.length ? current.documents.map((document) => <div key={document} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm"><span className="truncate">{document}</span><Btn s="sm" v="ghost" onClick={() => setPreviewDocument(document)}>View</Btn></div>) : <p className="rounded-md bg-cloud p-3 text-xs text-slate">No documents uploaded yet.</p>}</div>
            </div>
            <div><div className="text-sm font-semibold">View-only staff</div><p className="mt-1 text-xs text-slate">These staff can monitor the request and documents, but cannot approve or edit it.</p><div className="mt-2 flex flex-wrap gap-2">{current.viewers.length ? current.viewers.map((viewer) => <Badge key={viewer} tone="gray">{viewer} · View only</Badge>) : <span className="text-xs text-slate">No view-only staff assigned.</span>}</div></div>
          </div>
          <div className="mt-6 flex justify-end"><Btn disabled={current.stage >= 5} onClick={advance}>{['', 'Approve request', 'Create purchase order', 'Record receipt', 'Post to accounting', 'Posted'][current.stage]}</Btn></div>
        </Panel>
      </div>
      <Panel title="Vendor snapshot" action={<Btn s="sm" v="secondary" to="/admin/business/vendors">Open Vendor Management</Btn>} pad={false}><Table right={[3]} head={['Vendor', 'Category', 'Open POs', 'Payables']} rows={[['Computer Warehouse Ltd', 'IT equipment', '2', ngn(2640000)], ['Sahara Fuel Depot', 'Fuel', '1', ngn(1180000)], ['Prime Auto Care', 'Vehicle service', '1', ngn(420000)]]} /></Panel>
      </>}
      <Overlay open={createOpen} onClose={() => setCreateOpen(false)} title="New purchase request" wide>
        <form onSubmit={createRequest} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Item or service"><input name="item" required placeholder="What needs to be purchased?" className={inputCls} /></Field></div>
            <Field label="Quantity"><input name="quantity" required min="1" type="number" defaultValue="1" className={inputCls} /></Field>
            <Field label="Estimated cost (₦)"><input name="amount" required min="1" type="number" className={inputCls} /></Field>
            <Field label="Requester"><select name="requester" className={inputCls}>{staff.map((person) => <option key={person.id}>{person.name}</option>)}</select></Field>
            <Field label="Department"><select name="department" className={inputCls}>{[...new Set(staff.map((person) => person.dept))].map((department) => <option key={department}>{department}</option>)}</select></Field>
            <Field label="Branch"><select name="branch" className={inputCls}>{[...new Set(staff.map((person) => person.branch))].map((branch) => <option key={branch}>{branch}</option>)}</select></Field>
            <Field label="Cost centre"><select name="costCentre" className={inputCls}>{[...new Set(staff.map((person) => person.cost))].map((cost) => <option key={cost}>{cost}</option>)}</select></Field>
            <Field label="Preferred vendor"><input name="vendor" required placeholder="Vendor name" className={inputCls} /></Field>
            <Field label="Required by"><input name="needed" required type="date" className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Business justification"><textarea name="reason" required rows={3} placeholder="Explain the need, expected outcome and any alternatives considered." className={`${inputCls} h-auto py-2`} /></Field></div>
          </div>
          <div><div className="text-sm font-semibold">Supporting documents</div><label className="mt-2 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-line bg-cloud p-4 text-sm"><span>{newFiles.length ? `${newFiles.length} files selected` : 'Upload quotations, images, specifications or supporting evidence'}</span><span className="font-semibold text-teal">Choose files</span><input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="sr-only" onChange={(event) => setNewFiles([...newFiles, ...[...(event.target.files ?? [])].map((file) => file.name)])} /></label>{newFiles.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{newFiles.map((file, index) => <span key={`${file}-${index}`} className="inline-flex items-center gap-2 rounded-md bg-cloud px-2.5 py-1.5 text-xs">{file}<button type="button" aria-label={`Remove ${file}`} onClick={() => setNewFiles(newFiles.filter((_, itemIndex) => itemIndex !== index))} className="cursor-pointer text-slate hover:text-err">×</button></span>)}</div>}</div>
          <div><div className="text-sm font-semibold">View-only staff</div><p className="mt-1 text-xs text-slate">Selected staff can view request details, attachments and progress, but cannot approve or modify the request.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{staff.slice(0, 8).map((person) => {
            const selectedViewer = newViewers.includes(person.name)
            return <button key={person.id} type="button" aria-pressed={selectedViewer} onClick={() => setNewViewers(selectedViewer ? newViewers.filter((name) => name !== person.name) : [...newViewers, person.name])} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-left text-sm ${selectedViewer ? 'border-teal bg-softmint' : 'border-line'}`}><Avatar name={person.name} size={26} /><span className="min-w-0 flex-1 truncate">{person.name}</span><span className="text-xs font-semibold text-teal">{selectedViewer ? 'View only' : 'Add'}</span></button>
          })}</div></div>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Btn type="button" v="secondary" onClick={() => setCreateOpen(false)}>Cancel</Btn><Btn type="submit">Submit request</Btn></div>
        </form>
      </Overlay>
      <Overlay open={!!previewDocument} onClose={() => setPreviewDocument('')} title={previewDocument || 'Document preview'} wide>
        <div className="rounded-lg border border-line bg-cloud p-6">
          <div className="mx-auto max-w-lg rounded-md border border-line bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-teal">Procurement supporting document</div>
            <div className="mt-2 font-display text-xl font-semibold">{previewDocument}</div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><span className="text-xs text-slate">Linked request</span><div className="font-semibold">{current.id}</div></div><div><span className="text-xs text-slate">Access</span><div className="font-semibold">Request team and view-only staff</div></div><div><span className="text-xs text-slate">Vendor</span><div className="font-semibold">{current.vendor}</div></div><div><span className="text-xs text-slate">Status</span><div className="font-semibold">Verified upload</div></div></div>
            <p className="mt-5 border-t border-line pt-4 text-sm text-slate">This secure preview represents the uploaded quotation, specification, invoice or supporting evidence. Viewing is recorded against the purchase request.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end"><Btn onClick={() => setPreviewDocument('')}>Close preview</Btn></div>
      </Overlay>
    </div>
  )
}

export function Assets() {
  const [t, setT] = useState('All')
  const tenant = useTenant()
  const own = isOwnDataset(tenant?.slug)
  const ASSETS = assetsForTenant(tenant?.slug)
  const types = ['All', ...new Set(ASSETS.map((a) => a.type))]
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Assets" desc="Request → Procurement → Registration → Assignment → Maintenance → Return → Disposal" actions={<QuickAction label="Register asset" title="Register asset" v="primary" s="md" done="Asset registered" fields={[{label:'Asset name',required:true},{label:'Type',type:'select',options:['Laptop','Phone','Furniture','Vehicle','Equipment']},{label:'Serial number',required:true},{label:'Purchase value (₦)',type:'number'}]} />} />
      <div className="mb-6 grid gap-6 border-b border-line pb-6 sm:grid-cols-4">{own ? <><Stat label="Total assets" value="0" /><Stat label="Assigned" value="0" /><Stat label="In maintenance" value="0" /><Stat label="Overdue returns" value="0" /></> : <><Stat label="Total assets" value="318" /><Stat label="Assigned" value="271" sub="85%" /><Stat label="In maintenance" value="11" /><Stat label="Overdue returns" value="2" up={false} /></>}</div>
      <div className="mb-4 flex flex-wrap gap-2">{types.map((x) => <button key={x} onClick={() => setT(x)} className={`cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-semibold ${t === x ? 'bg-midnight text-white' : 'border border-line bg-white text-slate'}`}>{x}</button>)}</div>
      {ASSETS.length === 0 ? <Panel><EmptyState title="No assets registered" body="Register laptops, phones, furniture and equipment, then assign each one to a custodian. Use Register asset at the top of this page." /></Panel> : <Panel pad={false}><Table right={[3]} head={['Asset', 'ID', 'Custodian', 'Current value', 'Branch', 'Status']} rows={ASSETS.filter((a) => t === 'All' || a.type === t).map((a) => [<Link key="n" to={`/admin/business/assets/${a.id}`} className="font-semibold hover:text-teal">{a.name}</Link>, a.id, a.who, ngn(a.cur), a.branch, <Badge key="s">{a.status}</Badge>])} /></Panel>}
    </div>
  )
}

export function AssetDetail() {
  const { id } = useParams()
  const tenant = useTenant()
  const ASSETS = assetsForTenant(tenant?.slug)
  const a = ASSETS.find((x) => x.id === id) ?? ASSETS[0]
  if (!a) return <div><div className="mb-1 text-xs text-slate"><Link to="/admin/business/assets" className="hover:text-teal">Assets</Link></div><Panel><EmptyState title="Asset not found" body="This asset does not exist in your workspace yet." action={<Btn to="/admin/business/assets">Back to assets</Btn>} /></Panel></div>
  return (
    <div>
      <div className="mb-1 text-xs text-slate"><Link to="/admin/business/assets" className="hover:text-teal">Assets</Link> / {a.id}</div>
      <div className="on-dark mb-6 flex flex-wrap items-center gap-6 rounded-lg bg-midnight p-6 text-white">
        <div className="flex size-20 items-center justify-center rounded-lg bf-flow font-display text-2xl font-bold text-midnight">{a.type.slice(0, 2)}</div>
        <div className="flex-1"><h1 className="text-3xl font-semibold">{a.name}</h1><p className="text-white/60">{a.id} · {a.serial} · {a.branch}</p></div><Badge>{a.status}</Badge>
      </div>
      <div className="mb-6"><Flow steps={['Request', 'Procurement', 'Registered', 'Assigned', 'In use']} /></div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Details"><dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Custodian', a.who], ['Purchase value', ngn(a.value)], ['Current value', ngn(a.cur)], ['Condition', a.cond], ['Warranty', a.warranty], ['Cost centre', 'CC-210 Platform']].map(([k, v]) => <div key={k}><dt className="text-xs text-slate">{k}</dt><dd className="num font-semibold">{v}</dd></div>)}</dl>
          <div className="mt-5 flex gap-2"><Btn s="sm" to="/admin/business/sign/signing">Handover document</Btn><QuickAction label="Transfer" title="Transfer asset" v="secondary" s="sm" done="Transfer request sent" fields={[{label:'New custodian',type:'select',options:['Amaka Obi','Kunle Ogunleye','Kabiru Abdullahi'],required:true},{label:'Reason',type:'textarea'}]} /></div></Panel>
        <Panel title="Asset history"><Timeline items={[{ t: '10 Oct', a: 'BizFlow', x: `assigned to ${a.who}` }, { t: '8 Oct', a: 'Kabiru Abdullahi', x: 'received from procurement' }, { t: '4 Oct', a: 'Chinedu Eze', x: 'purchased' }, { t: '1 Oct', a: 'Oladapo Adebayo', x: 'approved purchase' }]} /></Panel>
      </div>
    </div>
  )
}

export function Fleet() {
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Fleet" desc="Vehicle documents, expiry reminders and who is accountable for each renewal." actions={<QuickAction label="Add vehicle" title="Add vehicle" v="primary" s="md" done="Vehicle added to fleet" fields={[{label:'Registration',required:true},{label:'Model',required:true},{label:'Branch',type:'select',options:['Lagos HQ','Abuja','Port Harcourt']},{label:'Insurance expiry',type:'date'}]} />} />
      <FleetCompliance />
    </div>
  )
}
