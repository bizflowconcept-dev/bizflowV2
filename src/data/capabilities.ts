import {
  BarChart3,
  BriefcaseBusiness,
  Files,
  Landmark,
  Settings2,
  UsersRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type CapabilityModule = {
  name: string
  shortName?: string
  description: string
}

export type Capability = {
  id: string
  number: string
  name: string
  shortDescription: string
  description: string
  icon: LucideIcon
  modules: CapabilityModule[]
}

export const CAPABILITIES: Capability[] = [
  {
    id: "people",
    number: "01",
    name: "People",
    shortDescription: "Manage your people from recruitment to retirement.",
    description:
      "Manage the complete employee lifecycle — from recruitment and onboarding to payroll, performance and offboarding.",
    icon: UsersRound,
    modules: [
      { name: "HR & People", description: "Keep employee records, roles, teams and company structure in one place." },
      { name: "Recruitment", description: "Move candidates from application to offer with a clear hiring record." },
      { name: "Employee Onboarding", shortName: "Onboarding", description: "Collect details, assign work and prepare new joiners before day one." },
      { name: "Attendance & Time", shortName: "Attendance", description: "Track time, shifts and exceptions across offices and field teams." },
      { name: "Hybrid & Remote Work", shortName: "Hybrid Work", description: "Set work locations and recognise scheduled remote days correctly." },
      { name: "Leave Management", shortName: "Leave", description: "Manage balances, requests and approvals without spreadsheet tracking." },
      { name: "Performance", description: "Set expectations, run reviews and keep development conversations visible." },
      { name: "Employee Self-Service", description: "Give employees secure access to their records, requests and documents." },
      { name: "My BizFlow", description: "Bring each employee's tasks, payslips, requests and actions into one view." },
    ],
  },
  {
    id: "money",
    number: "02",
    name: "Money",
    shortDescription: "Manage payroll, accounting and business finances together.",
    description:
      "Manage payroll, accounting, expenses and the money flowing through your business from one connected financial layer.",
    icon: Landmark,
    modules: [
      { name: "Payroll", description: "Run compensation, PAYE, pension and statutory deductions with approval controls." },
      { name: "Accounting", description: "Post transactions to a connected ledger and keep financial records current." },
      { name: "Expenses", description: "Capture, approve and account for employee and business spending." },
      { name: "Accounts Payable", shortName: "Payables", description: "Track supplier bills, due dates, approvals and payments." },
      { name: "Accounts Receivable", shortName: "Receivables", description: "Follow invoices and customer balances from issue to settlement." },
      { name: "Budgeting", description: "Plan and monitor spending against branches, teams and cost centres." },
      { name: "Salary Advance", description: "Manage approved employee advances with a clear repayment record." },
      { name: "Salary-on-Demand", description: "Give eligible employees controlled access to earned pay." },
      { name: "Financial Reports", description: "Read profit, cash and position from the same operational records." },
    ],
  },
  {
    id: "operations",
    number: "03",
    name: "Operations",
    shortDescription: "Keep everyday work moving without chasing people.",
    description:
      "Keep everyday operations moving with connected requests, approvals, procurement, assets, fleet and tasks.",
    icon: Settings2,
    modules: [
      { name: "Requests", description: "Start structured business requests with the right context and owner." },
      { name: "Approvals", description: "Route decisions by role, amount and scope with a complete history." },
      { name: "Procurement", description: "Move purchasing from request to vendor, receipt and accounting." },
      { name: "Assets", description: "Track acquisition, assignment, condition, maintenance and disposal." },
      { name: "Fleet", description: "Manage vehicles, custodians, documents, service and operating status." },
      { name: "Travel", description: "Manage travel requests, approvals, allowances, preparation, disbursement and post-trip retirement." },
      { name: "Vendor Management", shortName: "Vendors", description: "Give every department its own vendor register, financial position and consistent performance evaluations." },
      { name: "Tasks", description: "Assign accountable work with priorities, due dates and progress." },
      { name: "Maintenance", description: "Plan and record service work against vehicles and business assets." },
      { name: "Branch Operations", description: "Run local work while retaining a consolidated company view." },
    ],
  },
  {
    id: "customers",
    number: "04",
    name: "Customers",
    shortDescription: "Turn leads into customers and keep the full relationship visible.",
    description:
      "Turn leads into customers and keep every customer relationship organized and connected.",
    icon: BriefcaseBusiness,
    modules: [
      { name: "CRM", description: "Give teams one record of every relationship and commercial activity." },
      { name: "Leads", description: "Capture interest, qualify demand and keep next steps clear." },
      { name: "Customers", description: "Keep contacts, transactions, documents and activity together." },
      { name: "Opportunities", description: "Track potential revenue, owners, stages and expected close dates." },
      { name: "Sales Pipeline", shortName: "Pipeline", description: "See deal movement and focus teams on the right opportunities." },
      { name: "Follow-ups", description: "Plan and record the next action so customer work does not stall." },
      { name: "Customer Activity", description: "See calls, notes, tasks and documents in one chronological view." },
      { name: "Customer History", description: "Retain the complete relationship context across teams and time." },
    ],
  },
  {
    id: "workflow-documents",
    number: "05",
    name: "Workflow & Documents",
    shortDescription: "Create, approve and sign work without leaving BizFlow.",
    description:
      "Create, approve, sign, track and store business documents without leaving BizFlow.",
    icon: Files,
    modules: [
      { name: "Documents", description: "Store business files against the people and records they belong to." },
      { name: "BizFlow Sign", description: "Send, sign and manage agreements with role-based recipients." },
      { name: "Smart Documents", description: "Generate documents using trusted data already held in BizFlow." },
      { name: "Document Templates", shortName: "Templates", description: "Standardise recurring agreements, letters and operational forms." },
      { name: "Digital Signatures", description: "Complete signatures securely with clear recipient status." },
      { name: "Approvals", description: "Review and authorise documents before they move forward." },
      { name: "Business Workflows", shortName: "Workflows", description: "Connect people, decisions and records through repeatable processes." },
      { name: "Email Notifications", description: "Send activity alerts, approvals, reminders and important updates through email." },
      { name: "Audit Trail", description: "Retain a timestamped record of every document action and decision." },
    ],
  },
  {
    id: "insights-control",
    number: "06",
    name: "Insights & Control",
    shortDescription: "Understand the business and move from information to action.",
    description:
      "See what is happening across your business and move from information to action.",
    icon: BarChart3,
    modules: [
      { name: "Business Health", description: "See priorities, risks and performance across the company in seconds." },
      { name: "Reports", description: "Turn connected operational records into useful management views." },
      { name: "Analytics", description: "Compare trends, performance and exceptions across teams and time." },
      { name: "Branch Management", shortName: "Branches", description: "Control local operations while retaining company-wide visibility." },
      { name: "Cost Centres", description: "Attribute activity and spend to the parts of the business responsible." },
      { name: "Permissions", description: "Control access by role, permission, company scope and branch." },
      { name: "Audit", description: "Review who changed what, when and from which workflow." },
      { name: "Business Controls", description: "Apply approval, maker-checker and policy controls consistently." },
    ],
  },
]

export const SOLUTIONS = {
  roles: ["CEO / MD", "HR", "Finance", "Operations", "Managers", "Employees"],
  businesses: [
    "Growing Businesses",
    "Multi-Branch Businesses",
    "Professional Services",
    "Construction",
    "Logistics & Fleet",
    "Technology Companies",
    "NGOs",
    "Government Contractors",
  ],
}
