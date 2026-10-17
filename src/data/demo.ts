export const COMPANY = {
  name: 'eTranzact International Plc',
  short: 'eTranzact',
  plan: 'Enterprise',
}

export const BRANCHES = ['Company', 'Victoria Island HQ', 'Ikeja Technology Hub', 'Abuja Office', 'Port Harcourt Office']

export type Employee = {
  id: string
  name: string
  role: string
  dept: string
  branch: string
  cost: string
  status: 'Active' | 'On leave' | 'Onboarding' | 'Remote'
  salary: number
  mode: 'On-site' | 'Remote' | 'Hybrid' | 'Field'
  manager: string
}

export const EMPLOYEES: Employee[] = [
  { id: 'ETZ-0001', name: 'Oladapo Adebayo', role: 'Managing Director / CEO', dept: 'Executive Office', branch: 'Victoria Island HQ', cost: 'CC-001 Executive', status: 'Active', salary: 4200000, mode: 'On-site', manager: 'Board of Directors' },
  { id: 'ETZ-0002', name: 'Nneka Okafor', role: 'Company Administrator', dept: 'Corporate Services', branch: 'Victoria Island HQ', cost: 'CC-010 Corporate', status: 'Active', salary: 1650000, mode: 'Hybrid', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0007', name: 'Segun Martins', role: 'Executive Assistant', dept: 'Executive Office', branch: 'Victoria Island HQ', cost: 'CC-001 Executive', status: 'Active', salary: 820000, mode: 'On-site', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0011', name: 'Kemi Balogun', role: 'HR Department', dept: 'HR Department', branch: 'Victoria Island HQ', cost: 'CC-110 Human Capital', status: 'Active', salary: 1850000, mode: 'Hybrid', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0012', name: 'Bolanle Ajayi', role: 'Talent & Culture Officer', dept: 'HR Department', branch: 'Victoria Island HQ', cost: 'CC-110 Human Capital', status: 'Active', salary: 720000, mode: 'Hybrid', manager: 'Kemi Balogun' },
  { id: 'ETZ-0013', name: 'Daniel Ekong', role: 'Learning & Development Officer', dept: 'HR Department', branch: 'Abuja Office', cost: 'CC-110 Human Capital', status: 'Active', salary: 680000, mode: 'Hybrid', manager: 'Kemi Balogun' },
  { id: 'ETZ-0018', name: 'Chinedu Eze', role: 'Chief Finance Officer', dept: 'Finance', branch: 'Victoria Island HQ', cost: 'CC-100 Finance', status: 'Active', salary: 2800000, mode: 'On-site', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0019', name: 'Yetunde Salami', role: 'Financial Control Officer', dept: 'Finance', branch: 'Victoria Island HQ', cost: 'CC-100 Finance', status: 'Active', salary: 980000, mode: 'On-site', manager: 'Chinedu Eze' },
  { id: 'ETZ-0020', name: 'Samuel Udo', role: 'Treasury Officer', dept: 'Finance', branch: 'Victoria Island HQ', cost: 'CC-105 Treasury', status: 'Active', salary: 860000, mode: 'Hybrid', manager: 'Chinedu Eze' },
  { id: 'ETZ-0024', name: 'Ibrahim Musa', role: 'Admin Department Lead', dept: 'Admin Department', branch: 'Victoria Island HQ', cost: 'CC-310 Administration', status: 'Active', salary: 2100000, mode: 'On-site', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0025', name: 'Rita Nnamani', role: 'Settlement Officer', dept: 'Admin Department', branch: 'Victoria Island HQ', cost: 'CC-315 Settlement', status: 'Active', salary: 790000, mode: 'On-site', manager: 'Ibrahim Musa' },
  { id: 'ETZ-0026', name: 'Kabiru Abdullahi', role: 'Reconciliation Officer', dept: 'Admin Department', branch: 'Abuja Office', cost: 'CC-315 Settlement', status: 'Active', salary: 760000, mode: 'Hybrid', manager: 'Ibrahim Musa' },
  { id: 'ETZ-0031', name: 'Tobi Adeyemi', role: 'Head, Enterprise Sales', dept: 'Enterprise Sales', branch: 'Victoria Island HQ', cost: 'CC-410 Sales', status: 'Active', salary: 1950000, mode: 'Hybrid', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0032', name: 'Fatima Sule', role: 'Enterprise Account Officer', dept: 'Enterprise Sales', branch: 'Abuja Office', cost: 'CC-410 Sales', status: 'Active', salary: 840000, mode: 'Field', manager: 'Tobi Adeyemi' },
  { id: 'ETZ-0033', name: 'Emmanuel Ojo', role: 'Public Sector Sales Officer', dept: 'Enterprise Sales', branch: 'Port Harcourt Office', cost: 'CC-410 Sales', status: 'Active', salary: 810000, mode: 'Field', manager: 'Tobi Adeyemi' },
  { id: 'ETZ-0038', name: 'Femi Johnson', role: 'Customer Service Manager', dept: 'Customer Service', branch: 'Victoria Island HQ', cost: 'CC-420 Customer Service', status: 'Active', salary: 1450000, mode: 'Hybrid', manager: 'Tobi Adeyemi' },
  { id: 'ETZ-0039', name: 'Precious Ibe', role: 'Merchant Support Officer', dept: 'Customer Service', branch: 'Port Harcourt Office', cost: 'CC-420 Customer Service', status: 'Active', salary: 650000, mode: 'Hybrid', manager: 'Femi Johnson' },
  { id: 'ETZ-0040', name: 'Aisha Mohammed', role: 'Service Quality Officer', dept: 'Customer Service', branch: 'Abuja Office', cost: 'CC-420 Customer Service', status: 'On leave', salary: 700000, mode: 'Hybrid', manager: 'Femi Johnson' },
  { id: 'ETZ-0042', name: 'Adaeze Nwankwo', role: 'Risk & Compliance Auditor', dept: 'Risk & Compliance', branch: 'Victoria Island HQ', cost: 'CC-510 Risk', status: 'Active', salary: 1380000, mode: 'Hybrid', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0043', name: 'Gbenga Lawal', role: 'AML Compliance Officer', dept: 'Risk & Compliance', branch: 'Victoria Island HQ', cost: 'CC-510 Risk', status: 'Active', salary: 1020000, mode: 'On-site', manager: 'Adaeze Nwankwo' },
  { id: 'ETZ-0044', name: 'Chioma Nwosu', role: 'Information Security Officer', dept: 'Risk & Compliance', branch: 'Ikeja Technology Hub', cost: 'CC-515 Security', status: 'Active', salary: 1280000, mode: 'Hybrid', manager: 'Adaeze Nwankwo' },
  { id: 'ETZ-0050', name: 'Kunle Ogunleye', role: 'Head, Technology', dept: 'Technology', branch: 'Ikeja Technology Hub', cost: 'CC-210 Technology', status: 'Active', salary: 2600000, mode: 'Hybrid', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0061', name: 'Morenike Adebayo', role: 'Business Development Manager', dept: 'Business Development', branch: 'Victoria Island HQ', cost: 'CC-425 Business Development', status: 'Active', salary: 1780000, mode: 'Hybrid', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0062', name: 'Chisom Okeke', role: 'Business Development Officer', dept: 'Business Development', branch: 'Victoria Island HQ', cost: 'CC-425 Business Development', status: 'Onboarding', salary: 920000, mode: 'Hybrid', manager: 'Morenike Adebayo' },
  { id: 'ETZ-0142', name: 'Amaka Obi', role: 'Software Engineer', dept: 'Technology', branch: 'Ikeja Technology Hub', cost: 'CC-210 Technology', status: 'Active', salary: 1150000, mode: 'Hybrid', manager: 'Kunle Ogunleye' },
  { id: 'ETZ-0143', name: 'Abiola Thomas', role: 'Product Manager, Payments', dept: 'Technology', branch: 'Ikeja Technology Hub', cost: 'CC-215 Product', status: 'Active', salary: 1500000, mode: 'Hybrid', manager: 'Kunle Ogunleye' },
  { id: 'ETZ-0150', name: 'Ngozi Umeh', role: 'Internal Audit Manager', dept: 'Internal Audit', branch: 'Victoria Island HQ', cost: 'CC-520 Audit', status: 'Active', salary: 1750000, mode: 'On-site', manager: 'Audit Committee' },
  { id: 'ETZ-0151', name: 'Paul Akinola', role: 'Internal Audit Officer', dept: 'Internal Audit', branch: 'Victoria Island HQ', cost: 'CC-520 Audit', status: 'Active', salary: 910000, mode: 'Hybrid', manager: 'Ngozi Umeh' },
  { id: 'ETZ-0160', name: 'Ifeanyi Okeke', role: 'Legal Counsel', dept: 'Legal & Company Secretariat', branch: 'Victoria Island HQ', cost: 'CC-530 Legal', status: 'Active', salary: 1650000, mode: 'Hybrid', manager: 'Oladapo Adebayo' },
  { id: 'ETZ-0161', name: 'Maryam Bello', role: 'Company Secretarial Officer', dept: 'Legal & Company Secretariat', branch: 'Victoria Island HQ', cost: 'CC-530 Legal', status: 'Onboarding', salary: 880000, mode: 'On-site', manager: 'Ifeanyi Okeke' },
]

const onboardingComplete = () => {
  const runtime = globalThis as typeof globalThis & { __bfOnboardingComplete?: string[] }
  return new Set(runtime.__bfOnboardingComplete ?? [])
}
/* Staff whose exit case is Completed leave the active lists. Read from the exit store's storage key so it works before that module loads. */
let exitRaw = '', exitCache: { tenant: string; name: string; status: string }[] = []
export const exitedNames = (slug?: string): Set<string> => {
  try {
    const raw = localStorage.getItem('bf-exit-v1') ?? ''
    if (raw !== exitRaw) { exitRaw = raw; exitCache = raw ? JSON.parse(raw) : [] }
  } catch { /* storage unavailable */ }
  return new Set(exitCache.filter((c) => c.tenant === (slug ?? 'etranzact') && c.status === 'Completed').map((c) => c.name))
}
/* Self-serve companies start with their own dataset (just their administrator) instead of the eTranzact sample data. */
const OWN = new Map<string, Employee[]>()
export const registerOwnDataset = (slug: string, admin?: { name: string }) => {
  OWN.set(slug, admin ? [{ id: `${slug.slice(0, 3).toUpperCase()}-0001`, name: admin.name, role: 'Company Administrator', dept: 'Administration', branch: 'Head office', cost: 'General', status: 'Active', salary: 0, mode: 'On-site', manager: '—' }] : [])
}
export const isOwnDataset = (slug?: string) => !!slug && OWN.has(slug)
export const employeesForTenant = (slug?: string): Employee[] => {
  if (slug && OWN.has(slug)) { const gone = exitedNames(slug); return OWN.get(slug)!.filter((e) => !gone.has(e.name)) }
  const complete = onboardingComplete()
  const gone = exitedNames(slug)
  return EMPLOYEES.filter((employee) => !gone.has(employee.name)).map((employee) => complete.has(employee.name) && employee.status === 'Onboarding' ? { ...employee, status: 'Active' } : employee)
}
export const branchesForTenant = (slug?: string): string[] => (isOwnDataset(slug) ? ['Company', 'Head office'] : BRANCHES)

export const ngn = (n: number) => '₦' + n.toLocaleString('en-NG')
export const ngnM = (n: number) => '₦' + (n / 1_000_000).toFixed(1) + 'M'

export const APPROVALS = [
  { id: 'ETZ-REQ-431', type: 'Settlement', who: 'Rita Nnamani', amount: 128500000, branch: 'Victoria Island HQ', dept: 'Admin Department', date: '8 Oct', pri: 'High', stage: 'Pending', done: ['Manager', 'Audit', 'Compliance'] as string[], note: 'Daily merchant settlement exception batch' },
  { id: 'ETZ-REQ-428', type: 'Purchase', who: 'Chioma Nwosu', amount: 4850000, branch: 'Ikeja Technology Hub', dept: 'Risk & Compliance', date: '7 Oct', pri: 'High', stage: 'Pending', done: ['Manager', 'Audit'] as string[], note: 'Security monitoring licence renewal' },
  { id: 'ETZ-REQ-424', type: 'Expense', who: 'Fatima Sule', amount: 340000, branch: 'Abuja Office', dept: 'Enterprise Sales', date: '7 Oct', pri: 'Normal', stage: 'Pending', done: [] as string[], note: 'Public-sector client workshop and travel' },
  { id: 'ETZ-REQ-419', type: 'Leave', who: 'Aisha Mohammed', amount: 0, branch: 'Abuja Office', dept: 'Customer Service', date: '6 Oct', pri: 'Normal', stage: 'Approved', done: ['Manager', 'Audit', 'MD'] as string[], note: 'Annual leave, 6 – 10 Oct' },
  { id: 'ETZ-REQ-415', type: 'Training', who: 'Bolanle Ajayi', amount: 720000, branch: 'Victoria Island HQ', dept: 'Human Capital', date: '5 Oct', pri: 'Low', stage: 'Pending', done: ['Manager'] as string[], note: 'People analytics certification for HR officers' },
]

export const approvalsForTenant = (slug?: string): typeof APPROVALS => (isOwnDataset(slug) ? [] : APPROVALS)

export const ASSETS = [
  { id: 'AST-00418', name: 'Dell Latitude 5440', type: 'Laptop', serial: 'DL5440-7XK29', value: 1250000, cur: 1020000, who: 'Amaka Obi', branch: 'Ikeja Technology Hub', status: 'Assigned', cond: 'Good', warranty: '14 Mar 2027' },
  { id: 'AST-00419', name: 'MacBook Air M3', type: 'Laptop', serial: 'C02ZK1LQ9', value: 1980000, cur: 1700000, who: 'Kunle Ogunleye', branch: 'Ikeja Technology Hub', status: 'Assigned', cond: 'Excellent', warranty: '02 Jun 2027' },
  { id: 'AST-00302', name: 'Perkins 60kVA Generator', type: 'Generator', serial: 'PK60-2216', value: 14800000, cur: 11200000, who: 'Victoria Island HQ', branch: 'Victoria Island HQ', status: 'Maintenance', cond: 'Fair', warranty: 'Expired' },
  { id: 'AST-00355', name: 'Toyota Hilux 2022', type: 'Vehicle', serial: 'MR0FB3CD50', value: 38500000, cur: 29900000, who: 'Kabiru Abdullahi', branch: 'Abuja Office', status: 'Assigned', cond: 'Good', warranty: '30 Jan 2027' },
  { id: 'AST-00391', name: 'HP LaserJet Pro M428', type: 'Printer', serial: 'VNB3K22914', value: 420000, cur: 280000, who: 'Unassigned', branch: 'Victoria Island HQ', status: 'In stock', cond: 'Good', warranty: '11 Nov 2026' },
  { id: 'AST-00340', name: 'Cisco Catalyst 9200', type: 'Network', serial: 'FCW2412L0AB', value: 3100000, cur: 2400000, who: 'IT', branch: 'Victoria Island HQ', status: 'Assigned', cond: 'Good', warranty: '20 Aug 2028' },
]

export const assetsForTenant = (slug?: string): typeof ASSETS => (isOwnDataset(slug) ? [] : ASSETS)
export const vehiclesForTenant = (slug?: string): typeof VEHICLES => (isOwnDataset(slug) ? [] : VEHICLES)
export const VEHICLES = [
  { reg: 'ABJ-482-KMC', model: 'Toyota Hilux 2022', driver: 'Kabiru Abdullahi', branch: 'Abuja Office', km: 48210, fuel: '11.4 km/l', ins: '12 Dec 2026', road: '30 Oct 2026', status: 'Active' },
  { reg: 'LSR-217-XA', model: 'Isuzu NPR Truck', driver: 'Sule Garba', branch: 'Victoria Island HQ', km: 92440, fuel: '6.8 km/l', ins: '04 Mar 2027', road: '15 Oct 2026', status: 'Service due' },
  { reg: 'ABJ-904-GW', model: 'Toyota Hiace Bus', driver: 'Ibrahim Danjuma', branch: 'Abuja Office', km: 63880, fuel: '9.1 km/l', ins: '19 Oct 2026', road: '22 Jan 2027', status: 'Active' },
  { reg: 'PHC-331-RV', model: 'Mitsubishi L200', driver: 'Emmanuel Ojo', branch: 'Port Harcourt Office', km: 71250, fuel: '10.2 km/l', ins: '08 Jan 2027', road: '08 Jan 2027', status: 'Active' },
]

export const LEADS = {
  Lead: [
    { n: 'Crestview Microfinance Bank', v: 4200000, o: 'Chisom Okeke' },
    { n: 'Plateau State Revenue Service', v: 2800000, o: 'Fatima Sule' },
  ],
  Qualified: [
    { n: 'Sunrise Pharmacies Group', v: 6500000, o: 'Chisom Okeke' },
    { n: 'Eko Utility Billing Co', v: 1900000, o: 'Fatima Sule' },
    { n: 'Harmattan Fresh Markets', v: 3300000, o: 'Chisom Okeke' },
  ],
  Proposal: [{ n: 'Nile Distribution Distribution', v: 9800000, o: 'Chisom Okeke' }, { n: 'Rivers Transit Authority', v: 5200000, o: 'Emmanuel Ojo' }],
  Won: [{ n: 'Island Gardens Facilities', v: 7400000, o: 'Chisom Okeke' }],
}

export const TASKS = [
  { id: 'TSK-871', t: 'Upload signed pension forms for new hires', due: 'Today', pri: 'High', st: 'In Progress', rel: 'Onboarding · Maryam Bello', by: 'Kemi Balogun' },
  { id: 'TSK-868', t: 'Review October payroll variance report', due: 'Tomorrow', pri: 'High', st: 'Pending', rel: 'Payroll · Oct 2026', by: 'Chinedu Eze' },
  { id: 'TSK-862', t: 'Confirm laptop handover with Ikeja IT', due: '10 Oct', pri: 'Normal', st: 'Pending', rel: 'Asset · AST-00418', by: 'Kunle Ogunleye' },
  { id: 'TSK-855', t: 'Renew Hiace insurance before expiry', due: '14 Oct', pri: 'High', st: 'Pending', rel: 'Fleet · ABJ-904-GW', by: 'Ibrahim Musa' },
  { id: 'TSK-840', t: 'Prepare Q3 branch cost-centre summary', due: '2 Oct', pri: 'Normal', st: 'Completed', rel: 'Reports', by: 'Chinedu Eze' },
]

export const REVENUE = [
  { m: 'May', rev: 41.2, exp: 33.1 },
  { m: 'Jun', rev: 44.8, exp: 34.6 },
  { m: 'Jul', rev: 43.1, exp: 36.2 },
  { m: 'Aug', rev: 49.6, exp: 37.4 },
  { m: 'Sep', rev: 52.3, exp: 39.8 },
  { m: 'Oct', rev: 56.9, exp: 41.2 },
]

export const AUDIT = [
  { t: '10:42', a: 'Amaka Obi', x: 'signed Employment Agreement', s: 'Signed' },
  { t: '10:16', a: 'Kunle Ogunleye', x: 'signed as Manager', s: 'Signed' },
  { t: '09:58', a: 'Ibrahim Musa', x: 'viewed the document', s: 'Viewed' },
  { t: '09:45', a: 'Kemi Balogun', x: 'sent signature request', s: 'Sent' },
  { t: '09:42', a: 'Kemi Balogun', x: 'generated document from template', s: 'Created' },
]
