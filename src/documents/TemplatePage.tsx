import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { CSSProperties, ReactNode } from 'react'
import { tint } from '../tenant/store'
import { companyData, fillHtml, MERGE_KEY_RE, naira } from './templates'
import type { Block, DocTemplate, ResolvedIdentity } from './templates'

export const VAT_RATE = 0.075
const PX_W = 794 // 210mm at 96dpi
const MM = 96 / 25.4
const PAGE_H = 297 * MM

export const PAGE_CSS = `
.dp-doc{display:flex;flex-direction:column;gap:16px;width:210mm;text-align:left}
.dp-sheet{box-sizing:border-box;width:210mm;height:297mm;overflow:hidden;background:#fff;color:#14232a;font:13px/1.6 Inter,Arial,Helvetica,sans-serif;position:relative;display:flex;flex-direction:column;box-shadow:0 2px 10px rgba(20,35,42,.18)}
.dp-sheet *,.dp-measure *{box-sizing:border-box}
.dp-stripe{position:absolute;left:0;top:0;bottom:0;width:8px}
.dp-body{flex:1 1 auto;min-height:0;overflow:hidden;padding:0 18mm}
.dp-atom{display:flow-root}
.dp-measure{position:absolute;left:-10000px;top:0;width:210mm;visibility:hidden;pointer-events:none;font:13px/1.6 Inter,Arial,Helvetica,sans-serif;color:#14232a}
.dp-measure .dp-bodyw{padding:0 18mm}
.dp-rich p{margin:0 0 .65em}.dp-rich ul{list-style:disc;margin:0 0 .65em;padding-left:1.4em}.dp-rich ol{list-style:decimal;margin:0 0 .65em;padding-left:1.4em}.dp-rich li{margin:.1em 0}
.dp-rich h2,.dp-rich h3{font-weight:700;margin:.7em 0 .35em;font-size:1.05em}.dp-rich b,.dp-rich strong{font-weight:700}.dp-rich i,.dp-rich em{font-style:italic}.dp-rich u{text-decoration:underline}
.dp-h1{font-size:17px;font-weight:700;letter-spacing:.02em;margin:.5em 0 .6em}.dp-h2{font-size:13.5px;font-weight:700;margin:.9em 0 .3em;text-transform:uppercase;letter-spacing:.03em}
.dp-table{width:100%;table-layout:fixed;border-collapse:collapse;margin:0;font-size:12.5px}.dp-table tr{break-inside:avoid}.dp-table td,.dp-table th{overflow-wrap:anywhere}.dp-table th,.dp-table td{border:1px solid #d5dde0;padding:5px 8px;vertical-align:top;text-align:left}
.dp-table th{font-weight:700}.dp-table td.dp-r,.dp-table th.dp-r{text-align:right;white-space:nowrap}.dp-table td.dp-label{font-weight:600;width:34%;background:#f6f8f8}
.dp-totals{margin:0 0 0 auto;width:60%;font-size:12.5px;border-collapse:collapse}.dp-totals td{padding:4px 8px}.dp-totals td:last-child{text-align:right;white-space:nowrap}
.dp-sig{display:flex;gap:10mm;margin:1.6em 0 .8em;break-inside:avoid}.dp-sig>div{flex:1;min-width:0}.dp-sigline{border-top:1px solid #14232a;margin-top:12mm;padding-top:4px;font-size:12px}
.dp-hr{border:0;border-top:1px solid #d5dde0;margin:1em 0}
.dp-mf{background:#fff3bf;color:#7a5200;border-radius:3px;padding:0 3px;font-weight:600}
.dp-foot{font-size:10.5px;color:#60777d;text-align:center}
@page{size:A4;margin:0}
@media print{html,body{margin:0;background:#fff}.dp-doc{display:block;gap:0}.dp-sheet{box-shadow:none!important;height:296.8mm;break-after:page;page-break-after:always}.dp-sheet:last-child{break-after:auto;page-break-after:auto}.dp-measure{display:none!important}.dp-mf{background:transparent;color:inherit;padding:0}}
`

/** Replace merge fields in plain text. `data=null` shows highlighted placeholders. */
export function mergeNodes(text: string, data: Record<string, string> | null): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0, n = 0
  for (const m of text.matchAll(MERGE_KEY_RE)) {
    out.push(text.slice(last, m.index))
    const v = data?.[m[1]]
    out.push(data && v ? v : <mark key={n++} className="dp-mf">{data ? m[1] : `{{${m[1]}}}`}</mark>)
    last = (m.index ?? 0) + m[0].length
  }
  out.push(text.slice(last))
  return out
}

export const itemTotals = (rows: { qty: number; price: number }[], vat: boolean) => {
  const sub = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0)
  const tax = vat ? Math.round(sub * VAT_RATE * 100) / 100 : 0
  return { sub, tax, total: sub + tax }
}

function Head({ id, template, color, style }: { id: ResolvedIdentity; template: DocTemplate; color: string; style: string }) {
  const logo = id.logo
    ? <img src={id.logo} alt={`${id.name} logo`} style={{ maxHeight: 54, maxWidth: 170, objectFit: 'contain' }} />
    : <span style={{ display: 'inline-grid', placeItems: 'center', width: 46, height: 46, borderRadius: 8, background: color, color: '#fff', fontWeight: 700, fontSize: 18 }}>{id.initials}</span>
  const contacts = [id.address, [id.phone, id.email].filter(Boolean).join(' · '), id.website].filter(Boolean)
  void template
  if (style === 'minimal') {
    return (
      <header style={{ textAlign: 'center', padding: '12mm 18mm 4mm' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>{logo}</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6, letterSpacing: '.04em' }}>{id.name}</div>
        <div style={{ fontSize: 10.5, color: '#60777d', marginTop: 2 }}>{contacts.join('  |  ')}</div>
        <hr style={{ border: 0, borderTop: `1px solid ${color}`, margin: '10px 0 0' }} />
      </header>
    )
  }
  return (
    <header style={{ padding: style === 'classic' ? '0 18mm' : '12mm 18mm 0 22mm' }}>
      {style === 'classic' && <div style={{ height: 14, background: color, margin: '0 -18mm 8mm' }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: 10, borderBottom: `2px solid ${color}` }}>
        <div>{logo}</div>
        <div style={{ textAlign: 'right', fontSize: 10.5, color: '#44585e', lineHeight: 1.5, maxWidth: '62%' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#14232a' }}>{id.name}</div>
          {contacts.map((c) => <div key={c}>{c}</div>)}
          {id.rc && <div>RC {id.rc.replace(/^RC\s*/i, '')}</div>}
        </div>
      </div>
    </header>
  )
}

/* ---------- Pagination ---------- */
type Tbl = { id: number; b: Extract<Block, { type: 'table' | 'items' }> }
type Atom = {
  id: number; node?: ReactNode; tbl?: Tbl; kind: 'node' | 'thead' | 'row' | 'brk'
  ri?: number; keepNext?: boolean; pre?: number; post?: number
}

const widths = (t: Tbl): string[] => {
  const b = t.b
  if (b.type === 'items') return ['46%', '12%', '21%', '21%']
  const n = Math.max(1, b.cols.length)
  if (b.labelCol && n > 1) return ['34%', ...Array(n - 1).fill(`${66 / (n - 1)}%`)]
  return Array(n).fill(`${100 / n}%`)
}

function TableView({ t, rows, head, color, data, marks }: { t: Tbl; rows: number[]; head: boolean; color: string; data: Record<string, string> | null; marks?: { head: number; rows: Record<number, number> } }) {
  const m = (x: string) => mergeNodes(x, data), b = t.b
  const th = { background: tint(color, 0.88), color: '#14232a' }
  return (
    <table className="dp-table">
      <colgroup>{widths(t).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      {head && (b.type === 'items'
        ? <thead data-a={marks?.head}><tr>{['Description', 'Qty', 'Unit price (₦)', 'Amount (₦)'].map((h, i) => <th key={h} className={i ? 'dp-r' : ''} style={th}>{h}</th>)}</tr></thead>
        : <thead data-a={marks?.head}><tr>{b.cols.map((c, i) => <th key={i} style={th}>{m(c)}</th>)}</tr></thead>)}
      <tbody>
        {rows.map((ri) => b.type === 'items'
          ? <tr key={ri} data-a={marks?.rows[ri]}><td>{m(b.rows[ri].desc)}</td><td className="dp-r">{b.rows[ri].qty}</td><td className="dp-r">{naira(b.rows[ri].price).slice(1)}</td><td className="dp-r">{naira(b.rows[ri].qty * b.rows[ri].price).slice(1)}</td></tr>
          : <tr key={ri} data-a={marks?.rows[ri]}>{b.rows[ri].map((c, ci) => ci === 0 && b.labelCol ? <td key={ci} className="dp-label">{m(c)}</td> : <td key={ci}>{m(c)}</td>)}</tr>)}
      </tbody>
    </table>
  )
}

function richAtoms(html: string, data: Record<string, string> | null): string[] {
  const doc = new DOMParser().parseFromString(`<body>${fillHtml(html, data)}</body>`, 'text/html')
  const out: string[] = []
  let inline = ''
  const flush = () => { if (inline.trim()) out.push(`<p>${inline}</p>`); inline = '' }
  doc.body.childNodes.forEach((n) => {
    if (n.nodeType === 3) { inline += (n.textContent ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!); return }
    const el = n as Element, tag = el.tagName.toLowerCase()
    if (['p', 'h2', 'h3', 'div'].includes(tag)) { flush(); out.push(el.outerHTML) }
    else if (tag === 'ul' || tag === 'ol') {
      flush()
      const items = [...el.children]
      items.forEach((li, i) => out.push(`<${tag}${tag === 'ol' ? ` start="${i + 1}"` : ''}${i < items.length - 1 ? ' style="margin-bottom:0"' : ''}>${li.outerHTML}</${tag}>`))
    } else inline += el.outerHTML
  })
  flush()
  return out
}

function buildAtoms(blocks: Block[], data: Record<string, string> | null, color: string): Atom[] {
  const atoms: Atom[] = []
  let n = 0
  const push = (a: Omit<Atom, 'id'>) => atoms.push({ ...a, id: n++ })
  const m = (s: string) => mergeNodes(s, data)
  blocks.forEach((b) => {
    switch (b.type) {
      case 'pagebreak': push({ kind: 'brk' }); break
      case 'heading': push({ kind: 'node', keepNext: true, node: b.size === 'title' ? <h1 className="dp-h1" style={{ color }}>{m(b.text)}</h1> : <h2 className="dp-h2">{m(b.text)}</h2> }); break
      case 'divider': push({ kind: 'node', node: <hr className="dp-hr" /> }); break
      case 'rich': richAtoms(b.html, data).forEach((h) => push({ kind: 'node', node: <div className="dp-rich" dangerouslySetInnerHTML={{ __html: h }} /> })); break
      case 'signature': push({ kind: 'node', node: (
        <div className="dp-sig">
          {b.signers.map((sg, i) => <div key={i}><div className="dp-sigline"><b>{m(sg.label)}</b>{sg.name && <div>{m(sg.name)}</div>}{b.dateLine && <div style={{ marginTop: 6, color: '#60777d' }}>Date: ______________</div>}</div></div>)}
        </div>) }); break
      case 'table': case 'items': {
        const t: Tbl = { id: n, b }, isItems = b.type === 'items'
        const hasHead = isItems || b.header
        if (hasHead) push({ kind: 'thead', tbl: t, keepNext: true, pre: 5 })
        b.rows.forEach((_, ri) => push({ kind: 'row', tbl: t, ri, pre: !hasHead && ri === 0 ? 5 : 0, post: ri === b.rows.length - 1 ? (isItems ? 5 : 11) : 0, keepNext: isItems && ri === b.rows.length - 1 }))
        if (b.type === 'items') {
          const tt = itemTotals(b.rows, b.vat)
          push({ kind: 'node', post: 11, node: (
            <table className="dp-totals"><tbody>
              <tr><td>Subtotal</td><td>{naira(tt.sub)}</td></tr>
              {b.vat && <tr><td>VAT (7.5%)</td><td>{naira(tt.tax)}</td></tr>}
              <tr style={{ fontWeight: 700, fontSize: 14, color }}><td style={{ borderTop: `2px solid ${color}` }}>Total</td><td style={{ borderTop: `2px solid ${color}` }}>{naira(tt.total)}</td></tr>
            </tbody></table>) })
        }
        break
      }
    }
  })
  return atoms
}

type Metrics = { a: Record<number, number>; head1: number; head2: number; foot: number }

function paginate(atoms: Atom[], mt: Metrics, lh: boolean): number[][] {
  const SAFE = 8
  const padTop = (first: boolean) => (lh ? (first ? 10 : 8) : 18) * MM
  const cap = (first: boolean) => PAGE_H - (lh ? (first ? mt.head1 : mt.head2) : 0) - mt.foot - padTop(first) - 6 * MM - SAFE
  const h = (a: Atom) => (mt.a[a.id] ?? 0) + (a.pre ?? 0) + (a.post ?? 0) + 1
  const theadH = new Map<Tbl, number>()
  atoms.forEach((a) => { if (a.kind === 'thead') theadH.set(a.tbl!, h(a)) })
  const pages: number[][] = [[]]
  let used = 0
  const tids = new Set<Tbl>()
  const fresh = () => { pages.push([]); used = 0; tids.clear() }
  atoms.forEach((a, i) => {
    if (a.kind === 'brk') { if (pages[pages.length - 1].length) fresh(); return }
    const repeat = (x: Atom) => (x.kind === 'row' && x.tbl && theadH.has(x.tbl) && !tids.has(x.tbl) ? theadH.get(x.tbl)! : 0)
    let need = h(a) + repeat(a), j = i
    while (atoms[j].keepNext && j + 1 < atoms.length && atoms[j + 1].kind !== 'brk') { j++; need += h(atoms[j]) }
    const page = pages[pages.length - 1]
    if (page.length && used + need > cap(pages.length === 1)) fresh()
    const cur = pages[pages.length - 1]
    used += h(a) + repeat(a)
    if (a.tbl) tids.add(a.tbl)
    cur.push(i)
  })
  return pages
}

function SlimHead({ id, color }: { id: ResolvedIdentity; color: string }) {
  const logo = id.logo
    ? <img src={id.logo} alt="" style={{ maxHeight: 22, maxWidth: 90, objectFit: 'contain' }} />
    : <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 5, background: color, color: '#fff', fontWeight: 700, fontSize: 10 }}>{id.initials}</span>
  return (
    <header style={{ padding: '8mm 18mm 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 6, borderBottom: `1.5px solid ${color}`, fontSize: 10.5, color: '#44585e' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{logo}<b style={{ color: '#14232a' }}>{id.name}</b></span>
        <span>{id.website || id.email}</span>
      </div>
    </header>
  )
}

function Foot({ id, color, style, lh, no, total }: { id: ResolvedIdentity; color: string; style: string; lh: boolean; no: number; total: number }) {
  const num = <div style={{ textAlign: lh ? 'center' : 'right', marginTop: lh ? 1 : 0, visibility: !lh && total < 2 ? 'hidden' : 'visible' }}>Page {no} of {total}</div>
  if (!lh) return <footer className="dp-foot" style={{ padding: '0 18mm 6mm' }}>{num}</footer>
  const line = style === 'classic' ? { borderTop: `1px solid ${tint(color, 0.6)}` } : style === 'minimal' ? { borderTop: '1px solid #d5dde0' } : {}
  return <footer className="dp-foot" style={{ margin: '0 18mm', padding: '3mm 0 5mm', ...line }}><div>{id.footer || id.name}</div>{num}</footer>
}

/** A4 document (210 x 297mm sheets). Content flows onto extra pages; rows and blocks are never cut. */
export function A4Page({ template, identity, data, onReady }: { template: DocTemplate; identity: ResolvedIdentity; data: Record<string, string> | null; onReady?: () => void }) {
  const full = useMemo(() => (data ? { ...companyData(identity), ...data } : null), [data, identity])
  const style = template.style ?? identity.style
  const color = identity.color
  const lh = template.letterhead
  const atoms = useMemo(() => buildAtoms(template.blocks, full, color), [template.blocks, full, color])
  const mref = useRef<HTMLDivElement>(null)
  const [mt, setMt] = useState<Metrics | null>(null)
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  useLayoutEffect(() => {
    const root = mref.current
    if (!root) return
    const measure = () => {
      const a: Record<number, number> = {}
      root.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => { a[Number(el.dataset.a)] = el.offsetHeight })
      const q = (k: string) => root.querySelector<HTMLElement>(`[data-m="${k}"]`)?.offsetHeight ?? 0
      const next = { a, head1: q('head1'), head2: q('head2'), foot: q('foot') }
      setMt((prev) => (prev && prev.head1 === next.head1 && prev.head2 === next.head2 && prev.foot === next.foot && JSON.stringify(prev.a) === JSON.stringify(a) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [atoms, lh, style, identity])

  const pages = useMemo(() => (mt ? paginate(atoms, mt, lh) : null), [atoms, mt, lh])
  const total = pages?.length ?? 1
  useEffect(() => { if (pages) readyRef.current?.() }, [pages])

  const renderAtoms = (idx: number[], withMarks: boolean) => {
    const out: ReactNode[] = []
    for (let k = 0; k < idx.length; k++) {
      const a = atoms[idx[k]]
      if (!a.tbl) { out.push(<div key={a.id} className="dp-atom" data-a={withMarks ? a.id : undefined} style={a.post ? { paddingBottom: a.post } : undefined}>{a.node}</div>); continue }
      // group consecutive atoms of the same table
      const grp = [a]
      while (k + 1 < idx.length && atoms[idx[k + 1]].tbl === a.tbl) grp.push(atoms[idx[++k]])
      const head = grp[0].kind === 'thead' || (a.tbl.b.type === 'items' || a.tbl.b.header)
      const rows = grp.filter((x) => x.kind === 'row')
      const marks = withMarks ? { head: grp.find((x) => x.kind === 'thead')?.id ?? -1, rows: Object.fromEntries(rows.map((x) => [x.ri!, x.id])) } : undefined
      const first = grp[0], last = grp[grp.length - 1]
      out.push(
        <div key={a.id} className="dp-atom" style={{ paddingTop: first.kind === 'thead' || (first.kind === 'row' && first.pre) ? first.pre : 0, paddingBottom: last.post ?? 0 }}>
          <TableView t={a.tbl} rows={rows.map((x) => x.ri!)} head={head} color={color} data={full} marks={marks} />
        </div>,
      )
    }
    return out
  }
  const head1 = lh ? <Head id={identity} template={template} color={color} style={style} /> : null

  // measurement: every table once in full, each other atom in its own wrapper
  const measureBody = () => {
    const out: ReactNode[] = []
    const seen = new Set<Tbl>()
    atoms.forEach((a) => {
      if (a.kind === 'brk') return
      if (!a.tbl) { out.push(<div key={a.id} className="dp-atom" data-a={a.id}>{a.node}</div>); return }
      if (seen.has(a.tbl)) return
      seen.add(a.tbl)
      const mine = atoms.filter((x) => x.tbl === a.tbl)
      const marks = { head: mine.find((x) => x.kind === 'thead')?.id ?? -1, rows: Object.fromEntries(mine.filter((x) => x.kind === 'row').map((x) => [x.ri!, x.id])) }
      out.push(<TableView key={a.id} t={a.tbl} rows={mine.filter((x) => x.kind === 'row').map((x) => x.ri!)} head={mine.some((x) => x.kind === 'thead')} color={color} data={full} marks={marks} />)
    })
    return out
  }

  return (
    <div style={{ position: 'relative', width: '210mm' }}>
      <style>{PAGE_CSS}</style>
      <div className="dp-measure" aria-hidden="true" ref={mref}>
        <div data-m="head1" className="dp-atom">{head1}</div>
        <div data-m="head2" className="dp-atom">{lh && <SlimHead id={identity} color={color} />}</div>
        <div data-m="foot" className="dp-atom"><Foot id={identity} color={color} style={style} lh={lh} no={88} total={88} /></div>
        <div className="dp-bodyw">{measureBody()}</div>
      </div>
      <div className="dp-doc">
        {pages?.map((idx, pi) => (
          <section key={pi} className="dp-sheet" aria-label={`Page ${pi + 1} of ${total}`}>
            {lh && style === 'stripe' && <div className="dp-stripe" style={{ background: color }} />}
            {lh && (pi === 0 ? head1 : <SlimHead id={identity} color={color} />)}
            <div className="dp-body" style={{ paddingTop: `${(lh ? (pi === 0 ? 10 : 8) : 18)}mm`, paddingBottom: '6mm' }}>{renderAtoms(idx, false)}</div>
            <Foot id={identity} color={color} style={style} lh={lh} no={pi + 1} total={total} />
          </section>
        ))}
      </div>
    </div>
  )
}

/** Uploaded-file templates render as the file itself. */
export function UploadedPreview({ file }: { file: NonNullable<DocTemplate['upload']> }) {
  if (!file.url) return <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-slate"><div><b className="block text-ink">{file.name}</b>This file was too large to keep in the browser. Upload it again to preview it.</div></div>
  if (file.kind === 'image') return <img src={file.url} alt={file.name} className="mx-auto max-h-[70vh] w-full object-contain" />
  if (file.kind === 'pdf') return <iframe src={file.url} title={file.name} className="h-[70vh] w-full" />
  return <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-slate"><div><b className="block text-ink">{file.name}</b>A live preview is not available for Word files. Staff will receive this file as the template.</div></div>
}

/** Scales the fixed-size A4 page to the width of its container. */
export function ScaledPage({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ scale: 0.5, h: 600 })
  useEffect(() => {
    const el = outer.current, pg = inner.current
    if (!el || !pg) return
    const measure = () => { const scale = Math.min(1, el.clientWidth / PX_W); setFit({ scale, h: pg.offsetHeight * scale }) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el); ro.observe(pg)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={outer} className="w-full overflow-hidden" style={{ height: fit.h }}>
      <div ref={inner} style={{ width: PX_W, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}

/** Print / save as PDF: every A4 page goes through an isolated print document. */
export async function printPage(template: DocTemplate, identity: ResolvedIdentity, data: Record<string, string> | null) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:210mm'
  document.body.appendChild(host)
  const root = createRoot(host)
  await new Promise<void>((res) => { root.render(<A4Page template={template} identity={identity} data={data} onReady={res} />) })
  try { await document.fonts?.ready } catch { /* ignore */ }
  await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = () => r(null) }))))
  await new Promise((r) => setTimeout(r, 200)) // let a font/image driven re-measure settle
  host.querySelectorAll('.dp-measure').forEach((n) => n.remove())
  const body = host.innerHTML
  root.unmount(); host.remove()
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${template.name.replace(/[<&]/g, '')}</title><style>body{margin:0}</style></head><body>${body}</body></html>`
  frame.onload = () => {
    const w = frame.contentWindow
    if (!w) return
    w.focus(); w.print()
    setTimeout(() => frame.remove(), 60000)
  }
  document.body.appendChild(frame)
}
