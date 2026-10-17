import { useState } from 'react'
import { BriefcaseBusiness, Building2, Car, MapPin, Package, Sparkles, UsersRound } from 'lucide-react'
import { Avatar, Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Tabs, useToast } from '../../components/ui'
import { employeesForTenant, isOwnDataset } from '../../data/demo'
import { useRole } from '../../components/app/AppLayout'
import OrgExplorer from './org/OrgExplorer'
import { auditFor, useTenant } from '../../tenant/store'

type Department = { name: string; head: string; teams: string[] }
type Branch = { name: string; address: string; lead: string; type: string }
type OperationsRecord = { id: string; name: string; category: 'Driver' | 'Cleaner' | 'Equipment'; branch: string; detail: string; status: string }

const DEPARTMENTS: Department[] = [
  { name: 'Operations', head: 'Emmanuel Ojo', teams: ['Field Operations', 'Fleet & Dispatch', 'Procurement'] },
  { name: 'Finance', head: 'Chinedu Eze', teams: ['Accounting', 'Payroll & Treasury'] },
  { name: 'People', head: 'Kemi Balogun', teams: ['People Operations', 'Talent & Culture'] },
  { name: 'Technology', head: 'Kunle Ogunleye', teams: ['Platform', 'IT Support'] },
  { name: 'Business Development', head: 'Chisom Okeke', teams: ['Partnerships', 'Growth & New Markets'] },
  { name: 'Sales', head: 'Fatima Sule', teams: ['Enterprise Sales', 'Account Management'] },
]

const BRANCH_SEED: Branch[] = [
  { name: 'Lagos HQ', address: 'Fortune Towers, 27/29 Adeyemo Alakija Street, Victoria Island, Lagos', lead: 'Oladapo Adebayo', type: 'Head office' },
  { name: 'Abuja Branch', address: '22 Ahmadu Bello Way, Wuse 2, Abuja', lead: 'Kunle Ogunleye', type: 'Branch' },
  { name: 'Port Harcourt', address: '8 Trans Amadi Road, Port Harcourt', lead: 'Emmanuel Ojo', type: 'Operations hub' },
  { name: 'Ibadan', address: '17 Ring Road, Ibadan', lead: 'Ibrahim Danjuma', type: 'Fleet depot' },
]

const OPERATIONS_SEED: OperationsRecord[] = [
  { id: 'DRV-018', name: 'Ibrahim Danjuma', category: 'Driver', branch: 'Ibadan', detail: 'Toyota Hilux · ABJ-482-KMC', status: 'Active' },
  { id: 'DRV-024', name: 'Sule Garba', category: 'Driver', branch: 'Lagos HQ', detail: 'Isuzu NPR · LSR-217-XA', status: 'On route' },
  { id: 'DRV-031', name: 'Ibrahim Danjuma', category: 'Driver', branch: 'Abuja Branch', detail: 'Toyota Hiace · ABJ-904-GW', status: 'Active' },
  { id: 'CLN-006', name: 'Bisi Ojo', category: 'Cleaner', branch: 'Lagos HQ', detail: 'Head office · Morning shift', status: 'Active' },
  { id: 'CLN-011', name: 'Grace Nwankwo', category: 'Cleaner', branch: 'Abuja Branch', detail: 'Branch office · Day shift', status: 'Active' },
  { id: 'EQP-104', name: 'Perkins 60kVA Generator', category: 'Equipment', branch: 'Lagos HQ', detail: 'PK60-2216 · Facilities', status: 'Maintenance' },
  { id: 'EQP-122', name: 'Zebra handheld scanners', category: 'Equipment', branch: 'Port Harcourt', detail: '12 units · Warehouse', status: 'Active' },
]

export default function Organization() {
  const tenant = useTenant()
  const { can } = useRole()
  const toast = useToast()
  const employees = employeesForTenant(tenant?.slug)
  const own = isOwnDataset(tenant?.slug)
  const departmentSeed = [...new Set(employees.map((employee) => employee.dept))].map((name) => {
    const members = employees.filter((employee) => employee.dept === name)
    const lead = members.find((employee) => /head|manager|director|lead/i.test(employee.role)) ?? members[0]
    return { name, head: lead?.name ?? 'To be assigned', teams: name === 'Business Development' ? ['Partnerships', 'Growth & New Markets'] : [`${name} Operations`] }
  })
  const branchSeed = [...new Set(employees.map((employee) => employee.branch))].map((name, index) => {
    const members = employees.filter((employee) => employee.branch === name)
    return { name, address: index === 0 ? tenant?.profile.address || `${name}, Nigeria` : `${name}, Nigeria`, lead: members.find((employee) => /head|manager|lead|director/i.test(employee.role))?.name ?? members[0]?.name ?? 'To be assigned', type: index === 0 ? 'Head office' : name.toLowerCase().includes('hub') ? 'Operations hub' : 'Branch' }
  })
  const canManage = can('organization.manage')
  const [tab, setTab] = useState('Organogram')
  const [departments, setDepartments] = useState(departmentSeed.length || own ? departmentSeed : DEPARTMENTS)
  const [branches, setBranches] = useState(branchSeed.length || own ? branchSeed : BRANCH_SEED)
  const [operations, setOperations] = useState(() => (own ? [] : OPERATIONS_SEED).map((record, index) => ({ ...record, branch: (branchSeed[index % Math.max(1, branchSeed.length)]?.name ?? record.branch) })))
  const [create, setCreate] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState('All departments')
  if (!tenant) return null

  const addRecord = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (tab === 'Departments & teams') {
      const name = String(data.get('name'))
      setDepartments([...departments, { name, head: String(data.get('lead')), teams: String(data.get('detail')).split(',').map((team) => team.trim()).filter(Boolean) }])
    } else if (tab === 'Branch locations') {
      setBranches([...branches, { name: String(data.get('name')), address: String(data.get('detail')), lead: String(data.get('lead')), type: String(data.get('type')) }])
    } else {
      setOperations([...operations, { id: `OPS-${Date.now().toString(36).slice(-4).toUpperCase()}`, name: String(data.get('name')), category: String(data.get('type')) as OperationsRecord['category'], branch: String(data.get('branch')), detail: String(data.get('detail')), status: 'Active' }])
    }
    setCreate(false)
    auditFor(`${tab === 'Departments & teams' ? 'Department' : tab === 'Branch locations' ? 'Branch' : 'Operations record'} created`, { category: 'People', ref: String(data.get('name')) })
    toast(`${tab === 'Departments & teams' ? 'Department' : tab === 'Branch locations' ? 'Branch' : 'Operations record'} created.`)
  }
  const createLabel = tab === 'Departments & teams' ? 'Create department' : tab === 'Branch locations' ? 'Add branch location' : 'Add staff or equipment'
  const visibleEmployees = selectedDepartment === 'All departments' ? employees : employees.filter((employee) => employee.dept === selectedDepartment)

  return (
    <div>
      <PageHeader eyebrow="People · Company structure" title="Organisation" desc="A living view of branches, departments, teams, staff and the operational resources that support them." actions={canManage && tab !== 'Organogram' ? <Btn onClick={() => setCreate(true)}>{createLabel}</Btn> : undefined} />
      <Tabs tabs={['Organogram', 'Departments & teams', 'Branch locations', 'Operations & equipment']} value={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'Organogram' && <div className="space-y-6">
          <OrgExplorer employees={employees} departments={departments} branches={branches} company={tenant.profile.name} canPay={can('payroll.approve') || can('people.manage')} />
          <Panel title="Staff directory by structure" action={<select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)} className={`${inputCls} w-auto min-w-48`}>{['All departments', ...departments.map((department) => department.name)].map((department) => <option key={department}>{department}</option>)}</select>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleEmployees.map((employee) => <div key={employee.id} className="flex items-center gap-3 rounded-lg border border-line p-3"><Avatar name={employee.name} size={34} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{employee.name}</div><div className="truncate text-xs text-slate">{employee.role}</div><div className="truncate text-xs text-slate">{employee.dept} · {employee.branch}</div></div><Badge tone={employee.status === 'Onboarding' ? 'blue' : 'green'}>{employee.status}</Badge></div>)}</div>
          </Panel>
        </div>}

        {tab === 'Departments & teams' && (departments.length === 0 ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No departments yet" body="Create departments and teams to structure your organisation." action={canManage ? <Btn onClick={() => setCreate(true)}>Create your first department</Btn> : undefined} /></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{departments.map((department) => <Panel key={department.name}><div className="flex items-start justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-softmint text-teal"><BriefcaseBusiness size={19} /></span><Badge tone="gray">{employees.filter((employee) => employee.dept === department.name).length} staff</Badge></div><div className="mt-4 font-display text-lg font-semibold">{department.name}</div><div className="mt-1 text-sm text-slate">Led by {department.head}</div><div className="mt-4 space-y-2">{department.teams.map((team) => <div key={team} className="flex items-center justify-between rounded-md bg-cloud px-3 py-2 text-sm"><span>{team}</span><span className="text-xs text-slate">Team</span></div>)}</div></Panel>)}</div>)}

        {tab === 'Branch locations' && (branches.length === 0 ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No branch locations yet" body="Add your head office and branches." action={canManage ? <Btn onClick={() => setCreate(true)}>Add your first branch</Btn> : undefined} /></div> : <div className="grid gap-4 md:grid-cols-2">{branches.map((branch) => <Panel key={branch.name}><div className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-softmint text-teal"><MapPin size={20} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="font-display text-lg font-semibold">{branch.name}</div><Badge tone="teal">{branch.type}</Badge></div><p className="mt-1 text-sm text-slate">{branch.address}</p><div className="mt-3 text-xs text-slate">Branch lead <b className="text-ink">{branch.lead}</b> · {employees.filter((employee) => employee.branch === branch.name).length} staff</div></div></div></Panel>)}</div>)}

        {tab === 'Operations & equipment' && <div className="space-y-5">
          {!canManage && <div className="rounded-lg border border-line bg-white p-4 text-sm text-slate">All staff can view company operations resources. Only company administrators can add or update drivers, cleaners and equipment.</div>}
          <div className="grid gap-4 sm:grid-cols-3">{(['Driver', 'Cleaner', 'Equipment'] as const).map((category) => <Panel key={category}><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-softmint text-teal">{category === 'Driver' ? <Car size={19} /> : category === 'Cleaner' ? <Sparkles size={19} /> : <Package size={19} />}</span><div><div className="num text-2xl font-semibold">{operations.filter((record) => record.category === category).length}</div><div className="text-xs text-slate">{category}{category === 'Equipment' ? '' : 's'}</div></div></div></Panel>)}</div>
          <Panel pad={false}>{operations.length === 0 ? <EmptyState title="No operations resources yet" body="Add drivers, cleaners and equipment so they can be assigned to branches." action={canManage ? <Btn onClick={() => setCreate(true)}>Add your first record</Btn> : undefined} /> : <div className="divide-y divide-line">{operations.map((record) => <div key={record.id} className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-center"><div className="flex items-center gap-3"><Avatar name={record.name} size={30} /><span><b className="block">{record.name}</b><span className="font-mono text-xs text-slate">{record.id}</span></span></div><div><span className="text-xs text-slate">Branch</span><div>{record.branch}</div></div><div><span className="text-xs text-slate">Assignment / details</span><div>{record.detail}</div></div><Badge tone={record.status === 'Maintenance' ? 'amber' : record.status === 'On route' ? 'blue' : 'green'}>{record.status}</Badge></div>)}</div>}</Panel>
        </div>}
      </div>

      <Overlay open={create} onClose={() => setCreate(false)} title={createLabel}>
        <form onSubmit={addRecord} className="space-y-4">
          <Field label={tab === 'Departments & teams' ? 'Department name' : tab === 'Branch locations' ? 'Location name' : 'Name / equipment'}><input required name="name" className={inputCls} /></Field>
          {tab === 'Operations & equipment' ? <><Field label="Category"><select name="type" className={inputCls}>{['Driver', 'Cleaner', 'Equipment'].map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Branch"><select name="branch" className={inputCls}>{branches.map((branch) => <option key={branch.name}>{branch.name}</option>)}</select></Field></> : <Field label={tab === 'Branch locations' ? 'Branch type' : 'Department lead'}>{tab === 'Branch locations' ? <select name="type" className={inputCls}>{['Branch', 'Head office', 'Operations hub', 'Depot'].map((type) => <option key={type}>{type}</option>)}</select> : <select name="lead" className={inputCls}>{employees.map((employee) => <option key={employee.id}>{employee.name}</option>)}</select>}</Field>}
          {tab === 'Branch locations' && <Field label="Branch lead"><select name="lead" className={inputCls}>{employees.map((employee) => <option key={employee.id}>{employee.name}</option>)}</select></Field>}
          <Field label={tab === 'Departments & teams' ? 'Teams' : tab === 'Branch locations' ? 'Address' : 'Assignment or equipment details'} hint={tab === 'Departments & teams' ? 'Separate team names with commas.' : undefined}><textarea required name="detail" rows={3} className={`${inputCls} h-auto py-2`} /></Field>
          <div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setCreate(false)}>Cancel</Btn><Btn type="submit">Save</Btn></div>
        </form>
      </Overlay>
    </div>
  )
}
