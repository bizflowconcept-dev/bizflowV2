import { approvalsForTenant, assetsForTenant, employeesForTenant, isOwnDataset } from './demo'
import type { Employee } from './demo'
import { gradeOfSalary } from '../rules/store'

type Emp = Employee

type Extra = {
  email: string; phone: string; dob: string; gender: string; marital: string; state: string; address: string
  joined: string; joinedISO: string; contract: string; grade: string; probation: string; location: string
  emergency: { name: string; rel: string; phone: string }
  bank: { name: string; acct: string }; tin: string; pension: string; pfa: string; nhf: string
  skills: string[]; leave: { type: string; used: number; total: number }[]
  perf: { cycle: string; rating: string; score: number; goals: { g: string; p: number }[] }
}

const X: Record<string, Partial<Extra> & { joinedISO: string; joined: string }> = {
  'ETZ-0142': { joined: '3 Feb 2022', joinedISO: '2022-02-03', state: 'Lagos', address: '14 Admiralty Way, Ikeja GRA, Lagos', dob: '12 Jun 1992', gender: 'Female', marital: 'Married', bank: { name: 'GTBank', acct: '0123456789' }, skills: ['TypeScript', 'React', 'Node.js', 'AWS', 'System design'], emergency: { name: 'Ada Obi', rel: 'Spouse', phone: '+234 803 555 0142' } },
  'ETZ-0050': { joined: '12 Jan 2019', joinedISO: '2019-01-12', state: 'Lagos', address: '7 Ligali Ayorinde St, Victoria Island, Lagos', dob: '3 Mar 1986', gender: 'Male', marital: 'Married', bank: { name: 'Access Bank', acct: '0098123456' }, skills: ['Engineering leadership', 'Cloud architecture', 'Security', 'Hiring'], emergency: { name: 'Yemi Ogunleye', rel: 'Spouse', phone: '+234 802 555 0050' } },
  'ETZ-0018': { joined: '5 Aug 2020', joinedISO: '2020-08-05', state: 'Lagos', address: '22 Adeola Odeku St, Victoria Island, Lagos', dob: '21 Sep 1988', gender: 'Male', marital: 'Married', bank: { name: 'Wema Bank', acct: '2034567812' }, skills: ['IFRS', 'Tax planning', 'Treasury', 'Audit'], emergency: { name: 'Chidinma Eze', rel: 'Spouse', phone: '+234 805 555 0018' } },
  'ETZ-0033': { joined: '17 Mar 2021', joinedISO: '2021-03-17', state: 'Rivers', address: '5 Aba Road, Port Harcourt', dob: '9 Nov 1990', gender: 'Male', marital: 'Married', bank: { name: 'First Bank', acct: '3098765432' }, skills: ['Public sector sales', 'Stakeholder management', 'Negotiation', 'Pipeline forecasting'], emergency: { name: 'Grace Ojo', rel: 'Spouse', phone: '+234 807 555 0033' } },
  'ETZ-0011': { joined: '2 Nov 2020', joinedISO: '2020-11-02', state: 'Lagos', address: '31 Opebi Road, Ikeja, Lagos', dob: '27 Apr 1991', gender: 'Female', marital: 'Single', bank: { name: 'UBA', acct: '2110987654' }, skills: ['Talent acquisition', 'Employee relations', 'Labour law', 'Payroll'], emergency: { name: 'Halima Balogun', rel: 'Mother', phone: '+234 806 555 0011' } },
  'ETZ-0032': { joined: '14 Jun 2023', joinedISO: '2023-06-14', state: 'FCT', address: '9 Gwarinpa Estate, Abuja', dob: '30 Jan 1994', gender: 'Female', marital: 'Single', bank: { name: 'Kuda MFB', acct: '2045671290' }, skills: ['B2B sales', 'Negotiation', 'CRM', 'Pipeline forecasting'], emergency: { name: 'Zainab Sule', rel: 'Sister', phone: '+234 809 555 0032' } },
  'ETZ-0026': { joined: '20 Sep 2023', joinedISO: '2023-09-20', state: 'FCT', address: '18 Wuse II, Abuja', dob: '15 Aug 1993', gender: 'Male', marital: 'Single', bank: { name: 'Stanbic IBTC', acct: '0034561287' }, skills: ['Reconciliation', 'Contract negotiation', 'Settlement operations', 'Excel'], emergency: { name: 'Femi Abdullahi', rel: 'Brother', phone: '+234 810 555 0026' } },
  'ETZ-0025': { joined: '1 Apr 2022', joinedISO: '2022-04-01', state: 'Lagos', address: '12 Allen Avenue, Ikeja, Lagos', dob: '2 Dec 1989', gender: 'Female', marital: 'Married', bank: { name: 'Wema Bank', acct: '0245678123' }, skills: ['Settlement operations', 'Chargebacks', 'Reconciliation'], emergency: { name: 'Aisha Nnamani', rel: 'Spouse', phone: '+234 811 555 0025' } },
  'ETZ-0161': { joined: '1 Nov 2026', joinedISO: '2026-11-01', state: 'Lagos', address: '3 Bode Thomas St, Surulere, Lagos', dob: '8 May 1996', gender: 'Female', marital: 'Single', bank: { name: 'Access Bank', acct: '1123456780' }, skills: ['Company secretarial practice', 'Records management', 'ICSAN (part-qualified)'], emergency: { name: 'Bala Bello', rel: 'Father', phone: '+234 812 555 0161' } },
}

const DEPT_GOALS: Record<string, string[]> = {
  Technology: ['Ship payments API v2', 'Cut p95 latency below 300ms', 'Mentor two junior engineers'],
  Finance: ['Close month-end in 5 working days', 'Reduce unreconciled items by 40%', 'Automate VAT returns'],
  'Admin Department': ['Cut settlement exceptions by 15%', 'Complete the reconciliation audit', 'Renegotiate three vendor contracts'],
  'HR Department': ['Fill 9 open roles by Q4', 'Roll out performance cycle', 'Cut onboarding time to 5 days'],
  'Enterprise Sales': ['Close ₦48M new ARR', 'Grow pipeline coverage to 3x', 'Run five client workshops'],
}

export function paye(grossMonthly: number) {
  const basic = grossMonthly * 0.5
  const pension = grossMonthly * 0.08
  const nhf = basic * 0.025
  const annual = grossMonthly * 12
  const cra = Math.max(200000, annual * 0.01) + annual * 0.2
  let t = Math.max(0, annual - pension * 12 - nhf * 12 - cra)
  let tax = 0
  for (const [band, rate] of [[300000, 0.07], [300000, 0.11], [500000, 0.15], [500000, 0.19], [1600000, 0.21], [Infinity, 0.24]] as [number, number][]) {
    const c = Math.min(t, band); tax += c * rate; t -= c; if (t <= 0) break
  }
  return { paye: Math.round(tax / 12), pension: Math.round(pension), nhf: Math.round(nhf) }
}

export function payslip(e: Emp) {
  const g = e.salary
  const { paye: p, pension, nhf } = paye(g)
  const earnings = [['Basic salary', Math.round(g * 0.5)], ['Housing allowance', Math.round(g * 0.25)], ['Transport allowance', Math.round(g * 0.25)]] as [string, number][]
  const deductions = [['PAYE tax', p], ['Pension (8%)', pension], ['NHF (2.5% of basic)', nhf]] as [string, number][]
  if (e.id === 'ETZ-0032') deductions.push(['Salary advance repayment', 50000])
  const totalD = deductions.reduce((a, d) => a + d[1], 0)
  return { earnings, deductions, gross: g, totalD, net: g - totalD, employerPension: Math.round(g * 0.1) }
}

const MONTHS = ['Oct 2026', 'Sep 2026', 'Aug 2026', 'Jul 2026', 'Jun 2026', 'May 2026']

/** Email domain for generated staff addresses: the tenant's own domain for self-serve workspaces. */
export const emailDomainFor = (tenant?: { slug: string; profile: { email: string } } | null) => {
  if (!tenant || !isOwnDataset(tenant.slug)) return 'etranzact.com'
  return tenant.profile.email.split('@')[1] || `${tenant.slug}.bizflow.com`
}

export function profileData(e: Emp, directoryIn?: Employee[], emailDomain = 'etranzact.com', approvalDirectoryIn?: ReturnType<typeof approvalsForTenant>, slug?: string) {
  const own = isOwnDataset(slug)
  const directory = directoryIn ?? employeesForTenant(slug)
  const approvalDirectory = approvalDirectoryIn ?? approvalsForTenant(slug)
  const idx = Math.max(0, directory.findIndex((x) => x.id === e.id))
  const hrName = own ? 'HR' : 'Kemi Balogun'
  const financeName = own ? 'Finance' : 'Chinedu Eze'
  const x = X[e.id] ?? (own ? { joined: '—', joinedISO: '' } : { joined: '1 Mar 2022', joinedISO: '2022-03-01' })
  const first = e.name.split(' ')[0].toLowerCase(), last = (e.name.split(' ')[1] ?? 'staff').toLowerCase()
  const years = (Date.UTC(2026, 9, 8) - new Date(x.joinedISO).getTime()) / (365.25 * 864e5)
  const tenure = own ? '—' : years < 0 ? 'Starts 1 Nov 2026' : years < 1 ? `${Math.max(1, Math.round(years * 12))} months` : `${Math.floor(years)} yr ${Math.round((years % 1) * 12)} mo`
  const onboarding = e.status === 'Onboarding'
  const manager = directory.find((m) => m.name === e.manager)
  const reports = directory.filter((m) => m.manager === e.name)
  const pay = payslip(e)
  const entitlement = e.salary > 1000000 ? 25 : 20
  const leave = [
    { type: 'Annual leave', used: own ? 0 : e.status === 'On leave' ? 10 : 4 + (idx % 5), total: entitlement },
    { type: 'Sick leave', used: own ? 0 : idx % 3, total: 12 },
    { type: 'Compassionate', used: 0, total: 5 },
    ...(x.gender === 'Female' ? [{ type: 'Maternity', used: 0, total: 84 }] : [{ type: 'Paternity', used: 0, total: 10 }]),
  ]
  const attendance = onboarding || own ? null : { present: 15 - (idx % 3), late: idx === 3 ? 3 : idx % 2, remote: e.mode === 'Remote' ? 15 : e.mode === 'Hybrid' ? 6 : 0, leave: e.status === 'On leave' ? 6 : 0, rate: 96 - (idx % 4) }
  const log = own ? [] : ['Thu 8 Oct', 'Wed 7 Oct', 'Tue 6 Oct', 'Mon 5 Oct', 'Fri 2 Oct', 'Thu 1 Oct'].map((d, i) => {
    const mode = e.status === 'On leave' ? 'Approved leave' : e.mode === 'Hybrid' ? (i % 2 ? 'Remote' : 'On-site') : e.mode === 'Field' ? 'Field' : e.mode
    const inM = 10 + ((idx * 3 + i * 7) % 45)
    return { d, mode, in: mode === 'Approved leave' ? '—' : `07:${String(inM).padStart(2, '0')}`, out: mode === 'Approved leave' || i === 0 ? '—' : `17:${String(10 + ((idx * 7 + i * 5) % 40)).padStart(2, '0')}`, hrs: mode === 'Approved leave' || i === 0 ? '—' : `${8 + ((idx + i) % 2)}h ${((idx * 7 + i * 11) % 50) + 5}m` }
  })
  const history = own ? [] : MONTHS.map((m, i) => ({ m, gross: e.salary, net: pay.net, status: i === 0 ? 'Processing' : 'Paid', ref: `PAY-${2610 - i}-${e.id.slice(3)}` }))
  const assets = assetsForTenant(slug).filter((a) => a.who === e.name)
  const requests = approvalDirectory.filter((a) => a.who === e.name)
  const goals = own ? [] : (DEPT_GOALS[e.dept] ?? DEPT_GOALS['Admin Department']).map((g, i) => ({ g, p: [78, 55, 32][i] }))
  const docs = own ? [] : [
    { n: 'Employment Agreement', s: onboarding ? 'Awaiting signature' : 'Signed', d: onboarding ? 'Sent 6 Oct' : x.joined, to: '/admin/business/sign' },
    { n: 'Offer Letter', s: 'Signed', d: onboarding ? '24 Sep 2026' : x.joined },
    { n: 'NDA', s: onboarding ? 'Awaiting signature' : 'Signed', d: onboarding ? 'Sent 6 Oct' : x.joined },
    { n: 'Policy Acknowledgement 2026', s: idx % 4 === 3 ? 'Pending' : 'Signed', d: '12 Jan 2026' },
    { n: 'National ID (NIN slip)', s: 'Verified', d: x.joined },
    { n: 'Degree certificate', s: onboarding ? 'Under review' : 'Verified', d: x.joined },
    { n: 'Guarantor form', s: onboarding ? 'Missing' : 'Verified', d: x.joined },
  ]
  const tasks = own ? [] : onboarding
    ? [{ t: 'Complete self-onboarding form', s: 'Done', due: '30 Sep' }, { t: 'Upload guarantor form', s: 'Overdue', due: '5 Oct' }, { t: 'IT: provision laptop and email', s: 'In progress', due: '28 Oct' }, { t: `Meet your manager (${e.manager})`, s: 'To do', due: '2 Nov' }]
    : [{ t: `${DEPT_GOALS[e.dept]?.[0] ?? 'Quarterly review prep'}`, s: 'In progress', due: '30 Oct' }, { t: 'Submit October timesheet', s: 'To do', due: '30 Oct' }, { t: 'Complete data-protection training', s: idx % 2 ? 'Done' : 'To do', due: '15 Oct' }, { t: '1:1 with ' + e.manager, s: 'Done', due: '2 Oct' }]
  const timeline = own ? (assets[0] ? [{ t: 'Recently', a: 'BizFlow', x: `assigned ${assets[0].name} to ${e.name}` }] : []) : onboarding
    ? [{ t: '6 Oct', a: hrName, x: `sent ${e.name}'s employment agreement for signature` }, { t: '30 Sep', a: e.name, x: 'submitted their self-onboarding form' }, { t: '24 Sep', a: hrName, x: `generated a secure onboarding link for ${e.name}` }]
    : [
      ...(assets[0] ? [{ t: '10 Oct', a: 'BizFlow', x: `assigned ${assets[0].name} to ${e.name}` }] : []),
      { t: '1 Oct', a: financeName, x: `processed ${e.name}'s September payroll` },
      { t: '18 Sep', a: e.manager, x: 'approved timesheet for ' + e.name },
      { t: '3 Aug', a: hrName, x: `updated ${e.name}'s work arrangement to ${e.mode}` },
      { t: x.joined, a: e.name, x: `joined ${e.branch}` },
    ]
  const emp = {
    email: `${first}.${last}@${emailDomain}`, phone: own ? '—' : `+234 80${(idx % 8) + 2} 555 0${e.id.slice(-4)}`, dob: '—', gender: '—', marital: '—', state: own ? '—' : 'Lagos', address: e.branch, contract: 'Permanent', grade: gradeOfSalary(e.dept, e.salary)?.label ?? 'Not graded',
    probation: own ? '—' : onboarding ? 'Starts on joining' : 'Confirmed', location: e.branch, emergency: { name: '—', rel: '—', phone: '—' }, bank: { name: '—', acct: own ? '—' : '0000000000' }, skills: [] as string[],
    tin: own ? '—' : `${2300000000 + idx * 7311}-0001`, pension: own ? '—' : `PEN${100234567890 + idx * 1317}`, pfa: own ? '—' : ['Stanbic IBTC Pension', 'ARM Pension', 'Leadway Pensure', 'Trustfund Pensions'][idx % 4], nhf: own ? '—' : `NHF-${40100 + idx * 13}`,
    ...x,
  } as Extra & typeof x
  return {
    ...emp, tenure, manager, reports, pay, leave, attendance, log, history, assets, requests, goals, docs, tasks, timeline, onboarding,
    perf: { cycle: 'H1 2026', rating: onboarding || own ? '—' : ['Exceeds', 'Meets +', 'Exceeds', 'Meets', 'Meets +', 'Meets', 'Meets +', 'Meets'][idx % 8], score: onboarding || own ? 0 : 82 + (idx % 5) * 3 },
    leaveLeft: leave[0].total - leave[0].used,
    completeness: onboarding ? 62 : 100 - (idx % 3) * 4,
  }
}
