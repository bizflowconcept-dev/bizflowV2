import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, BookOpen, CheckCircle2, RefreshCw, Boxes, Check, GitBranch, KeyRound, Layers, Minus, Route, Search, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import source from 'virtual:bizflow-source-index'
import DocsPdf from './DocsPdf'
import { Badge, Fold, LogoMark, Tabs } from '../../components/ui'
import { useBilling } from '../../data/billing'
import { buildGraph, buildRegistry, fmtNaira, moduleName, planName } from '../../platform/registry'
import type { RegModule, Registry } from '../../platform/registry'
import { CHECKS, diffSeen, loadSeen, runIntegrity, saveSeen, summarize } from '../../platform/integrity'
import type { Finding, SeenSnapshot } from '../../platform/integrity'
import { ADDON_DOCS, ARCHITECTURE, AUDIENCE_DOCS, CHANGELOG, COMPANY_PERMISSION_DOCS, DOCS_VERSION, FLOW_DOCS, GROUP_DOCS, MODULE_DOCS, OPS_GUIDE, PLAN_DOCS } from '../../platform/docsContent'

const TABS = ['Overview', 'Modules', 'Plans & add-ons', 'Dependencies', 'Roles & access', 'Processes', 'Operations guide', 'Changelog', 'Integrity']
const GROUP_TONE: Record<string, string> = { people: 'bg-sky-100 text-sky-800', money: 'bg-emerald-100 text-emerald-800', operations: 'bg-amber-100 text-amber-800', customers: 'bg-rose-100 text-rose-800', workflow: 'bg-violet-100 text-violet-800', insights: 'bg-teal-100 text-teal-800' }
const chip = (g: string) => `inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${GROUP_TONE[g] ?? 'bg-slate/10 text-slate'}`

function SectionTitle({ icon: Ic, eyebrow, title, desc }: { icon: typeof BookOpen; eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-softmint text-teal"><Ic size={20} /></span>
      <div><div className="text-[11px] font-semibold uppercase tracking-wider text-teal">{eyebrow}</div><h2 className="font-display text-xl font-semibold">{title}</h2>{desc && <p className="mt-1 max-w-3xl text-sm text-slate">{desc}</p>}</div>
    </div>
  )
}

function ModuleCard({ m, r }: { m: RegModule; r: Registry }) {
  const doc = MODULE_DOCS[m.id]
  return (
    <Fold title={m.name} hint={`${m.groupName}${m.minPlan ? ` · from ${planName(r, m.minPlan)}` : ''}`}>
      <div className="space-y-4 text-sm">
        {doc ? <p className="leading-relaxed">{doc.what}</p> : <Badge tone="amber">Needs documentation</Badge>}
        {doc?.useCases && <ul className="list-disc space-y-1 pl-5 text-slate">{doc.useCases.map((u) => <li key={u}>{u}</li>)}</ul>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-cloud p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate">Requires</div><div className="mt-1.5 flex flex-wrap gap-1.5">{m.requires.length ? m.requires.map((d) => <span key={d} className="rounded bg-white px-2 py-0.5 text-xs font-medium ring-1 ring-line">{moduleName(r, d)}</span>) : <span className="text-xs text-slate">Nothing. Standalone.</span>}</div></div>
          <div className="rounded-lg border border-line bg-cloud p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate">Needed by</div><div className="mt-1.5 flex flex-wrap gap-1.5">{m.requiredBy.length ? m.requiredBy.map((d) => <span key={d} className="rounded bg-white px-2 py-0.5 text-xs font-medium ring-1 ring-line">{moduleName(r, d)}</span>) : <span className="text-xs text-slate">No other module.</span>}</div></div>
        </div>
        {m.features.length > 0 && <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Features</div><div className="flex flex-wrap gap-1.5">{m.features.map((f) => <span key={f.key} className="rounded-full bg-softmint px-2.5 py-0.5 text-xs font-medium text-teal">{f.name}</span>)}</div></div>}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate">
          {m.fromNGN !== undefined && <span>From <b className="text-ink">{fmtNaira(m.fromNGN)}</b> / month</span>}
          <span><b className="text-ink">{m.routes.length}</b> screens</span>
          <span><b className="text-ink">{m.permissions.length}</b> permissions</span>
          <span><b className="text-ink">{m.addons.length}</b> add-ons</span>
        </div>
        {m.nav.length > 0 && <div className="flex flex-wrap gap-1.5">{m.nav.map((n) => <code key={n.to} className="rounded bg-midnight/5 px-1.5 py-0.5 text-[11px] text-midnight">{n.to}</code>)}</div>}
        {doc?.limits && <div className="rounded-lg border border-warn/40 bg-amber-50 p-3 text-xs text-amber-900"><b>Known limits</b><ul className="mt-1 list-disc space-y-0.5 pl-4">{doc.limits.map((l) => <li key={l}>{l}</li>)}</ul></div>}
      </div>
    </Fold>
  )
}

const SEVERITY_TONE: Record<Finding['severity'], string> = { error: 'red', warn: 'amber', info: 'gray' }

function IntegrityPanel({ findings }: { findings: Finding[] }) {
  const sum = summarize(findings)
  const [show, setShow] = useState<'problems' | 'all'>('problems')
  const list = findings.filter((f) => show === 'all' || f.severity !== 'info')
  return (
    <div>
      <SectionTitle icon={ShieldCheck} eyebrow="Integrity" title="Does the handbook match the product?" desc="These checks compare the live registry (modules, plans, permissions, screens, storage) with the written prose. Errors fail pnpm docs:check; warnings and notes are for review." />
      <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-4 ${sum.pass ? 'border-ok/40 bg-green-50' : 'border-err/40 bg-red-50'}`} role="status">
        {sum.pass ? <CheckCircle2 size={22} className="text-ok" /> : <AlertTriangle size={22} className="text-err" />}
        <div className="font-semibold">{sum.pass ? 'Pass: no blocking findings' : `Fail: ${sum.error} blocking finding${sum.error === 1 ? '' : 's'}`}</div>
        <div className="ml-auto flex flex-wrap gap-2"><Badge tone="red">{sum.error} errors</Badge><Badge tone="amber">{sum.warn} warnings</Badge><Badge tone="gray">{sum.info} notes</Badge></div>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-2">{CHECKS.map((c) => { const n = findings.filter((f) => f.check === c.id); const bad = n.some((f) => f.severity !== 'info'); return <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-2.5 text-sm"><span>{c.title}</span>{bad ? <Badge tone={n.some((f) => f.severity === 'error') ? 'red' : 'amber'}>{n.filter((f) => f.severity !== 'info').length} to fix</Badge> : <Badge tone="green">{n.length ? `${n.length} note${n.length === 1 ? '' : 's'}` : 'Pass'}</Badge>}</div> })}</div>
      <div className="mb-3 flex gap-2">{(['problems', 'all'] as const).map((k) => <button key={k} onClick={() => setShow(k)} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${show === k ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate hover:border-teal'}`}>{k === 'problems' ? 'Errors and warnings' : 'Include notes'}</button>)}</div>
      <div className="space-y-2">
        {list.map((f) => (
          <div key={f.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm">
            <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
            <div className="min-w-0 flex-1"><div>{f.message}</div><div className="mt-0.5 text-xs text-slate">{CHECKS.find((c) => c.id === f.check)?.title}</div></div>
            {f.fix.to ? <Link to={f.fix.to} className="text-xs font-semibold text-teal hover:underline">{f.fix.label}</Link> : <code className="rounded bg-midnight/5 px-1.5 py-0.5 text-[11px]" title={f.fix.label}>{f.fix.file}</code>}
          </div>
        ))}
        {!list.length && <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-slate">Nothing to review.</p>}
      </div>
    </div>
  )
}

function WhatChanged({ r }: { r: Registry }) {
  const [seen, setSeen] = useState<SeenSnapshot | null>(() => loadSeen())
  const diff = useMemo(() => diffSeen(r, seen), [r, seen])
  const total = diff.reduce((n, d) => n + d.added.length + d.changed.length + d.removed.length, 0)
  const markSeen = () => setSeen(saveSeen(r))
  return (
    <div className="mb-6 rounded-xl border border-teal/30 bg-softmint/40 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">What changed since your last visit</h3>
        {seen && <Badge tone={total ? 'amber' : 'green'}>{total ? `${total} pending` : 'Up to date'}</Badge>}
        <button onClick={markSeen} disabled={!!seen && total === 0} className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-teal bg-white px-3 py-1.5 text-xs font-semibold text-teal hover:bg-softmint disabled:cursor-default disabled:opacity-50"><RefreshCw size={13} />Mark as seen</button>
      </div>
      {!seen && <p className="mt-2 text-sm text-slate">You have not marked anything as seen yet. Mark the current {r.items.length} registry items as seen to start tracking changes to modules, plans, add-ons, permissions, screens and storage keys.</p>}
      {seen && <p className="mt-2 text-xs text-slate">Compared with the snapshot you saved on {new Date(seen.at).toLocaleString('en-NG')}.</p>}
      {seen && total === 0 && <p className="mt-2 text-sm text-slate">Nothing has been added, changed or removed since then.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {diff.map((d) => (
          <div key={d.kind} className="rounded-lg border border-line bg-white p-3 text-sm">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">{d.kind.replace(/-/g, ' ')}</div>
            {([['added', 'green', d.added], ['changed', 'amber', d.changed], ['removed', 'red', d.removed]] as const).filter(([, , items]) => items.length).map(([k, tone, items]) => (
              <div key={k} className="mt-1.5 flex flex-wrap items-center gap-1.5"><Badge tone={tone}>{items.length} {k}</Badge>{items.slice(0, 6).map((i) => <code key={i.id} className="rounded bg-midnight/5 px-1.5 py-0.5 text-[11px]">{i.label}</code>)}{items.length > 6 && <span className="text-xs text-slate">+{items.length - 6} more</span>}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Docs() {
  const billing = useBilling()
  const r = useMemo(() => buildRegistry(source, billing), [billing])
  const optional = useMemo(() => Object.fromEntries(Object.entries(MODULE_DOCS).filter(([, d]) => d.optional).map(([k, d]) => [k, d.optional!])), [])
  const graph = useMemo(() => buildGraph(r, optional), [r, optional])
  const [tab, setTab] = useState('Overview')
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')
  const needle = q.trim().toLowerCase()
  const mods = r.modules.filter((m) => (group === 'all' || m.group === group) && (!needle || `${m.name} ${MODULE_DOCS[m.id]?.what ?? ''} ${m.features.map((f) => f.name).join(' ')}`.toLowerCase().includes(needle)))
  const layers = [...new Set(graph.nodes.map((n) => n.layer))].sort((a, b) => a - b)
  const undocumented = r.modules.filter((m) => !MODULE_DOCS[m.id]).length
  const findings = useMemo(() => runIntegrity(r), [r])
  const pending = findings.filter((f) => f.severity !== 'info').length
  const tabLabel = (t: string) => (t === 'Integrity' && pending ? `Integrity (${pending})` : t)

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-midnight-2 via-midnight to-black p-6 text-white md:p-9">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-mint/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-teal/30 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2.5"><LogoMark size={30} /><span className="font-display text-lg font-semibold tracking-tight">BizFlow</span><span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-mint">Platform handbook v{DOCS_VERSION}</span></div>
            <h1 className="mt-5 font-display text-3xl font-semibold leading-tight md:text-4xl">Everything BizFlow does, <span className="text-mint">documented from the code that runs it.</span></h1>
            <p className="mt-3 text-sm leading-relaxed text-white/70">Modules, plans, add-ons, dependencies, permissions, screens and processes are read live from the product catalog, so this handbook updates itself whenever the platform changes.</p>
            <div className="mt-5"><DocsPdf r={r} optional={optional} /></div>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[['Modules', r.stats.modules], ['Features', r.stats.features], ['Plans', r.stats.plans], ['Add-ons', r.stats.addons], ['Screens', r.stats.routes], ['Permissions', r.stats.companyPerms + r.stats.adminPerms]].map(([k, v]) => (
              <div key={k} className="min-w-24 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur"><dd className="num font-display text-2xl font-semibold text-mint">{v}</dd><dt className="text-[11px] uppercase tracking-wider text-white/60">{k}</dt></div>
            ))}
          </dl>
        </div>
      </section>

      <Tabs tabs={TABS.map(tabLabel)} value={tabLabel(tab)} onChange={(t) => setTab(t.replace(/ \(\d+\)$/, ''))} />

      {tab === 'Overview' && (
        <div className="space-y-8">
          <div>
            <SectionTitle icon={Layers} eyebrow="Architecture" title="How the platform fits together" />
            <div className="grid gap-3 md:grid-cols-2">{ARCHITECTURE.map((a, i) => <div key={a.title} className="rounded-xl border border-line bg-white p-5"><span className="num text-xs font-semibold text-teal">{String(i + 1).padStart(2, '0')}</span><h3 className="mt-1 font-semibold">{a.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-slate">{a.body}</p></div>)}</div>
          </div>
          <div>
            <SectionTitle icon={Boxes} eyebrow="Catalog" title="Module groups" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{r.groups.map((g) => { const ms = r.modules.filter((m) => m.group === g.id); return <button key={g.id} onClick={() => { setGroup(g.id); setTab('Modules') }} className="cursor-pointer rounded-xl border border-line bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-teal hover:shadow-md"><span className={chip(g.id)}>{ms.length} modules</span><h3 className="mt-2 font-semibold">{g.name}</h3><p className="mt-1 text-sm text-slate">{GROUP_DOCS[g.id]}</p></button> })}</div>
          </div>
          <div>
            <SectionTitle icon={ShieldCheck} eyebrow="Security" title="Three audiences, never mixed" />
            <div className="grid gap-3 md:grid-cols-3">{r.audiences.map((a) => <div key={a} className="rounded-xl border border-line bg-white p-5"><h3 className="font-semibold">{AUDIENCE_DOCS[a]?.name ?? a}</h3><code className="text-[11px] text-teal">{a}</code><p className="mt-2 text-sm text-slate">{AUDIENCE_DOCS[a]?.who}</p><p className="mt-1.5 text-sm">{AUDIENCE_DOCS[a]?.can}</p></div>)}</div>
          </div>
          {undocumented > 0 && <p className="rounded-lg border border-warn/40 bg-amber-50 p-3 text-sm text-amber-900">{undocumented} module(s) in the catalog have no written description yet.</p>}
          <p className="text-xs text-slate">Generated from {r.fileCount} source files ({r.lineCount.toLocaleString()} lines). Source fingerprint <code>{r.sourceHash}</code>.</p>
        </div>
      )}

      {tab === 'Modules' && (
        <div>
          <SectionTitle icon={Boxes} eyebrow="Modules" title="Module reference" desc="Open a module to see what it does, what it needs, which screens and permissions belong to it, and its known limits." />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-60 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search modules and features" className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20" /></div>
            {['all', ...r.groups.map((g) => g.id)].map((g) => <button key={g} onClick={() => setGroup(g)} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${group === g ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate hover:border-teal'}`}>{g === 'all' ? 'All' : r.groups.find((x) => x.id === g)?.name}</button>)}
          </div>
          <div className="space-y-2">{mods.map((m) => <ModuleCard key={m.id} m={m} r={r} />)}{!mods.length && <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-slate">No modules match.</p>}</div>
        </div>
      )}

      {tab === 'Plans & add-ons' && (
        <div className="space-y-8">
          <div>
            <SectionTitle icon={Sparkles} eyebrow="Plans" title="What each plan includes" />
            <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{r.plans.map((p) => <div key={p.id} className="rounded-xl border border-line bg-white p-5"><div className="flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{p.name}</h3><Badge>{p.status}</Badge></div><div className="mt-1 text-sm text-slate">{p.custom ? 'Custom quote' : `${fmtNaira(p.prices.NGN?.monthly)} / month`}</div><p className="mt-3 text-sm">{PLAN_DOCS[p.id]?.audience}</p><div className="mt-3 text-xs text-slate"><b className="text-ink">{p.moduleCount}</b> modules · <b className="text-ink">{p.featureCount}</b> features{p.trialDays ? ` · ${p.trialDays}-day trial` : ''}</div>{PLAN_DOCS[p.id]?.notes && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate">{PLAN_DOCS[p.id].notes!.map((n) => <li key={n}>{n}</li>)}</ul>}</div>)}</div>
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table className="w-full text-sm"><thead><tr className="border-b border-line bg-cloud text-left text-xs uppercase tracking-wider text-slate"><th className="px-4 py-3">Module</th>{r.plans.map((p) => <th key={p.id} className="px-4 py-3 text-center">{p.name}</th>)}</tr></thead>
                <tbody>{r.modules.map((m) => <tr key={m.id} className="border-b border-line/60 last:border-0"><td className="px-4 py-2 font-medium">{m.name}</td>{r.plans.map((p) => { const c = m.plans[p.id]; return <td key={p.id} className="px-4 py-2 text-center">{c?.state === 'included' ? <Check size={16} className={`mx-auto ${c.partial ? 'text-warn' : 'text-ok'}`} /> : c?.state === 'addon' ? <span className="text-[11px] font-semibold text-info">Add-on</span> : <Minus size={14} className="mx-auto text-line" />}</td> })}</tr>)}</tbody></table>
            </div>
          </div>
          <div>
            <SectionTitle icon={Boxes} eyebrow="Add-ons" title="Add-ons and bundles" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{r.addons.map((a) => <div key={a.id} className="rounded-xl border border-line bg-white p-5"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{a.name}</h3><Badge tone={a.active ? 'green' : 'gray'}>{a.active ? 'Active' : 'Inactive'}</Badge></div><div className="mt-0.5 text-xs text-slate">{a.category}{a.monthlyNGN !== undefined ? ` · ${fmtNaira(a.monthlyNGN)} / month` : ''}</div>{ADDON_DOCS[a.id] && <p className="mt-2 text-sm">{ADDON_DOCS[a.id].when}</p>}<div className="mt-3 flex flex-wrap gap-1.5">{a.modules.map((id) => <span key={id} className="rounded bg-softmint px-2 py-0.5 text-[11px] font-medium text-teal">{moduleName(r, id)}</span>)}</div></div>)}</div>
            {r.bundles.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-3">{r.bundles.map((b) => <div key={b.id} className="rounded-xl border border-teal/30 bg-softmint/40 p-5"><div className="flex justify-between"><h3 className="font-semibold">{b.name}</h3><Badge tone="green">Save {b.discountPct}%</Badge></div><p className="mt-1 text-sm text-slate">{b.description}</p><div className="mt-2 text-xs text-slate">{b.moduleIds.map((id) => moduleName(r, id)).join(' · ')}</div></div>)}</div>}
          </div>
        </div>
      )}

      {tab === 'Dependencies' && (
        <div>
          <SectionTitle icon={GitBranch} eyebrow="Dependencies" title="Module dependency map" desc="Read left to right. A module can only be sold or enabled when everything it requires is also on. Dashed links are optional: the module works alone but is better together." />
          <div className="mb-4 flex flex-wrap gap-3 text-xs">
            <Badge tone={graph.cycles.length ? 'red' : 'green'}>{graph.cycles.length ? `${graph.cycles.length} circular dependencies` : 'No circular dependencies'}</Badge>
            <Badge tone={graph.missing.length ? 'red' : 'green'}>{graph.missing.length ? `${graph.missing.length} missing targets` : 'All targets exist'}</Badge>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-white p-5">
            <div className="flex min-w-max gap-6">
              {layers.map((l) => (
                <div key={l} className="w-60 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">{l === 0 ? 'Foundation' : `Level ${l}`}</div>
                  {graph.nodes.filter((n) => n.layer === l).map((n) => {
                    const req = graph.edges.filter((e) => e.from === n.id && e.kind === 'requires'), opt = graph.edges.filter((e) => e.from === n.id && e.kind === 'optional')
                    return <div key={n.id} className={`rounded-lg border p-3 ${n.inCycle ? 'border-err bg-red-50' : 'border-line bg-cloud'}`}><div className="flex items-center justify-between gap-2"><b className="text-sm">{n.name}</b><span className={chip(n.group)}>{r.groups.find((g) => g.id === n.group)?.name}</span></div>{req.length > 0 && <div className="mt-1.5 text-xs text-slate">Needs <span className="font-medium text-ink">{req.map((e) => moduleName(r, e.to)).join(', ')}</span></div>}{opt.length > 0 && <div className="mt-1 border-t border-dashed border-line pt-1 text-xs text-slate">Better with {opt.map((e) => moduleName(r, e.to)).join(', ')}</div>}</div>
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <h3 className="mb-2 font-semibold">Company workspace module cascade</h3>
            <p className="mb-3 text-sm text-slate">Switching a workspace module on also switches on what it needs; switching one off removes what depends on it.</p>
            <div className="grid gap-2 md:grid-cols-2">{Object.entries(r.tenantDeps).map(([k, v]) => <div key={k} className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm"><b>{r.tenantCatalog.find((t) => t.id === k)?.name ?? k}</b> <span className="text-slate">needs</span> {v.map((d) => r.tenantCatalog.find((t) => t.id === d)?.name ?? d).join(', ')}</div>)}</div>
          </div>
        </div>
      )}

      {tab === 'Roles & access' && (
        <div className="space-y-8">
          <div>
            <SectionTitle icon={KeyRound} eyebrow="Company roles" title="What each company role can do" />
            <div className="grid gap-3 md:grid-cols-2">{r.companyRoles.map((role) => <Fold key={role.key} title={role.title} hint={`${role.permissions.length} permissions`}><p className="mb-2 text-sm text-slate">{role.scope}</p><div className="flex flex-wrap gap-1.5">{role.permissions.map((p) => <span key={p} title={COMPANY_PERMISSION_DOCS[p]} className="rounded bg-midnight/5 px-1.5 py-0.5 font-mono text-[11px]">{p}</span>)}</div></Fold>)}</div>
          </div>
          <div>
            <SectionTitle icon={ShieldCheck} eyebrow="Platform staff" title="BizFlow administrator roles" />
            <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-line bg-cloud text-left text-xs uppercase tracking-wider text-slate"><th className="px-4 py-3">Role</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Permissions</th></tr></thead><tbody>{r.adminRoles.map((a) => <tr key={a.key} className="border-b border-line/60 align-top last:border-0"><td className="px-4 py-2.5 font-medium">{a.title}</td><td className="px-4 py-2.5 text-slate">{a.department}</td><td className="px-4 py-2.5 text-slate">{a.scope}</td><td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{a.permissions.map((p) => <span key={p} className="rounded bg-softmint px-1.5 py-0.5 text-[11px] text-teal">{p}</span>)}</div></td></tr>)}</tbody></table></div>
          </div>
        </div>
      )}

      {tab === 'Processes' && (
        <div>
          <SectionTitle icon={Workflow} eyebrow="Flows" title="Platform processes" desc="Step-by-step flows, who acts at each step, and where the state is stored." />
          <div className="space-y-3">{FLOW_DOCS.map((f) => (
            <Fold key={f.id} title={f.title} hint={f.roles.join(' · ')}>
              <p className="mb-4 text-sm text-slate">{f.summary}</p>
              <ol className="relative space-y-4 border-l-2 border-softmint pl-6">{f.steps.map((s, i) => <li key={s.title} className="relative"><span className="absolute -left-[34px] flex size-6 items-center justify-center rounded-full bg-teal text-[11px] font-semibold text-white">{i + 1}</span><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{s.title}</b>{s.actor && <span className="rounded-full bg-midnight/5 px-2 py-0.5 text-[11px] text-slate">{s.actor}</span>}</div><p className="mt-0.5 text-sm text-slate">{s.detail}</p></li>)}</ol>
              {f.states && <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">{f.states.map((s, i) => <span key={s} className="flex items-center gap-1.5"><span className="rounded bg-softmint px-2 py-0.5 font-medium text-teal">{s}</span>{i < f.states!.length - 1 && <span className="text-slate">→</span>}</span>)}</div>}
              <div className="mt-4 flex flex-wrap gap-1.5">{f.modules.map((m) => <span key={m} className="rounded bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">{moduleName(r, m)}</span>)}{f.routes?.map((x) => <code key={x} className="rounded bg-midnight/5 px-1.5 py-0.5 text-[11px]">{x}</code>)}</div>
              {f.limits && <div className="mt-3 rounded-lg border border-warn/40 bg-amber-50 p-3 text-xs text-amber-900"><ul className="list-disc space-y-0.5 pl-4">{f.limits.map((l) => <li key={l}>{l}</li>)}</ul></div>}
            </Fold>
          ))}</div>
        </div>
      )}

      {tab === 'Operations guide' && (
        <div>
          <SectionTitle icon={Route} eyebrow="Runbook" title="Running the platform" desc="How BizFlow staff operate the Platform Console." />
          <div className="grid gap-3 md:grid-cols-2">{OPS_GUIDE.map((o) => <div key={o.id} className="rounded-xl border border-line bg-white p-5"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{o.title}</h3><code className="rounded bg-midnight/5 px-1.5 py-0.5 text-[11px]">{o.perm}</code></div><ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate">{o.body.map((b) => <li key={b}>{b}</li>)}</ul><a href={o.to} className="mt-3 inline-block text-sm font-semibold text-teal">Open {o.to}</a></div>)}</div>
        </div>
      )}

      {tab === 'Changelog' && (
        <div>
          <WhatChanged r={r} />
          <SectionTitle icon={BookOpen} eyebrow="History" title="What changed" />
          <div className="space-y-3">{CHANGELOG.map((c) => <div key={c.id} className="rounded-xl border border-line bg-white p-5"><div className="flex flex-wrap items-center gap-2"><Badge tone={c.kind === 'Feature' ? 'teal' : c.kind === 'Fix' ? 'amber' : 'blue'}>{c.kind}</Badge><h3 className="font-semibold">{c.title}</h3><span className="ml-auto text-xs text-slate">{c.date}</span></div><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate">{c.items.map((i) => <li key={i}>{i}</li>)}</ul></div>)}</div>
        </div>
      )}

      {tab === 'Integrity' && <IntegrityPanel findings={findings} />}
    </div>
  )
}
