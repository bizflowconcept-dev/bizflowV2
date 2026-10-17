import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import type { Tenant } from '../tenant/store'
import type { Employee } from '../data/demo'
import { gradeLabel, nearestCell, noticeText, resolve, stepLabel } from '../rules/store'
import type { RuleSet, Split } from '../rules/store'

/* ---------- Types ---------- */
export type LetterheadStyle = 'classic' | 'stripe' | 'minimal'
export const LETTERHEAD_STYLES: { v: LetterheadStyle; n: string; d: string }[] = [
  { v: 'classic', n: 'Classic top band', d: 'Brand colour band across the top, logo left, contacts right.' },
  { v: 'stripe', n: 'Side stripe', d: 'A slim brand stripe down the left edge, left-aligned header.' },
  { v: 'minimal', n: 'Minimal', d: 'Centred logo and name with a hairline rule. Quiet and formal.' },
]

export type DocType = 'offer' | 'employment' | 'confirmation' | 'experience' | 'advance' | 'warning' | 'query' | 'invoice' | 'receipt' | 'po' | 'letter'
export type DocGroup = 'HR letters' | 'Finance' | 'General'
export const DOC_TYPES: { v: DocType; n: string; group: DocGroup }[] = [
  { v: 'offer', n: 'Offer letter', group: 'HR letters' },
  { v: 'employment', n: 'Employment contract', group: 'HR letters' },
  { v: 'confirmation', n: 'Confirmation letter', group: 'HR letters' },
  { v: 'experience', n: 'Experience / employment verification', group: 'HR letters' },
  { v: 'advance', n: 'Salary advance letter', group: 'HR letters' },
  { v: 'warning', n: 'Warning letter', group: 'HR letters' },
  { v: 'query', n: 'Query letter', group: 'HR letters' },
  { v: 'invoice', n: 'Invoice', group: 'Finance' },
  { v: 'receipt', n: 'Receipt', group: 'Finance' },
  { v: 'po', n: 'Purchase order', group: 'Finance' },
  { v: 'letter', n: 'General letter (letterhead only)', group: 'General' },
]
export const GROUPS: DocGroup[] = ['HR letters', 'Finance', 'General']
export const typeName = (t: DocType) => DOC_TYPES.find((x) => x.v === t)?.n ?? t
export const groupOf = (t: DocType) => DOC_TYPES.find((x) => x.v === t)?.group ?? 'General'

export type SignRow = { label: string; name: string }
export type Block =
  | { id: string; type: 'heading'; text: string; size: 'title' | 'section' }
  | { id: string; type: 'rich'; html: string }
  | { id: string; type: 'table'; cols: string[]; rows: string[][]; header: boolean; labelCol: boolean }
  | { id: string; type: 'items'; rows: { desc: string; qty: number; price: number }[]; vat: boolean }
  | { id: string; type: 'signature'; signers: SignRow[]; dateLine: boolean }
  | { id: string; type: 'divider' }
  | { id: string; type: 'pagebreak' }
export type BlockType = Block['type']

export type UploadedFile = { name: string; url: string; kind: 'pdf' | 'image' | 'other' }
export type DocTemplate = {
  id: string; type: DocType; name: string; description: string
  blocks: Block[]; letterhead: boolean; style?: LetterheadStyle
  upload?: UploadedFile
  isStandard: boolean; builtin: boolean; version: number; editedBy: string; editedAt: string
}
export type Identity = {
  name: string; address: string; email: string; phone: string; website: string; rc: string
  logo: string | null; color: string; footer: string; style: LetterheadStyle
}
export type TemplateConfig = { identity: Identity; templates: DocTemplate[]; allowOverride: boolean }

/* ---------- Merge fields ---------- */
export type MergeField = { key: string; label: string; sample: string }
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
export const naira = (n: number) => '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f = (key: string, label: string, sample: string): MergeField => ({ key, label, sample })
export const MERGE_GROUPS: { group: string; fields: MergeField[] }[] = [
  { group: 'Company', fields: [f('company.name', 'Company name', ''), f('company.address', 'Address', ''), f('company.rc', 'RC number', ''), f('company.email', 'Email', ''), f('company.phone', 'Phone', ''), f('company.website', 'Website', '')] },
  { group: 'Employee / candidate', fields: [f('employee.name', 'Full name', 'Amaka Obi'), f('employee.id', 'Employee ID', 'ETZ-0142'), f('employee.address', 'Home address', '14 Admiralty Way, Lekki Phase 1, Lagos'), f('employee.email', 'Email', 'amaka.obi@example.com'), f('employee.job_title', 'Job title', 'Senior Software Engineer'), f('employee.department', 'Department', 'Technology'), f('employee.grade', 'Grade level', 'Grade 5 · Assistant Manager'), f('employee.employment_type', 'Employment type', 'Permanent'), f('employee.work_location', 'Work location', 'Victoria Island HQ, Lagos'), f('employee.manager', 'Reports to', 'Kunle Ogunleye')] },
  { group: 'Compensation', fields: [f('employee.salary', 'Gross monthly salary', '₦850,000.00'), f('employee.basic', 'Basic salary (monthly)', '₦425,000.00'), f('employee.housing', 'Housing allowance (monthly)', '₦212,500.00'), f('employee.transport', 'Transport allowance (monthly)', '₦212,500.00'), f('employee.annual_gross', 'Annual gross', '₦10,200,000.00')] },
  { group: 'Dates and terms', fields: [f('today', 'Today', fmtDate(new Date())), f('start_date', 'Start date', '2 November 2026'), f('probation', 'Probation period', 'six (6) months'), f('probation_end_date', 'Probation end date', '1 May 2027'), f('offer_deadline', 'Offer acceptance deadline', '16 October 2026'), f('notice_period', 'Notice period', 'One (1) month'), f('leave_days', 'Annual leave days', '20'), f('confirmation_date', 'Confirmation date', '2 May 2027'), f('end_date', 'Last working day', '30 September 2026')] },
  { group: 'HR letters', fields: [f('signer.name', 'Signatory name', 'Kemi Balogun'), f('signer.title', 'Signatory title', 'Head, Human Resources'), f('advance.amount', 'Advance amount', '₦300,000.00'), f('advance.months', 'Repayment months', 'three (3)'), f('incident.date', 'Incident date', '6 October 2026'), f('incident.detail', 'Incident detail', 'repeated late resumption without notice to your line manager')] },
  { group: 'Customer / vendor', fields: [f('customer.name', 'Customer name', 'Nile Distribution Ltd'), f('customer.address', 'Customer address', '22 Ikorodu Road, Maryland, Lagos'), f('customer.email', 'Customer email', 'accounts@niledistribution.ng'), f('vendor.name', 'Vendor name', 'Computer Warehouse Ltd'), f('vendor.address', 'Vendor address', '5 Computer Village, Ikeja, Lagos')] },
  { group: 'Finance', fields: [f('invoice.number', 'Invoice number', 'INV-2026-0147'), f('invoice.date', 'Invoice date', fmtDate(new Date())), f('invoice.due_date', 'Due date', fmtDate(new Date(Date.now() + 30 * 864e5))), f('receipt.number', 'Receipt number', 'RCT-2026-0391'), f('payment.method', 'Payment method', 'Bank transfer'), f('payment.reference', 'Payment reference', 'NIP/20261017/00918273'), f('po.number', 'PO number', 'PO-2026-0218'), f('po.delivery_date', 'Delivery date', fmtDate(new Date(Date.now() + 14 * 864e5)))] },
]
export const MERGE_KEY_RE = /\{\{\s*([\w.]+)\s*\}\}/g
const SAMPLE: Record<string, string> = Object.fromEntries(MERGE_GROUPS.flatMap((g) => g.fields.map((x) => [x.key, x.sample])))

export const companyData = (i: Identity): Record<string, string> => ({ 'company.name': i.name, 'company.address': i.address, 'company.rc': i.rc, 'company.email': i.email, 'company.phone': i.phone, 'company.website': i.website })
/* Placeholder values for self-serve companies, so no sample person or company from the demo workspace appears. */
const OWN_SAMPLE: Record<string, string> = {
  'employee.name': 'Sample Employee', 'employee.id': 'EMP-0001', 'employee.address': '1 Sample Street, Lagos', 'employee.email': 'employee@example.com', 'employee.job_title': 'Job title', 'employee.department': 'Department', 'employee.work_location': 'Head office', 'employee.manager': 'Line Manager',
  'signer.name': 'Authorised Signatory', 'signer.title': 'Human Resources',
  'customer.name': 'Sample Customer Ltd', 'customer.address': '1 Sample Street, Lagos', 'customer.email': 'accounts@example.com', 'vendor.name': 'Sample Vendor Ltd', 'vendor.address': '1 Sample Street, Lagos',
}
export const sampleData = (i: Identity, own = false): Record<string, string> => ({ ...SAMPLE, ...(own ? OWN_SAMPLE : {}), ...companyData(i) })
export const employeeData = (e: Employee): Record<string, string> => ({ 'employee.name': e.name, 'employee.id': e.id, 'employee.job_title': e.role, 'employee.department': e.dept, 'employee.salary': naira(e.salary), 'employee.manager': e.manager })
export const isCompanyKey = (k: string) => k.startsWith('company.')

const strings = (b: Block): string[] => {
  switch (b.type) {
    case 'heading': return [b.text]
    case 'rich': return [b.html]
    case 'table': return [...b.cols, ...b.rows.flat()]
    case 'items': return b.rows.map((r) => r.desc)
    case 'signature': return b.signers.flatMap((s) => [s.label, s.name])
    default: return []
  }
}
export const keysUsed = (t: DocTemplate): string[] => {
  const keys = new Set<string>()
  t.blocks.flatMap(strings).forEach((s) => { for (const m of s.matchAll(MERGE_KEY_RE)) keys.add(m[1]) })
  return [...keys]
}
export const labelOfKey = (k: string) => MERGE_GROUPS.flatMap((g) => g.fields).find((x) => x.key === k)?.label ?? k

/* ---------- Safe rich text ---------- */
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br', 'h2', 'h3', 'div'])
export const escapeHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return escapeHtml(n.textContent ?? '')
    if (n.nodeType !== 1) return ''
    const el = n as Element, tag = el.tagName.toLowerCase()
    const inner = [...el.childNodes].map(walk).join('')
    if (tag === 'br') return '<br>'
    return ALLOWED.has(tag) ? `<${tag}>${inner}</${tag}>` : inner
  }
  return [...doc.body.childNodes].map(walk).join('')
}
export const fillHtml = (html: string, data: Record<string, string> | null) =>
  sanitize(html).replace(MERGE_KEY_RE, (_, k: string) => data ? (data[k] !== undefined && data[k] !== '' ? escapeHtml(data[k]) : `<mark class="dp-mf">${escapeHtml(k)}</mark>`) : `<mark class="dp-mf">{{${k}}}</mark>`)

/* ---------- Default content ---------- */
let seq = 0
const bid = () => `b${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
export const newBlock = (type: BlockType): Block => {
  const id = bid()
  switch (type) {
    case 'heading': return { id, type, text: 'Heading', size: 'section' }
    case 'rich': return { id, type, html: '<p>Write your text here. Use the merge-field menu to insert details such as {{employee.name}}.</p>' }
    case 'table': return { id, type, cols: ['Item', 'Details'], rows: [['', ''], ['', '']], header: true, labelCol: false }
    case 'items': return { id, type, rows: [{ desc: 'Item description', qty: 1, price: 0 }], vat: true }
    case 'signature': return { id, type, signers: [{ label: 'Authorised signatory', name: '{{signer.name}}' }], dateLine: true }
    case 'pagebreak': return { id, type }
    default: return { id, type: 'divider' }
  }
}
const H = (text: string, size: 'title' | 'section' = 'section'): Block => ({ id: bid(), type: 'heading', text, size })
const P = (html: string): Block => ({ id: bid(), type: 'rich', html })
const T = (rows: string[][], labelCol = true): Block => ({ id: bid(), type: 'table', cols: rows[0].map((_, i) => `Column ${i + 1}`), rows, header: false, labelCol })
const G = (cols: string[], rows: string[][]): Block => ({ id: bid(), type: 'table', cols, rows, header: true, labelCol: false })
const I = (rows: { desc: string; qty: number; price: number }[], vat = true): Block => ({ id: bid(), type: 'items', rows, vat })
const S = (signers: SignRow[], dateLine = true): Block => ({ id: bid(), type: 'signature', signers, dateLine })
const HR_SIGN = S([{ label: 'For: {{company.name}}', name: '{{signer.name}}, {{signer.title}}' }], false)
const ADDRESSEE = '<p>{{today}}</p><p><b>{{employee.name}}</b><br>{{employee.address}}</p>'

const BLOCKS: Record<DocType, () => Block[]> = {
  offer: () => [
    P(ADDRESSEE), P('<p>Dear {{employee.name}},</p>'), H('OFFER OF EMPLOYMENT: {{employee.job_title}}', 'title'),
    P('<p>Further to your interview and subsequent discussions, we are pleased to offer you employment with <b>{{company.name}}</b> (RC {{company.rc}}) on the terms set out below.</p>'),
    H('TERMS OF EMPLOYMENT'),
    T([['Position', '{{employee.job_title}}'], ['Grade level', '{{employee.grade}}'], ['Department', '{{employee.department}}'], ['Employment type', '{{employee.employment_type}}'], ['Reporting to', '{{employee.manager}}'], ['Place of work', '{{employee.work_location}}'], ['Start date', '{{start_date}}'], ['Probation', '{{probation}}, ending {{probation_end_date}}'], ['Notice period', '{{notice_period}}'], ['Annual leave', '{{leave_days}} working days per calendar year'], ['Working hours', 'Monday to Friday, 8:00am to 5:00pm']]),
    H('COMPENSATION'),
    G(['Component', 'Monthly amount'], [['Basic salary', '{{employee.basic}}'], ['Housing allowance', '{{employee.housing}}'], ['Transport allowance', '{{employee.transport}}'], ['Gross monthly salary', '{{employee.salary}}'], ['Annual gross', '{{employee.annual_gross}}']]),
    P('<p>Your salary is subject to PAYE and statutory deductions, including employee pension contributions under the Pension Reform Act 2014 (employer 10%, employee 8% of monthly emoluments). The company also registers you for the Employees\' Compensation Scheme and National Housing Fund, where applicable.</p><p>This offer is conditional on:</p><ul><li>satisfactory verification of your academic and professional credentials;</li><li>two satisfactory employment and guarantor references;</li><li>a satisfactory medical report and background screening.</li></ul><p>Please sign and return a copy of this letter by <b>{{offer_deadline}}</b> to confirm your acceptance. After that date this offer lapses. We look forward to welcoming you to the team.</p><p>Yours sincerely,</p>'),
    HR_SIGN, H('ACCEPTANCE'), P('<p>I, {{employee.name}}, accept this offer of employment on the terms stated above.</p>'), S([{ label: 'Candidate signature', name: '{{employee.name}}' }]),
  ],
  employment: () => [
    H('CONTRACT OF EMPLOYMENT', 'title'),
    P('<p>This Agreement is made on <b>{{start_date}}</b> between <b>{{company.name}}</b> (RC {{company.rc}}) of {{company.address}} (&ldquo;the Company&rdquo;) and <b>{{employee.name}}</b> of {{employee.address}} (&ldquo;the Employee&rdquo;).</p>'),
    H('1. Appointment and duties'), P('<p>The Employee is engaged as <b>{{employee.job_title}}</b> ({{employee.grade}}) on a {{employee.employment_type}} basis in the {{employee.department}} department, based at {{employee.work_location}} and reporting to {{employee.manager}}. The Employee shall perform all duties reasonably assigned and comply with the Company\'s policies as amended from time to time.</p>'),
    H('2. Probation'), P('<p>The first {{probation}} of employment, ending {{probation_end_date}}, is a probationary period. The Company may confirm, extend or terminate the appointment at the end of that period.</p>'),
    H('3. Remuneration and statutory deductions'),
    G(['Component', 'Monthly amount'], [['Basic salary', '{{employee.basic}}'], ['Housing allowance', '{{employee.housing}}'], ['Transport allowance', '{{employee.transport}}'], ['Gross monthly salary', '{{employee.salary}}'], ['Annual gross', '{{employee.annual_gross}}']]),
    P('<p>Salary is paid on or before the last working day of each month. PAYE tax, pension (Pension Reform Act 2014), National Housing Fund and other lawful deductions shall be made at source.</p>'),
    H('4. Hours of work and leave'), P('<p>Normal working hours are 8:00am to 5:00pm, Monday to Friday. The Employee is entitled to {{leave_days}} working days of annual leave, public holidays, and other leave in line with the Labour Act and Company policy.</p>'),
    H('5. Confidentiality'), P('<p>The Employee shall not, during or after employment, disclose confidential information of the Company, its customers or partners, and shall return all Company property on exit.</p>'),
    H('6. Termination'), P('<p>After confirmation, either party may end this Agreement by giving: {{notice_period}}. During probation, one (1) week\'s notice applies. The Company may dismiss without notice for gross misconduct.</p>'),
    H('7. Governing law'), P('<p>This Agreement is governed by the laws of the Federal Republic of Nigeria. Disputes shall first be resolved amicably, failing which by the courts of Lagos State.</p>'),
    S([{ label: 'For the Company', name: '{{signer.name}}, {{signer.title}}' }, { label: 'Employee', name: '{{employee.name}}' }]),
    S([{ label: 'Witness name and signature', name: '' }], false),
  ],
  confirmation: () => [
    P(ADDRESSEE), P('<p>Dear {{employee.name}},</p>'), H('CONFIRMATION OF APPOINTMENT', 'title'),
    P('<p>We refer to your appointment as <b>{{employee.job_title}}</b> ({{employee.grade}}) which commenced on {{start_date}}. Following the review of your performance during your probationary period, we are pleased to inform you that your appointment is <b>confirmed with effect from {{confirmation_date}}</b>.</p><p>Your confirmed gross monthly salary is {{employee.salary}} (basic {{employee.basic}}, housing {{employee.housing}}, transport {{employee.transport}}). All other terms and conditions of your employment remain unchanged, and you become entitled to the benefits available to confirmed staff under the Staff Handbook.</p><p>Congratulations, and we look forward to your continued contribution.</p><p>Yours sincerely,</p>'),
    HR_SIGN,
  ],
  experience: () => [
    P('<p>{{today}}</p>'), H('TO WHOM IT MAY CONCERN', 'title'), H('EMPLOYMENT VERIFICATION / EXPERIENCE LETTER'),
    P('<p>This is to certify that <b>{{employee.name}}</b> (Employee ID {{employee.id}}) was employed by <b>{{company.name}}</b> as <b>{{employee.job_title}}</b> in the {{employee.department}} department from <b>{{start_date}}</b> to <b>{{end_date}}</b>.</p><p>During this period, {{employee.name}} discharged assigned duties diligently and left the Company in good standing. We wish them every success in future endeavours.</p><p>This letter is issued at the request of the employee for verification purposes and without any liability on the part of the Company.</p><p>Yours faithfully,</p>'),
    HR_SIGN,
  ],
  advance: () => [
    P(ADDRESSEE), P('<p>Dear {{employee.name}},</p>'), H('SALARY ADVANCE: APPROVAL AND REPAYMENT TERMS', 'title'),
    P('<p>Following your request, management has approved a salary advance on the terms below.</p>'),
    T([['Amount approved', '{{advance.amount}}'], ['Repayment period', '{{advance.months}} equal monthly instalments'], ['Recovery method', 'Deducted from monthly salary through payroll'], ['Interest', 'None']]),
    P('<p>By signing below, you authorise the Company to recover the advance from your salary. Should your employment end before full repayment, the outstanding balance shall be deducted from your final entitlements.</p>'),
    HR_SIGN, S([{ label: 'Employee acceptance', name: '{{employee.name}}' }]),
  ],
  warning: () => [
    P('<p>{{today}}</p><p><b>PRIVATE & CONFIDENTIAL</b></p><p>{{employee.name}}<br>{{employee.job_title}}, {{employee.department}}</p>'), P('<p>Dear {{employee.name}},</p>'), H('WRITTEN WARNING', 'title'),
    P('<p>It has been brought to the Company\'s attention that on <b>{{incident.date}}</b> you were involved in {{incident.detail}}. This conduct falls short of the standards expected under the Staff Handbook and Code of Conduct.</p><p>This letter serves as a formal written warning. You are required to show immediate and sustained improvement. A repeat of this or any similar conduct may result in further disciplinary action, up to and including dismissal.</p><p>You may submit a written response within three (3) working days. A copy of this letter will be placed on your personnel file.</p><p>Yours sincerely,</p>'),
    HR_SIGN, S([{ label: 'Received by (employee)', name: '{{employee.name}}' }]),
  ],
  query: () => [
    P('<p>{{today}}</p><p><b>PRIVATE & CONFIDENTIAL</b></p><p>{{employee.name}}<br>{{employee.job_title}}, {{employee.department}}</p>'), P('<p>Dear {{employee.name}},</p>'), H('QUERY: REQUEST FOR WRITTEN EXPLANATION', 'title'),
    P('<p>Management has observed that on <b>{{incident.date}}</b> there was {{incident.detail}}.</p><p>You are required to explain in writing, within <b>forty-eight (48) hours</b> of receiving this letter, why disciplinary action should not be taken against you. Your explanation should be addressed to the undersigned.</p><p>Failure to respond within the stated period will be taken as an admission, and the Company will proceed as it deems appropriate.</p><p>Yours sincerely,</p>'),
    HR_SIGN, S([{ label: 'Received by (employee)', name: '{{employee.name}}' }]),
  ],
  invoice: () => [
    H('INVOICE', 'title'),
    T([['Invoice number', '{{invoice.number}}'], ['Invoice date', '{{invoice.date}}'], ['Due date', '{{invoice.due_date}}'], ['Billed to', '{{customer.name}}'], ['Address', '{{customer.address}}']]),
    I([{ desc: 'Payment gateway integration (monthly licence)', qty: 1, price: 1500000 }, { desc: 'Transaction processing support, 40 hours', qty: 40, price: 25000 }, { desc: 'USSD short-code maintenance', qty: 3, price: 120000 }]),
    H('PAYMENT DETAILS'), P('<p>Please pay by transfer to <b>{{company.name}}</b>, Zenith Bank Plc, Account No. 1012345678. Use <b>{{invoice.number}}</b> as the payment reference. Payment is due within 30 days. All amounts are in Nigerian Naira (₦) and VAT is charged at 7.5%.</p><p>Thank you for your business.</p>'),
  ],
  receipt: () => [
    H('PAYMENT RECEIPT', 'title'),
    T([['Receipt number', '{{receipt.number}}'], ['Date', '{{today}}'], ['Received from', '{{customer.name}}'], ['Payment method', '{{payment.method}}'], ['Reference', '{{payment.reference}}']]),
    I([{ desc: 'Payment against invoice {{invoice.number}}', qty: 1, price: 2146512.5 }], false),
    P('<p>Received with thanks. This receipt confirms payment in full for the item(s) above.</p>'), S([{ label: 'Received by (Finance)', name: '{{signer.name}}' }], true),
  ],
  po: () => [
    H('PURCHASE ORDER', 'title'),
    T([['PO number', '{{po.number}}'], ['Date', '{{today}}'], ['Vendor', '{{vendor.name}}'], ['Vendor address', '{{vendor.address}}'], ['Delivery date', '{{po.delivery_date}}'], ['Deliver to', '{{company.address}}']]),
    I([{ desc: 'Dell Latitude 5440 laptop', qty: 10, price: 1250000 }, { desc: 'Laptop carry bag', qty: 10, price: 18000 }]),
    H('TERMS'), P('<ul><li>Payment terms: 30 days from receipt of goods and a valid tax invoice.</li><li>Goods must match the specification above; defective items will be returned at the vendor\'s cost.</li><li>Withholding tax will be deducted at source as required by law.</li></ul>'),
    S([{ label: 'Prepared by (Procurement)', name: '' }, { label: 'Approved by (Finance)', name: '{{signer.name}}' }]),
  ],
  letter: () => [
    P('<p>{{today}}</p><p>Our Ref: ____________________</p><p><b>Recipient name</b><br>Recipient address</p>'), P('<p>Dear Sir/Madam,</p>'), H('SUBJECT OF THE LETTER', 'title'),
    P('<p>Write the body of your letter here.</p>'), P('<p>Yours faithfully,</p>'), S([{ label: 'For: {{company.name}}', name: '{{signer.name}}, {{signer.title}}' }], false),
  ],
}
const DESC: Record<DocType, string> = {
  offer: 'Formal offer of employment with key terms and acceptance.', employment: 'Full contract of employment with Nigerian statutory references.',
  confirmation: 'Confirms an employee after probation.', experience: 'Letter verifying employment for third parties.',
  advance: 'Approval and payroll recovery terms for a salary advance.', warning: 'Formal written warning for the personnel file.',
  query: 'Request for written explanation within 48 hours.', invoice: 'Itemised invoice with computed subtotal, VAT at 7.5% and total.',
  receipt: 'Acknowledgement of payment received.', po: 'Purchase order for vendors with terms and approval.', letter: 'Blank letter on company letterhead.',
}
export const NEEDS_LETTERHEAD: DocType[] = ['offer', 'employment', 'confirmation', 'experience', 'advance', 'warning', 'query', 'invoice', 'receipt', 'po', 'letter']

export const defaultTemplate = (type: DocType, by = 'BizFlow'): DocTemplate => ({
  id: `tpl-${type}`, type, name: typeName(type), description: DESC[type], blocks: BLOCKS[type](), letterhead: NEEDS_LETTERHEAD.includes(type),
  isStandard: true, builtin: true, version: 1, editedBy: by, editedAt: new Date().toISOString(),
})

export function seedIdentity(t: Pick<Tenant, 'profile' | 'brand'>): Identity {
  const p = t.profile
  return {
    name: p.name, address: p.address, email: p.email, phone: p.phone, website: p.website.replace(/^https?:\/\//, ''), rc: p.cac.replace(/^RC\s*/i, ''),
    logo: null, color: t.brand.primary, style: 'classic',
    footer: `${p.name}${p.cac ? ` · ${p.cac}` : ''}${p.address ? ` · ${p.address}` : ''}`,
  }
}
export type ResolvedIdentity = Identity & { initials: string }
export const resolveIdentity = (i: Identity, t?: Pick<Tenant, 'brand'>): ResolvedIdentity => ({
  ...i, logo: i.logo || t?.brand.logo || t?.brand.favicon || null,
  initials: i.name.replace(/&/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
})

/* ---------- Store ---------- */
const KEY = (slug: string) => `bf-doc-templates-v3:${slug}`
/* v2 also held the old Employment terms; those now live in the employee rules store, which migrates them. */
const KEY_V2 = (slug: string) => `bf-doc-templates-v2:${slug}`
const cache = new Map<string, TemplateConfig>()
const subs = new Set<() => void>()

function seed(t: Pick<Tenant, 'profile' | 'brand'>): TemplateConfig {
  return { identity: seedIdentity(t), templates: DOC_TYPES.map((d) => defaultTemplate(d.v)), allowOverride: false }
}
function load(t: Pick<Tenant, 'slug' | 'profile' | 'brand'>): TemplateConfig {
  const hit = cache.get(t.slug)
  if (hit) return hit
  let cfg: TemplateConfig | null = null
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(t.slug)) || localStorage.getItem(KEY_V2(t.slug)) || 'null') as (TemplateConfig & { terms?: unknown }) | null
    if (raw && raw.identity && Array.isArray(raw.templates)) { const { terms: _legacy, ...rest } = raw; void _legacy; cfg = rest }
  } catch { /* corrupt, reseed */ }
  cfg = cfg ?? seed(t)
  cache.set(t.slug, cfg)
  return cfg
}
function commit(slug: string, cfg: TemplateConfig) {
  cache.set(slug, cfg)
  try { localStorage.setItem(KEY(slug), JSON.stringify(cfg)) } catch { /* storage full */ }
  subs.forEach((s) => s())
}
export const getTemplateConfig = (t: Pick<Tenant, 'slug' | 'profile' | 'brand'>) => load(t)
export const useTemplateConfig = (t: Pick<Tenant, 'slug' | 'profile' | 'brand'>): TemplateConfig =>
  useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => load(t))

const audit = (slug: string, action: string, ref: string, from?: string, to?: string) => recordAudit(slug, action, from, to, { category: 'Documents', ref })
const stampOf = (by: string) => ({ editedBy: by, editedAt: new Date().toISOString() })
const upd = (c: TemplateConfig, id: string, fn: (t: DocTemplate) => DocTemplate) => ({ ...c, templates: c.templates.map((t) => (t.id === id ? fn(t) : t)) })

type Ctx = Pick<Tenant, 'slug' | 'profile' | 'brand'>
export function saveIdentity(t: Ctx, identity: Identity, by: string) {
  const c = load(t), changed = (Object.keys(identity) as (keyof Identity)[]).filter((k) => identity[k] !== c.identity[k]).map((k) => (k === 'logo' ? 'logo' : k))
  commit(t.slug, { ...c, identity })
  audit(t.slug, 'Document template identity updated', 'Company identity', undefined, changed.join(', ') || 'no field changes')
  void by
}
export function saveTemplate(t: Ctx, tpl: DocTemplate, by: string): DocTemplate {
  const c = load(t), next = { ...tpl, version: tpl.version + 1, ...stampOf(by) }
  commit(t.slug, upd(c, tpl.id, () => next))
  audit(t.slug, 'Document template updated', next.name, `v${tpl.version}`, `v${next.version}`)
  return next
}
export function createTemplate(t: Ctx, type: DocType, name: string, by: string): DocTemplate {
  const c = load(t), base = defaultTemplate(type, by)
  const tpl: DocTemplate = { ...base, id: `tpl-${Math.random().toString(36).slice(2, 9)}`, name, isStandard: false, builtin: false, ...stampOf(by) }
  commit(t.slug, { ...c, templates: [...c.templates, tpl] })
  audit(t.slug, 'Document template created', name, undefined, typeName(type))
  return tpl
}
export function duplicateTemplate(t: Ctx, id: string, by: string): DocTemplate | null {
  const c = load(t), src = c.templates.find((x) => x.id === id)
  if (!src) return null
  const copy: DocTemplate = { ...src, id: `tpl-${Math.random().toString(36).slice(2, 9)}`, name: `${src.name} (copy)`, isStandard: false, builtin: false, version: 1, blocks: src.blocks.map((b) => ({ ...b, id: bid() })), ...stampOf(by) }
  commit(t.slug, { ...c, templates: [...c.templates, copy] })
  audit(t.slug, 'Document template duplicated', copy.name, src.name)
  return copy
}
export function resetTemplate(t: Ctx, id: string, by: string): DocTemplate | null {
  const c = load(t), cur = c.templates.find((x) => x.id === id)
  if (!cur) return null
  const base = defaultTemplate(cur.type, by)
  const next: DocTemplate = { ...cur, blocks: base.blocks, description: base.description, letterhead: base.letterhead, style: undefined, upload: undefined, version: cur.version + 1, ...stampOf(by) }
  commit(t.slug, upd(c, id, () => next))
  audit(t.slug, 'Document template reset to default', cur.name, `v${cur.version}`, `v${next.version}`)
  return next
}
export function deleteTemplate(t: Ctx, id: string, by: string) {
  const c = load(t), cur = c.templates.find((x) => x.id === id)
  if (!cur || cur.builtin || cur.isStandard) return
  commit(t.slug, { ...c, templates: c.templates.filter((x) => x.id !== id) })
  audit(t.slug, 'Document template deleted', cur.name)
  void by
}
export function setStandard(t: Ctx, id: string, by: string) {
  const c = load(t), cur = c.templates.find((x) => x.id === id)
  if (!cur) return
  const prev = c.templates.find((x) => x.type === cur.type && x.isStandard && x.id !== id)
  commit(t.slug, { ...c, templates: c.templates.map((x) => (x.type === cur.type ? { ...x, isStandard: x.id === id, ...(x.id === id || x.isStandard ? stampOf(by) : {}) } : x)) })
  audit(t.slug, 'Company standard template changed', typeName(cur.type), prev?.name, cur.name)
}
export function setAllowOverride(t: Ctx, allow: boolean, by: string) {
  void by
  commit(t.slug, { ...load(t), allowOverride: allow })
  audit(t.slug, 'Document template override policy changed', 'Template policy', allow ? 'Standard only' : 'Variants allowed', allow ? 'Variants allowed' : 'Standard only')
}
export const standardFor = (c: TemplateConfig, type: DocType) => c.templates.find((x) => x.type === type && x.isStandard)
/* ---------- Employment details form (candidate or employee) ---------- */
export type EmpForm = {
  name: string; address: string; email: string; job_title: string; department: string; grade: string; step: string; employment_type: string
  work_location: string; manager: string; start: string; probation_months: string; gross: string
  basic: string; housing: string; transport: string; deadline: string; notice: string; leave: string
}
export const EMPLOYMENT_TYPES = ['Permanent', 'Fixed-term contract', 'Probationary', 'Internship / NYSC', 'Part-time']
export const blankEmpForm = (set: RuleSet): EmpForm => ({
  name: '', address: '', email: '', job_title: '', department: '', grade: '', step: '', employment_type: 'Permanent', work_location: '', manager: '', start: '',
  probation_months: String(set.defaults.probation), gross: '', basic: '', housing: '', transport: '', deadline: '', notice: noticeText(set.defaults.noticeDays), leave: String(set.defaults.leave),
})
/** What the company rules dictate for the form's department + grade (+ step), if the selection is complete. */
export const ruleFor = (set: RuleSet, f: Pick<EmpForm, 'department' | 'grade' | 'step'>) => resolve(set, f.department, f.grade, parseInt(f.step) || 0)
/** Fills salary, breakdown, probation, leave and notice from the rules. Leaves the form alone if the selection is incomplete. */
export function applyRules(set: RuleSet, f: EmpForm): EmpForm {
  const r = ruleFor(set, f)
  if (!r) return f
  return { ...f, ...(r.gross !== undefined ? { gross: String(r.gross) } : {}), probation_months: String(r.probation), leave: String(r.leave), notice: r.notice, basic: '', housing: '', transport: '' }
}
export type FieldDef = { key: keyof EmpForm; label: string; kind: 'text' | 'email' | 'date' | 'number' | 'money' | 'select' | 'textarea'; required?: boolean; mergeKeys: string[]; options?: string[] }
export const EMP_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Full name', kind: 'text', required: true, mergeKeys: ['employee.name'] },
  { key: 'address', label: 'Home address', kind: 'textarea', required: true, mergeKeys: ['employee.address'] },
  { key: 'email', label: 'Email', kind: 'email', mergeKeys: ['employee.email'] },
  { key: 'job_title', label: 'Job title', kind: 'text', required: true, mergeKeys: ['employee.job_title'] },
  { key: 'department', label: 'Department', kind: 'text', required: true, mergeKeys: ['employee.department'] },
  { key: 'grade', label: 'Grade level', kind: 'select', required: true, mergeKeys: ['employee.grade'] },
  { key: 'step', label: 'Step', kind: 'select', mergeKeys: ['employee.grade'] },
  { key: 'employment_type', label: 'Employment type', kind: 'select', required: true, mergeKeys: ['employee.employment_type'], options: EMPLOYMENT_TYPES },
  { key: 'work_location', label: 'Work location', kind: 'text', mergeKeys: ['employee.work_location'] },
  { key: 'manager', label: 'Reporting to', kind: 'text', mergeKeys: ['employee.manager'] },
  { key: 'start', label: 'Start date', kind: 'date', required: true, mergeKeys: ['start_date', 'confirmation_date'] },
  { key: 'probation_months', label: 'Probation period (months)', kind: 'number', required: true, mergeKeys: ['probation', 'probation_end_date', 'confirmation_date'] },
  { key: 'gross', label: 'Gross monthly salary (₦)', kind: 'money', required: true, mergeKeys: ['employee.salary', 'employee.annual_gross', 'employee.basic', 'employee.housing', 'employee.transport'] },
  { key: 'deadline', label: 'Offer acceptance deadline', kind: 'date', required: true, mergeKeys: ['offer_deadline'] },
  { key: 'notice', label: 'Notice period', kind: 'text', mergeKeys: ['notice_period'] },
  { key: 'leave', label: 'Annual leave days', kind: 'number', mergeKeys: ['leave_days'] },
]
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const num = (s: string) => { const n = parseFloat(s.replace(/,/g, '')); return Number.isFinite(n) ? n : 0 }
export const isoToLong = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return iso && !isNaN(+d) ? fmtDate(d) : '' }
export function addMonthsISO(iso: string, months: number): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(+d)) return ''
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() !== day) d.setDate(0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Probation ends the day before the same date N months later. */
export function probationEndISO(startISO: string, months: number): string {
  const e = addMonthsISO(startISO, months)
  if (!e) return ''
  const d = new Date(e + 'T00:00:00'); d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function splitSalary(f: EmpForm, set: RuleSet): { basic: number; housing: number; transport: number; edited: boolean } {
  const g = num(f.gross), r = (p: number) => Math.round(g * p) / 100, base: Split = ruleFor(set, f)?.split ?? set.defaults.split
  const edited = !!(f.basic || f.housing || f.transport)
  return {
    basic: f.basic ? num(f.basic) : r(base.basic),
    housing: f.housing ? num(f.housing) : r(base.housing),
    transport: f.transport ? num(f.transport) : r(base.transport), edited,
  }
}
export function buildEmploymentData(f: EmpForm, set: RuleSet): Record<string, string> {
  const grade = set.grades.find((x) => x.id === f.grade), st = parseInt(f.step) || 0, m = Math.round(num(f.probation_months)), sp = splitSalary(f, set), g = num(f.gross)
  const d: Record<string, string> = {
    'employee.name': f.name, 'employee.address': f.address, 'employee.email': f.email, 'employee.job_title': f.job_title, 'employee.department': f.department,
    'employee.grade': grade ? `${gradeLabel(grade)}${grade.steps > 0 && st ? ` · ${stepLabel(st)}` : ''}` : '', 'employee.employment_type': f.employment_type, 'employee.work_location': f.work_location, 'employee.manager': f.manager,
    start_date: isoToLong(f.start), probation: f.probation_months ? `${WORDS[m] ?? m} (${m}) month${m === 1 ? '' : 's'}` : '',
    probation_end_date: isoToLong(probationEndISO(f.start, m)), confirmation_date: isoToLong(addMonthsISO(f.start, m)),
    offer_deadline: isoToLong(f.deadline), notice_period: f.notice, leave_days: f.leave,
  }
  if (g > 0) Object.assign(d, { 'employee.salary': naira(g), 'employee.annual_gross': naira(g * 12), 'employee.basic': naira(sp.basic), 'employee.housing': naira(sp.housing), 'employee.transport': naira(sp.transport) })
  return d
}
/** Form values for an existing employee: their actual salary, with grade and step matched from the rules for their department. */
export function formFromEmployee(e: Employee, set: RuleSet, extra: { address?: string; email?: string; location?: string; start?: string } = {}): EmpForm {
  const n = nearestCell(set, e.dept, e.salary)
  const base: EmpForm = {
    ...blankEmpForm(set), name: e.name, job_title: e.role, department: e.dept, manager: e.manager, gross: String(e.salary), grade: n?.grade.id ?? '', step: n && n.step ? String(n.step) : '',
    address: extra.address ?? '', email: extra.email ?? '', work_location: extra.location ?? '', start: extra.start ?? '',
  }
  const r = ruleFor(set, base)
  return r ? { ...base, probation_months: String(r.probation), leave: String(r.leave), notice: r.notice } : base
}
