import type { Employee } from '../../../data/demo'

export type Dept = { name: string; head: string; teams: string[] }
export type Br = { name: string; address: string; lead: string; type: string }
export type Group = 'Reporting line' | 'By department' | 'By branch'
export type Kind = 'company' | 'branch' | 'dept' | 'team' | 'person'

export type ONode = {
  id: string
  kind: Kind
  label: string
  sub: string
  members: Employee[] // everyone in this node's subtree (people nodes include themselves)
  children: ONode[]
  person?: Employee
  head?: Employee
  manager: string
  directs: number // direct reports (people) or direct sub-units (groups)
}

export const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const costLabel = (cost: string) => cost.replace(/^CC-\d+\s*/, '') || cost
const isTop = (e: Employee) => /\b(ceo|managing director|chief executive|founder|owner)\b/i.test(e.role)
const rank = (e: Employee) => e.salary

export const tenureYears = (e: Employee) => (e.status === 'Onboarding' ? 0.1 : 0.6 + (hash(e.id) % 80) / 10)

export function ngn(n: number, compact = true) {
  if (!compact) return `₦${Math.round(n).toLocaleString('en-NG')}`
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}K`
  return `₦${Math.round(n)}`
}

const sortHeadFirst = (list: Employee[], head?: Employee) => [...list].sort((a, b) => (a === head ? -1 : b === head ? 1 : rank(b) - rank(a)))

function personLeaf(e: Employee, manager: string): ONode {
  return { id: `p:${e.id}`, kind: 'person', label: e.name, sub: e.role, members: [e], children: [], person: e, manager, directs: 0 }
}

function reportingTree(emps: Employee[]): ONode[] {
  if (!emps.length) return []
  const byName = new Map(emps.map((e) => [e.name, e]))
  const root = emps.find(isTop) ?? emps.find((e) => !byName.has(e.manager)) ?? emps[0]
  const parentOf = new Map<string, Employee>()
  for (const e of emps) {
    if (e === root) continue
    let p = byName.get(e.manager)
    // guard against cycles / self-reference: fall back to the top of the chart
    let cur = p, steps = 0, cyc = false
    while (cur && !cyc) { if (cur === e || steps++ > 30) cyc = true; else cur = byName.get(cur.manager) }
    if (!p || cyc) p = root
    parentOf.set(e.id, p)
  }
  const kids = (e: Employee) => emps.filter((x) => parentOf.get(x.id) === e).sort((a, b) => rank(b) - rank(a))
  const build = (e: Employee, mgr: string): ONode => {
    const ch = kids(e).map((k) => build(k, e.name))
    const members = [e, ...ch.flatMap((c) => c.members)]
    return { id: `p:${e.id}`, kind: 'person', label: e.name, sub: e.role, members, children: ch, person: e, manager: mgr, directs: ch.length }
  }
  return [build(root, root.manager)]
}

function groupPeople(list: Employee[], head?: Employee): ONode[] {
  return sortHeadFirst(list, head).map((e) => personLeaf(e, e === head ? 'Reports to MD / CEO' : head?.name ?? e.manager))
}

function deptNode(name: string, list: Employee[], dept: Dept | undefined, prefix: string, teamsFallback: string[]): ONode {
  const head = list.find((e) => e.name === dept?.head) ?? list.find((e) => /head|manager|director|lead|chief|hr department/i.test(e.role)) ?? [...list].sort((a, b) => rank(b) - rank(a))[0]
  const teamMap = new Map<string, Employee[]>()
  for (const e of list) teamMap.set(costLabel(e.cost), [...(teamMap.get(costLabel(e.cost)) ?? []), e])
  let children: ONode[]
  if (teamMap.size > 1) {
    children = [...teamMap.entries()].map(([team, ms]) => {
      const th = [...ms].sort((a, b) => rank(b) - rank(a))[0]
      return { id: `${prefix}t:${name}|${team}`, kind: 'team' as Kind, label: team, sub: `Team · ${th.name}`, members: ms, children: groupPeople(ms, th), head: th, manager: th.name, directs: ms.length }
    })
  } else if (list.length) {
    children = groupPeople(list, head)
  } else {
    children = teamsFallback.map((t) => ({ id: `${prefix}t:${name}|${t}`, kind: 'team' as Kind, label: t, sub: 'Team · open', members: [], children: [], manager: dept?.head ?? 'To be assigned', directs: 0 }))
  }
  return { id: `${prefix}d:${name}`, kind: 'dept', label: name, sub: head ? `Led by ${head.name}` : `Led by ${dept?.head ?? 'to be assigned'}`, members: list, children, head, manager: head?.name ?? dept?.head ?? 'To be assigned', directs: children.length }
}

export function buildTree(group: Group, emps: Employee[], depts: Dept[], branches: Br[], company: string): ONode {
  let children: ONode[] = []
  if (group === 'Reporting line') {
    children = reportingTree(emps)
  } else if (group === 'By department') {
    const names = [...new Set([...depts.map((d) => d.name), ...emps.map((e) => e.dept)])]
    children = names.map((n) => deptNode(n, emps.filter((e) => e.dept === n), depts.find((d) => d.name === n), '', depts.find((d) => d.name === n)?.teams ?? []))
      .sort((a, b) => b.members.length - a.members.length)
  } else {
    const names = [...new Set([...branches.map((b) => b.name), ...emps.map((e) => e.branch)])]
    children = names.map((n) => {
      const list = emps.filter((e) => e.branch === n)
      const br = branches.find((b) => b.name === n)
      const lead = list.find((e) => e.name === br?.lead) ?? [...list].sort((a, b) => rank(b) - rank(a))[0]
      const ds = [...new Set(list.map((e) => e.dept))].map((d) => deptNode(d, list.filter((e) => e.dept === d), undefined, `b:${n}|`, []))
      return { id: `b:${n}`, kind: 'branch' as Kind, label: n, sub: `${br?.type ?? 'Branch'} · ${lead?.name ?? br?.lead ?? 'No lead'}`, members: list, children: ds.sort((a, b) => b.members.length - a.members.length), head: lead, manager: lead?.name ?? br?.lead ?? 'To be assigned', directs: ds.length }
    }).sort((a, b) => b.members.length - a.members.length)
  }
  const ceo = emps.find(isTop)
  return { id: 'root', kind: 'company', label: company, sub: ceo ? `${ceo.name} · ${ceo.role}` : 'Company', members: emps, children, head: ceo, manager: ceo?.manager ?? 'Board of Directors', directs: children.length }
}

export type Flat = { node: ONode; parent: string | null; depth: number }
export function flatten(root: ONode) {
  const map = new Map<string, Flat>()
  const walk = (n: ONode, parent: string | null, depth: number) => { map.set(n.id, { node: n, parent, depth }); n.children.forEach((c) => walk(c, n.id, depth + 1)) }
  walk(root, null, 0)
  return map
}
export const ancestorsOf = (map: Map<string, Flat>, id: string) => {
  const out: string[] = []
  let cur = map.get(id)?.parent
  while (cur) { out.push(cur); cur = map.get(cur)?.parent }
  return out
}

export type Metrics = {
  headcount: number; pct: number; vacancies: number; onLeave: number; present: number; remote: number; remotePct: number
  avgTenure: number; payroll: number; minSal: number; maxSal: number; avgSal: number; span: number
  branchDist: { name: string; count: number }[]; modeMix: { name: string; count: number }[]; statusMix: { name: string; count: number }[]
  costCentres: string[]
}

const tally = (xs: string[]) => {
  const m = new Map<string, number>()
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1))
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

export function vacanciesFor(n: ONode, total: number) {
  const h = n.members.length
  if (n.kind === 'person') return n.directs > 0 && hash(n.id) % 3 === 0 ? 1 : 0
  if (n.kind === 'company') return Math.max(1, Math.round(total * 0.09))
  return Math.floor(h * 0.08) + (hash(n.label) % 2)
}

export function metricsFor(n: ONode, total: number): Metrics {
  const ms = n.members
  const h = ms.length
  const sal = ms.map((m) => m.salary)
  const onLeave = ms.filter((m) => m.status === 'On leave').length
  const remote = ms.filter((m) => m.mode === 'Remote' || m.mode === 'Hybrid' || m.status === 'Remote').length
  return {
    headcount: h, pct: total ? (h / total) * 100 : 0, vacancies: vacanciesFor(n, total), onLeave, present: h - onLeave, remote, remotePct: h ? (remote / h) * 100 : 0,
    avgTenure: h ? ms.reduce((a, m) => a + tenureYears(m), 0) / h : 0,
    payroll: sal.reduce((a, b) => a + b, 0), minSal: h ? Math.min(...sal) : 0, maxSal: h ? Math.max(...sal) : 0, avgSal: h ? sal.reduce((a, b) => a + b, 0) / h : 0,
    span: n.directs,
    branchDist: tally(ms.map((m) => m.branch)), modeMix: tally(ms.map((m) => m.mode)), statusMix: tally(ms.map((m) => m.status)),
    costCentres: [...new Set(ms.map((m) => m.cost))],
  }
}

export function avgSpan(emps: Employee[]) {
  const t = reportingTree(emps)[0]
  if (!t) return 0
  const mgrs: number[] = []
  const walk = (n: ONode) => { if (n.directs > 0) mgrs.push(n.directs); n.children.forEach(walk) }
  walk(t)
  return mgrs.length ? mgrs.reduce((a, b) => a + b, 0) / mgrs.length : 0
}
