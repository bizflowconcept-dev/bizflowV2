const M = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
const mrr = [6.1, 6.8, 7.4, 8.3, 9.0, 9.9, 11.2, 12.8, 13.9, 15.1, 16.4, 17.6]
const fresh = [3, 2, 4, 3, 5, 4, 6, 7, 5, 8, 7, 9]
const churn = [0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1]
const users = [820, 910, 1020, 1190, 1340, 1500, 1730, 1980, 2210, 2480, 2790, 3085]
const invoiced = [6.4, 7.0, 7.8, 8.6, 9.5, 10.4, 11.9, 13.4, 14.6, 15.8, 17.2, 18.5]
const collected = [6.0, 6.7, 7.5, 8.1, 9.2, 9.8, 11.2, 12.7, 13.6, 14.9, 16.0, 16.9]
let total = 8
export const GROWTH = M.map((m, i) => { total += fresh[i] - churn[i]; return { m, mrr: mrr[i], users: users[i], new: fresh[i], churned: churn[i], businesses: total, invoiced: invoiced[i], collected: collected[i] } })

const W = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
const opened = [31, 28, 35, 40, 33, 38, 42, 36]
const resolved = [29, 30, 33, 36, 34, 37, 39, 38]
export const TICKETS = W.map((m, i) => ({ m, opened: opened[i], resolved: resolved[i] }))

export const SYSTEM = Array.from({ length: 30 }, (_, i) => ({
  m: `${i + 9 > 30 ? i - 21 : i + 9} ${i + 9 > 30 ? 'Oct' : 'Sep'}`,
  p95: 210 + Math.round(Math.sin(i / 2.2) * 28 + (i % 7) * 4 + (i === 18 ? 90 : 0)),
  prov: 34 + Math.round(Math.cos(i / 3) * 6 + (i % 5) * 1.5 + (i === 18 ? 22 : 0)),
}))

export const METHODS = [['Card (Paystack)', 58], ['Bank transfer', 31], ['Direct debit', 8], ['USSD', 3]] as const
