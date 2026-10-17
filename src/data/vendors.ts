import { isOwnDataset } from './demo'
export type Vendor = {
  id: string
  name: string
  category: string
  department: string
  contact: string
  status: 'Active' | 'Watchlist' | 'Suspended'
  contracted: number
  paid: number
  owing: number
  onTime: number
  quality: number
  compliance: number
  service: number
  lastReview: string
  reviewQuarter?: string
  reviewNote?: string
  reviewer?: string
}

const base: Vendor[] = [
  { id: 'VEN-001', name: 'Computer Warehouse Ltd', category: 'IT equipment', department: 'Technology', contact: 'procurement@cwl.ng', status: 'Active', contracted: 18400000, paid: 13200000, owing: 5200000, onTime: 92, quality: 95, compliance: 96, service: 91, lastReview: '2 Oct 2026' },
  { id: 'VEN-002', name: 'Sahara Fuel Depot', category: 'Fuel & energy', department: 'Admin Department', contact: 'accounts@saharafuel.ng', status: 'Watchlist', contracted: 12600000, paid: 9180000, owing: 3420000, onTime: 64, quality: 72, compliance: 81, service: 68, lastReview: '30 Sep 2026' },
  { id: 'VEN-003', name: 'Prime Auto Care', category: 'Vehicle maintenance', department: 'Admin Department', contact: 'service@primeauto.ng', status: 'Active', contracted: 6800000, paid: 5960000, owing: 840000, onTime: 86, quality: 90, compliance: 94, service: 88, lastReview: '4 Oct 2026' },
  { id: 'VEN-004', name: 'TalentBridge Africa', category: 'Recruitment', department: 'HR Department', contact: 'hello@talentbridge.africa', status: 'Active', contracted: 4200000, paid: 3150000, owing: 1050000, onTime: 89, quality: 87, compliance: 98, service: 92, lastReview: '1 Oct 2026' },
  { id: 'VEN-005', name: 'MedSure HMO', category: 'Employee health', department: 'HR Department', contact: 'corporate@medsure.ng', status: 'Watchlist', contracted: 22400000, paid: 16800000, owing: 5600000, onTime: 73, quality: 69, compliance: 91, service: 65, lastReview: '28 Sep 2026' },
  { id: 'VEN-006', name: 'Cloud Systems Nigeria', category: 'Cloud infrastructure', department: 'Technology', contact: 'billing@cloudsystems.ng', status: 'Active', contracted: 29100000, paid: 24250000, owing: 4850000, onTime: 97, quality: 96, compliance: 99, service: 94, lastReview: '6 Oct 2026' },
  { id: 'VEN-007', name: 'Sterling Audit Partners', category: 'Professional services', department: 'Finance', contact: 'engagements@sterlingaudit.ng', status: 'Active', contracted: 9800000, paid: 7350000, owing: 2450000, onTime: 91, quality: 93, compliance: 100, service: 90, lastReview: '25 Sep 2026' },
  { id: 'VEN-008', name: 'MarketReach Media', category: 'Marketing services', department: 'Enterprise Sales', contact: 'accounts@marketreach.ng', status: 'Suspended', contracted: 7500000, paid: 5250000, owing: 2250000, onTime: 58, quality: 62, compliance: 75, service: 60, lastReview: '20 Sep 2026' },
  { id: 'VEN-009', name: 'ClientFirst Training', category: 'Service training', department: 'Customer Service', contact: 'team@clientfirst.africa', status: 'Active', contracted: 3600000, paid: 2400000, owing: 1200000, onTime: 88, quality: 91, compliance: 95, service: 93, lastReview: '3 Oct 2026' },
]

const genericDepartments: Record<string, string> = {
  'Admin Department': 'Operations',
  'Enterprise Sales': 'Sales',
  'Customer Service': 'Operations',
}

export const vendorsForTenant = (slug?: string): Vendor[] =>
  isOwnDataset(slug) ? [] : slug === 'etranzact' ? base : base.slice(0, 7).map((vendor) => ({ ...vendor, department: genericDepartments[vendor.department] ?? vendor.department }))

export const vendorScore = (vendor: Vendor) => Math.round((vendor.onTime + vendor.quality + vendor.compliance + vendor.service) / 4)
export const CURRENT_VENDOR_QUARTER = 'Q4 2026'
export const vendorEvaluationQuarter = (vendor: Vendor) => vendor.reviewQuarter ?? (/Oct|Nov|Dec/.test(vendor.lastReview) ? 'Q4 2026' : 'Q3 2026')
