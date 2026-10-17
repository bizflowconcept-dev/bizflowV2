import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileText } from 'lucide-react'
import { Btn, LogoMark, Overlay } from '../../components/ui'
import { buildGraph, fmtNaira, moduleName, planName } from '../../platform/registry'
import type { Registry } from '../../platform/registry'
import { ADDON_DOCS, AUDIENCE_DOCS, ARCHITECTURE, COMPANY_PERMISSION_DOCS, DOCS_VERSION, FLOW_DOCS, MODULE_DOCS, PLAN_DOCS } from '../../platform/docsContent'

const SECTIONS = [['overview', 'Architecture overview'], ['plans', 'Plans and module matrix'], ['deps', 'Dependencies'], ['roles', 'Roles and permissions'], ['flows', 'Processes and flows']] as const
type Sec = (typeof SECTIONS)[number][0]

const H = ({ n, children }: { n?: string; children: React.ReactNode }) => <h2 className="mb-3 mt-0 border-b-2 border-teal pb-1.5 font-display text-[17pt] font-semibold text-midnight">{n && <span className="mr-2 text-teal">{n}</span>}{children}</h2>

export default function DocsPdf({ r, optional }: { r: Registry; optional: Record<string, string[]> }) {
  const [open, setOpen] = useState(false)
  const [mods, setMods] = useState<string[]>(() => r.modules.map((m) => m.id))
  const [adds, setAdds] = useState<string[]>(() => r.addons.map((a) => a.id))
  const [secs, setSecs] = useState<Sec[]>(SECTIONS.map((s) => s[0]))
  const [printing, setPrinting] = useState(false)
  const graph = useMemo(() => buildGraph(r, optional), [r, optional])
  const tog = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v])
  const chosen = r.modules.filter((m) => mods.includes(m.id))
  const chosenAdds = r.addons.filter((a) => adds.includes(a.id))
  const missing = chosen.flatMap((m) => m.requires.filter((d) => !mods.includes(d)).map((d) => `${m.name} requires ${moduleName(r, d)}`))
  const pages = 1 + secs.length + chosen.length * 0.6 + chosenAdds.length * 0.15
  const today = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => {
    if (!printing) return
    document.body.classList.add('printing-docs')
    const done = () => { document.body.classList.remove('printing-docs'); setPrinting(false) }
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 250)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-docs') }
  }, [printing])

  const Group = ({ title, ids, all, set }: { title: string; ids: { id: string; name: string }[]; all: string[]; set: (v: string[]) => void }) => (
    <div>
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{title} <span className="font-normal text-slate">({all.length}/{ids.length})</span></h3><div className="flex gap-3 text-xs font-semibold text-teal"><button type="button" onClick={() => set(ids.map((i) => i.id))}>Select all</button><button type="button" onClick={() => set([])}>Clear</button></div></div>
      <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">{ids.map((i) => <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-cloud"><input type="checkbox" className="accent-teal" checked={all.includes(i.id)} onChange={() => set(tog(all, i.id))} />{i.name}</label>)}</div>
    </div>
  )

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-mint px-4 py-2.5 text-sm font-semibold text-midnight transition hover:brightness-95"><Download size={16} />Download PDF</button>
      <Overlay open={open} onClose={() => setOpen(false)} title="Download handbook as PDF" wide>
        <div className="space-y-5">
          <p className="text-sm text-slate">Choose what goes into the document. It is laid out on A4 paper and runs to as many pages as the content needs.</p>
          <Group title="Modules" ids={r.modules} all={mods} set={setMods} />
          <Group title="Add-ons" ids={r.addons} all={adds} set={setAdds} />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Sections</h3>
            <div className="flex flex-wrap gap-2">{SECTIONS.map(([k, n]) => <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${secs.includes(k) ? 'border-teal bg-softmint text-teal' : 'border-line text-slate'}`}><input type="checkbox" className="sr-only" checked={secs.includes(k)} onChange={() => setSecs(tog(secs, k))} />{n}</label>)}</div>
          </div>
          {missing.length > 0 && <div className="rounded-lg border border-warn/40 bg-amber-50 p-3 text-xs text-amber-900"><b>Heads up:</b> some selected modules need modules you left out. <button type="button" className="font-semibold underline" onClick={() => setMods([...new Set([...mods, ...chosen.flatMap((m) => m.requires)])])}>Add the required modules</button></div>}
          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="text-xs text-slate">About {Math.max(2, Math.round(pages))} A4 pages · choose “Save as PDF” in the print dialog.</span>
            <Btn onClick={() => { setOpen(false); setPrinting(true) }} disabled={!chosen.length && !chosenAdds.length && !secs.length}><FileText size={15} />Generate PDF</Btn>
          </div>
        </div>
      </Overlay>
      {printing && createPortal(
        <div className="pdf-root font-sans text-[10pt] leading-relaxed text-ink">
          <table className="pdf-frame"><thead><tr><td /></tr></thead><tfoot><tr><td /></tr></tfoot><tbody><tr><td>
          <section className="pdf-cover relative flex min-h-[255mm] flex-col justify-between overflow-hidden rounded-xl bg-midnight p-12 text-white" style={{ background: 'linear-gradient(160deg,#123340,#0b2530 60%,#05131a)' }}>
            <div className="flex items-center gap-3"><LogoMark size={44} /><span className="font-display text-[22pt] font-semibold">BizFlow</span></div>
            <div>
              <div className="text-[10pt] font-semibold uppercase tracking-[0.25em] text-mint">Platform handbook</div>
              <h1 className="mt-4 font-display text-[38pt] font-semibold leading-[1.05]">Modules, plans <br />and how they connect.</h1>
              <div className="mt-6 h-1 w-24 rounded bg-mint" />
              <p className="mt-6 max-w-md text-[11pt] text-white/70">{chosen.length} modules · {chosenAdds.length} add-ons · {r.plans.length} plans, generated from the live BizFlow catalog.</p>
            </div>
            <div className="flex items-end justify-between text-[9pt] text-white/60"><span>BizFlow Technologies Ltd · Version {DOCS_VERSION}</span><span>{today}</span></div>
          </section>

          <section>
            <H>Contents</H>
            <ol className="space-y-1.5 text-[11pt]">
              {SECTIONS.filter(([k]) => secs.includes(k)).map(([k, n], i) => <li key={k} className="flex border-b border-dotted border-line pb-1"><span className="w-8 text-teal">{i + 1}.</span>{n}</li>)}
              {chosen.length > 0 && <li className="flex border-b border-dotted border-line pb-1"><span className="w-8 text-teal">{secs.length + 1}.</span>Module reference ({chosen.length})</li>}
              {chosenAdds.length > 0 && <li className="flex border-b border-dotted border-line pb-1"><span className="w-8 text-teal">{secs.length + 2}.</span>Add-ons ({chosenAdds.length})</li>}
            </ol>
            {chosen.length > 0 && <div className="mt-5 grid grid-cols-2 gap-x-8 text-[9.5pt] text-slate">{chosen.map((m) => <div key={m.id} className="border-b border-line/60 py-0.5">{m.name} <span className="float-right">{m.groupName}</span></div>)}</div>}
          </section>

          {secs.includes('overview') && (
            <section className="pdf-page-break">
              <H>Architecture overview</H>
              <div className="grid grid-cols-2 gap-3">{ARCHITECTURE.map((a, i) => <div key={a.title} className="pdf-avoid rounded-lg border border-line p-3"><div className="text-[9pt] font-semibold text-teal">{String(i + 1).padStart(2, '0')}</div><b>{a.title}</b><p className="mt-1 text-[9.5pt] text-slate">{a.body}</p></div>)}</div>
              <h3 className="mb-2 mt-6 font-display text-[13pt] font-semibold">Audiences</h3>
              {r.audiences.map((a) => <p key={a} className="pdf-avoid mb-2 text-[9.5pt]"><b>{AUDIENCE_DOCS[a]?.name}.</b> {AUDIENCE_DOCS[a]?.who} {AUDIENCE_DOCS[a]?.can}</p>)}
            </section>
          )}

          {secs.includes('plans') && (
            <section className="pdf-page-break">
              <H>Plans and module matrix</H>
              <div className="grid grid-cols-2 gap-3">{r.plans.map((p) => <div key={p.id} className="pdf-avoid rounded-lg border border-line p-3"><b className="font-display text-[12pt]">{p.name}</b> <span className="text-[9pt] text-slate">{p.custom ? 'Custom quote' : `${fmtNaira(p.prices.NGN?.monthly)} / month`}</span><p className="mt-1 text-[9.5pt] text-slate">{PLAN_DOCS[p.id]?.audience}</p></div>)}</div>
              <table className="mt-5 w-full border-collapse text-[9pt]"><thead><tr className="bg-midnight text-left text-white"><th className="px-2 py-1.5">Module</th>{r.plans.map((p) => <th key={p.id} className="px-2 py-1.5 text-center">{p.name}</th>)}</tr></thead>
                <tbody>{chosen.map((m, i) => <tr key={m.id} className={`pdf-avoid ${i % 2 ? 'bg-cloud' : ''}`}><td className="px-2 py-1 font-medium">{m.name}</td>{r.plans.map((p) => { const c = m.plans[p.id]; return <td key={p.id} className="px-2 py-1 text-center">{c?.state === 'included' ? (c.partial ? 'Partial' : '●') : c?.state === 'addon' ? 'Add-on' : '–'}</td> })}</tr>)}</tbody></table>
            </section>
          )}

          {secs.includes('deps') && (
            <section className="pdf-page-break">
              <H>Dependencies</H>
              <p className="mb-3 text-[9.5pt] text-slate">A module can only be enabled when everything it requires is also enabled.</p>
              <table className="w-full border-collapse text-[9pt]"><thead><tr className="bg-midnight text-left text-white"><th className="px-2 py-1.5">Module</th><th className="px-2 py-1.5">Requires</th><th className="px-2 py-1.5">Better with</th></tr></thead>
                <tbody>{chosen.map((m, i) => <tr key={m.id} className={`pdf-avoid align-top ${i % 2 ? 'bg-cloud' : ''}`}><td className="px-2 py-1 font-medium">{m.name} <span className="text-slate">· level {graph.nodes.find((n) => n.id === m.id)?.layer}</span></td><td className="px-2 py-1">{m.requires.map((d) => moduleName(r, d)).join(', ') || 'None'}</td><td className="px-2 py-1 text-slate">{(optional[m.id] ?? []).map((d) => moduleName(r, d)).join(', ') || 'None'}</td></tr>)}</tbody></table>
            </section>
          )}

          {secs.includes('roles') && (
            <section className="pdf-page-break">
              <H>Roles and permissions</H>
              {r.companyRoles.map((role) => <div key={role.key} className="pdf-avoid mb-3"><b>{role.title}</b> <span className="text-[9pt] text-slate">{role.scope}</span><div className="mt-1 flex flex-wrap gap-1">{role.permissions.map((p) => <span key={p} title={COMPANY_PERMISSION_DOCS[p]} className="rounded bg-softmint px-1.5 py-0.5 font-mono text-[8pt] text-teal">{p}</span>)}</div></div>)}
            </section>
          )}

          {secs.includes('flows') && (
            <section className="pdf-page-break">
              <H>Processes and flows</H>
              {FLOW_DOCS.map((f) => <div key={f.id} className="mb-5"><div className="pdf-avoid"><h3 className="font-display text-[13pt] font-semibold">{f.title}</h3><p className="text-[9.5pt] text-slate">{f.summary}</p></div><ol className="mt-2 space-y-1.5 border-l-2 border-softmint pl-4">{f.steps.map((s, i) => <li key={s.title} className="pdf-avoid text-[9.5pt]"><b>{i + 1}. {s.title}</b>{s.actor && <span className="text-slate"> ({s.actor})</span>}. {s.detail}</li>)}</ol></div>)}
            </section>
          )}

          {chosen.length > 0 && (
            <section className="pdf-page-break">
              <H>Module reference</H>
              {chosen.map((m) => { const d = MODULE_DOCS[m.id]; return (
                <article key={m.id} className="pdf-avoid mb-4 rounded-lg border border-line p-4">
                  <div className="flex items-baseline justify-between"><h3 className="font-display text-[14pt] font-semibold text-midnight">{m.name}</h3><span className="text-[8.5pt] font-semibold uppercase tracking-wider text-teal">{m.groupName}{m.minPlan ? ` · from ${planName(r, m.minPlan)}` : ''}</span></div>
                  <p className="mt-1 text-[9.5pt]">{d?.what}</p>
                  {d?.useCases && <ul className="mt-1 list-disc pl-5 text-[9pt] text-slate">{d.useCases.map((u) => <li key={u}>{u}</li>)}</ul>}
                  <div className="mt-2 grid grid-cols-2 gap-3 text-[9pt]"><div><b>Requires:</b> {m.requires.map((x) => moduleName(r, x)).join(', ') || 'None'}</div><div><b>Needed by:</b> {m.requiredBy.map((x) => moduleName(r, x)).join(', ') || 'None'}</div></div>
                  {m.features.length > 0 && <div className="mt-1.5 text-[9pt]"><b>Features:</b> <span className="text-slate">{m.features.map((f) => f.name).join(' · ')}</span></div>}
                  {m.fromNGN !== undefined && <div className="mt-1 text-[9pt]"><b>From:</b> {fmtNaira(m.fromNGN)} / month</div>}
                  {d?.limits && <div className="mt-2 rounded bg-amber-50 p-2 text-[8.5pt] text-amber-900"><b>Known limits:</b> {d.limits.join(' ')}</div>}
                </article>
              ) })}
            </section>
          )}

          {chosenAdds.length > 0 && (
            <section className="pdf-page-break">
              <H>Add-ons</H>
              <div className="grid grid-cols-2 gap-3">{chosenAdds.map((a) => <div key={a.id} className="pdf-avoid rounded-lg border border-line p-3"><b>{a.name}</b> <span className="text-[9pt] text-slate">{a.category}{a.monthlyNGN !== undefined ? ` · ${fmtNaira(a.monthlyNGN)} / month` : ''}</span><p className="mt-1 text-[9pt] text-slate">{ADDON_DOCS[a.id]?.when}</p><div className="mt-1 text-[8.5pt] text-teal">{a.modules.map((id) => moduleName(r, id)).join(' · ')}</div></div>)}</div>
            </section>
          )}
          <footer className="mt-8 border-t border-line pt-2 text-center text-[8pt] text-slate">BizFlow Technologies Ltd · Platform handbook v{DOCS_VERSION} · {today} · Confidential: for BizFlow staff</footer>
          </td></tr></tbody></table>
        </div>,
        document.body,
      )}
    </>
  )
}
