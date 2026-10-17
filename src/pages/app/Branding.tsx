import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Download, ImageUp, Monitor, Moon, PanelLeft, PanelLeftClose, RefreshCcw, Sparkles, Sun, Trash2, TriangleAlert } from 'lucide-react'
import { Badge, Btn, EmptyState, Overlay, PageHeader, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { DEFAULT_BRAND, MIN_CONTRAST, SIDEBAR_PRESETS, SUGGESTED, nearestAccessible, brandStyle, contrast, hexToHsl, hexToRgb, host, isDark, isHex, mix, normHex, onColor, rgbToHex, saveBrand, shade, tint, useSystemDark, useTenant } from '../../tenant/store'
import type { Brand, Theme } from '../../tenant/store'
import { LoginSlides, loginSlidesOf, Section, SettingsNav, TenantMark } from '../../tenant/ui'

const hslToHex = (h: number, s: number, l: number) => {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return rgbToHex(255 * f(0), 255 * f(8), 255 * f(4))
}
const num = 'h-10 w-full rounded-md border border-line bg-white px-2 text-center text-sm num focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'

type ExtractedPalette = { primary: string; secondary: string; accent: string }

const colorDistance = (a: string, b: string) => {
  const x = hexToRgb(a), y = hexToRgb(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

function extractLogoPalette(src: string): Promise<ExtractedPalette | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return resolve(null)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const bins = new Map<string, { count: number; r: number; g: number; b: number }>()
      for (let index = 0; index < pixels.length; index += 16) {
        const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2], alpha = pixels[index + 3]
        if (alpha < 160 || (r > 242 && g > 242 && b > 242) || (r < 14 && g < 14 && b < 14)) continue
        const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`
        const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
        bin.count += 1; bin.r += r; bin.g += g; bin.b += b
        bins.set(key, bin)
      }
      const colors = [...bins.values()].sort((a, b) => b.count - a.count).slice(0, 18).map((bin) => {
        const hex = rgbToHex(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count)
        const [, saturation, lightness] = hexToHsl(hex)
        return { hex, count: bin.count, saturation, lightness }
      })
      if (!colors.length) return resolve(null)
      const primary = [...colors].sort((a, b) => (b.count * (0.5 + b.saturation / 100)) - (a.count * (0.5 + a.saturation / 100)))[0].hex
      const distinct = colors.filter((color) => colorDistance(color.hex, primary) > 55)
      const secondary = [...distinct].sort((a, b) => a.lightness - b.lightness)[0]?.hex ?? shade(primary, 0.55)
      const accent = [...distinct].filter((color) => colorDistance(color.hex, secondary) > 45).sort((a, b) => (b.saturation - a.saturation) || (b.lightness - a.lightness))[0]?.hex ?? tint(primary, 0.3)
      resolve({ primary, secondary, accent })
    }
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/* ---------- controls ---------- */
function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { v: T; n: string; icon?: ReactNode }[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold" id={`seg-${label}`}>{label}</div>
      <div role="radiogroup" aria-labelledby={`seg-${label}`} className="inline-flex w-full flex-wrap gap-1 rounded-lg border border-line bg-cloud p-1">
        {options.map((o) => (
          <button key={o.v} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={`flex min-w-[96px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold transition-colors ${value === o.v ? 'bg-white text-teal shadow-sm ring-1 ring-teal/30' : 'text-slate hover:text-ink'}`}>
            {o.icon}{o.n}
          </button>
        ))}
      </div>
    </div>
  )
}

function ColorField({ label, use, value, onChange }: { label: string; use: string; value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<'HEX' | 'RGB' | 'HSL'>('HEX')
  const [txt, setTxt] = useState(value)
  useEffect(() => setTxt(value), [value])
  const rgb = hexToRgb(value), hsl = hexToHsl(value)
  const cr = contrast(value, '#FFFFFF')
  const commitHex = () => {
    const next = normHex(txt)
    if (isHex(next)) {
      onChange(next)
      setTxt(next)
    } else {
      setTxt(value)
    }
  }
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-sm font-semibold">{label}</div><p className="mt-0.5 max-w-[34ch] text-xs text-slate">{use}</p></div>
        <label className="relative block size-11 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line" style={{ background: value }}>
          <span className="sr-only">{label} colour picker</span>
          <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(normHex(e.target.value))} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div role="tablist" aria-label={`${label} format`} className="flex shrink-0 rounded-md border border-line bg-cloud p-0.5 text-[11px] font-semibold">
          {(['HEX', 'RGB', 'HSL'] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`cursor-pointer rounded px-2 py-1 ${mode === m ? 'bg-white text-teal shadow-sm' : 'text-slate'}`}>{m}</button>)}
        </div>
        {mode === 'HEX' && <input aria-label={`${label} hex`} value={txt} spellCheck={false} maxLength={7} onChange={(e) => setTxt(e.target.value.toUpperCase())} onBlur={commitHex} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitHex(); e.currentTarget.blur() } if (e.key === 'Escape') { setTxt(value); e.currentTarget.blur() } }} className="h-10 min-w-0 flex-1 rounded-md border border-line bg-white px-3 font-mono text-sm uppercase focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20" />}
        {mode === 'RGB' && <div className="grid flex-1 grid-cols-3 gap-1.5">{(['R', 'G', 'B'] as const).map((c, i) => <input key={c} aria-label={`${label} ${c}`} type="number" min={0} max={255} value={rgb[i]} onChange={(e) => { const n = [...rgb] as [number, number, number]; n[i] = Math.min(255, Math.max(0, +e.target.value || 0)); onChange(rgbToHex(...n)) }} className={num} />)}</div>}
        {mode === 'HSL' && <div className="grid flex-1 grid-cols-3 gap-1.5">{(['H', 'S', 'L'] as const).map((c, i) => <input key={c} aria-label={`${label} ${c}`} type="number" min={0} max={i ? 100 : 360} value={hsl[i]} onChange={(e) => { const n = [...hsl] as [number, number, number]; n[i] = Math.min(i ? 100 : 360, Math.max(0, +e.target.value || 0)); onChange(hslToHex(...n)) }} className={num} />)}</div>}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
        <span className="num">rgb({rgb.join(', ')})</span><span className="num">hsl({hsl[0]}, {hsl[1]}%, {hsl[2]}%)</span>
        {label === 'Primary color' && (cr >= 4.5 ? <span className="inline-flex items-center gap-1 font-semibold text-ok"><Check size={13} />White text {cr.toFixed(1)}:1 · AA</span> : <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><TriangleAlert size={13} />Low contrast with white text ({cr.toFixed(1)}:1)</span>)}
      </div>
    </div>
  )
}

function LogoSlot({ title, spec, value, onChange, bg, square, cover = false }: { title: string; spec: string; value: string | null; onChange: (v: string | null) => void; bg: string; square?: boolean; cover?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const pick = (f?: File) => {
    if (!f) return
    const limit = square ? 256 * 1024 : 1024 * 1024
    if (!/^image\/(png|jpeg|svg\+xml|webp|x-icon|vnd\.microsoft\.icon)$/.test(f.type)) return setErr('Unsupported format. Use PNG, SVG, JPG or WebP.')
    if (f.size > limit) return setErr(`File is too large. Maximum ${limit / 1024 >= 1024 ? '1 MB' : '256 KB'}.`)
    setErr('')
    const rd = new FileReader()
    rd.onload = () => onChange(String(rd.result))
    rd.readAsDataURL(f)
  }
  return (
    <div className="flex gap-4 rounded-lg border border-line p-4">
      <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line ${square ? 'size-20' : 'h-20 w-36'}`} style={{ background: bg }}>
        {value ? <img src={value} alt={`${title} preview`} className={cover ? 'size-full object-cover' : 'max-h-full max-w-full object-contain p-2'} /> : <ImageUp size={20} className="text-slate/60" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-xs text-slate">{spec}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Btn s="sm" v="secondary" onClick={() => ref.current?.click()}><ImageUp size={14} />{value ? 'Replace image' : 'Upload image'}</Btn>
          {value && <Btn s="sm" v="ghost" onClick={() => { onChange(null); if (ref.current) ref.current.value = '' }}><Trash2 size={14} />Remove</Btn>}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} aria-label={`Upload ${title}`} />
        {err && <p role="alert" className="mt-2 text-xs font-medium text-err">{err}</p>}
      </div>
    </div>
  )
}

const MAX_SLIDES = 6
const downscale = (file: File, max = 1920): Promise<string> => new Promise((resolve, reject) => {
  const rd = new FileReader()
  rd.onerror = () => reject(new Error('read'))
  rd.onload = () => {
    const data = String(rd.result)
    if (file.type === 'image/svg+xml') return resolve(data)
    const img = new Image()
    img.onerror = () => reject(new Error('decode'))
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/webp' : 'image/jpeg', 0.86))
    }
    img.src = data
  }
  rd.readAsDataURL(file)
})

function SlidesEditor({ slides, seconds, onChange }: { slides: string[]; seconds: number; onChange: (slides: string[], seconds: number) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setErr('')
    const next = [...slides]
    for (const f of Array.from(files)) {
      if (next.length >= MAX_SLIDES) { setErr(`You can add up to ${MAX_SLIDES} images.`); break }
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) { setErr('Unsupported format. Use JPG, PNG, WebP or SVG.'); continue }
      if (f.size > 8 * 1024 * 1024) { setErr('An image is larger than 8 MB.'); continue }
      try { next.push(await downscale(f)) } catch { setErr('One image could not be read.') }
    }
    onChange(next, seconds)
  }
  const move = (i: number, d: number) => { const n = [...slides]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n, seconds) }
  return (
    <div className="space-y-4">
      {slides.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {slides.map((src, i) => (
            <li key={i} className="overflow-hidden rounded-lg border border-line">
              <div className="relative aspect-video bg-cloud"><img src={src} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-xl" /><img src={src} alt={`Slide ${i + 1}`} className="relative size-full object-contain" /></div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="text-xs font-semibold text-slate">Image {i + 1}</span>
                <span className="flex gap-0.5">
                  <Btn s="sm" v="ghost" className="!px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move image ${i + 1} earlier`}>←</Btn>
                  <Btn s="sm" v="ghost" className="!px-2" disabled={i === slides.length - 1} onClick={() => move(i, 1)} aria-label={`Move image ${i + 1} later`}>→</Btn>
                  <Btn s="sm" v="ghost" className="!px-2" onClick={() => onChange(slides.filter((_, k) => k !== i), seconds)} aria-label={`Remove image ${i + 1}`}><Trash2 size={14} /></Btn>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Btn s="sm" v="secondary" disabled={slides.length >= MAX_SLIDES} onClick={() => ref.current?.click()}><ImageUp size={14} />{slides.length ? 'Add images' : 'Upload images'}</Btn>
        {slides.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-slate">Change every
            <select value={seconds} onChange={(e) => onChange(slides, Number(e.target.value))} className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink">{[4, 6, 8, 12].map((x) => <option key={x} value={x}>{x} seconds</option>)}</select>
          </label>
        )}
        <span className="text-xs text-slate">{slides.length}/{MAX_SLIDES} · JPG, PNG, WebP or SVG · any size or ratio</span>
      </div>
      <input ref={ref} type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden aria-label="Upload login images" onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
      {err && <p role="alert" className="text-xs font-medium text-err">{err}</p>}
    </div>
  )
}

/* ---------- sidebar colours ---------- */
function SidebarColors({ draft, up }: { draft: Brand; up: (p: Partial<Brand>) => void }) {
  const solid = draft.sidebarBackground === 'solid'
  const bg = draft.sidebarColor || draft.secondary
  const auto = onColor(bg)
  const text = draft.sidebarText && isHex(draft.sidebarText) ? draft.sidebarText : auto
  const ratio = contrast(text, bg), pass = ratio >= MIN_CONTRAST
  const resolve = (v: string) => (v === '@primary' ? draft.primary : v)
  const apply = (pr: (typeof SIDEBAR_PRESETS)[number]) => {
    if (!pr.bg) return up({ sidebarBackground: 'gradient', sidebarColor: DEFAULT_BRAND.sidebarColor, sidebarText: '', sidebarActive: '' })
    const b = resolve(pr.bg)
    up({ sidebarBackground: 'solid', sidebarColor: b, sidebarText: pr.text && contrast(pr.text, b) >= MIN_CONTRAST ? pr.text : '', sidebarActive: pr.active })
  }
  const current = !solid ? 'midnight' : SIDEBAR_PRESETS.find((pr) => pr.bg && resolve(pr.bg) === draft.sidebarColor && pr.text === (draft.sidebarText || '') && pr.active === (draft.sidebarActive || ''))?.id
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[13px] font-semibold" id="sb-presets">Sidebar colour presets</div>
        <div role="group" aria-labelledby="sb-presets" className="flex flex-wrap gap-2">
          {SIDEBAR_PRESETS.map((pr) => {
            const b = pr.bg ? resolve(pr.bg) : DEFAULT_BRAND.secondary
            return <button key={pr.id} onClick={() => apply(pr)} aria-pressed={current === pr.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${current === pr.id ? 'border-teal bg-softmint text-teal' : 'border-line hover:border-slate'}`}><i className="size-4 rounded-full ring-1 ring-line" style={{ background: b }} />{pr.name}</button>
          })}
        </div>
      </div>
      {solid && <>
        <ColorField label="Sidebar background" use="Solid colour behind desktop and mobile navigation. This does not change your secondary brand colour." value={bg} onChange={(v) => up({ sidebarColor: v })} />
        <ColorField label="Sidebar text" use="Menu labels, icons, section headings and the workspace name. Muted variants are derived from it." value={text} onChange={(v) => up({ sidebarText: v })} />
        <ColorField label="Active item highlight (optional)" use="Background of the current page in the sidebar. Leave on automatic for a subtle tint of the text colour." value={draft.sidebarActive || mix(bg, text, 0.13)} onChange={(v) => up({ sidebarActive: v })} />
        <div className={`rounded-lg border p-3 ${pass ? 'border-ok/30 bg-green-50' : 'border-amber-300 bg-amber-50'}`} role="status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={pass ? 'green' : 'amber'}>{pass ? 'Pass' : 'Fail'} · {ratio.toFixed(2)}:1</Badge>
            <span className="text-xs text-slate">WCAG AA needs {MIN_CONTRAST}:1 for navigation text.{!draft.sidebarText && ' Text colour is automatic.'}</span>
          </div>
          {!pass && <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-800"><TriangleAlert size={14} className="mt-px shrink-0" />This text colour is hard to read on the chosen background. Choose a different colour or use the suggestion below. Saving is disabled until it passes.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn s="sm" v="secondary" onClick={() => up({ sidebarText: nearestAccessible(draft.sidebarText || auto, bg) })} disabled={pass && !!draft.sidebarText}><Sparkles size={14} />Auto text colour</Btn>
            {!pass && <Btn s="sm" v="secondary" onClick={() => up({ sidebarText: nearestAccessible(text, bg) })}>Use nearest accessible ({nearestAccessible(text, bg)})</Btn>}
            <Btn s="sm" v="ghost" onClick={() => up({ sidebarBackground: 'gradient', sidebarColor: DEFAULT_BRAND.sidebarColor, sidebarText: '', sidebarActive: '' })}><RefreshCcw size={14} />Reset sidebar to default</Btn>
          </div>
        </div>
      </>}
    </div>
  )
}

/* ---------- live preview ---------- */
type PTab = 'Dashboard' | 'Sign-in' | 'Onboarding'
export function BrandPreview({ brand, name, slug, sys }: { brand: Brand; name: string; slug: string; sys: boolean }) {
  const [tab, setTab] = useState<PTab>('Dashboard')
  const dark = isDark(brand, sys)
  const t = { brand, profile: { name } }
  const compactNav = brand.nav === 'compact'
  const std = brand.layout === 'standard'
  const slides = loginSlidesOf(brand)
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div role="tablist" aria-label="Preview screen" className="flex gap-1">
          {(['Dashboard', 'Sign-in', 'Onboarding'] as PTab[]).map((p) => <button key={p} role="tab" aria-selected={tab === p} onClick={() => setTab(p)} className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold ${tab === p ? 'bg-softmint text-teal' : 'text-slate hover:text-ink'}`}>{p}</button>)}
        </div>
        <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-slate sm:flex"><span className="size-1.5 animate-pulse rounded-full bg-ok" />Live</span>
      </div>
      <div className={`${dark ? 'bf-dark' : 'bf-light'} bg-cloud p-3 text-ink`} style={brandStyle(brand, dark)}>
        <div className="overflow-hidden rounded-lg border border-line bg-cloud shadow-sm" aria-label="Brand preview">
          <div className="flex items-center gap-1.5 border-b border-line bg-white px-3 py-1.5"><i className="size-2 rounded-full bg-line" /><i className="size-2 rounded-full bg-line" /><i className="size-2 rounded-full bg-line" /><span className="ml-2 min-w-0 truncate rounded bg-cloud px-2 py-0.5 font-mono text-[10px] text-slate">{host(slug)}{tab === 'Sign-in' ? '/login' : tab === 'Onboarding' ? '/onboarding/k3x9qa' : '/admin/business'}</span></div>

          {tab === 'Dashboard' && (
            <div className="flex min-h-[340px]">
              <div className={`dashboard-nav on-dark shrink-0 bg-midnight py-3 text-white ${brand.sidebarBackground === 'solid' ? 'sidebar-solid' : ''} ${compactNav ? 'w-12 px-1.5' : 'w-32 px-2'}`}>
                <div className={`mb-3 flex items-center gap-1.5 ${compactNav ? 'justify-center' : ''}`}><TenantMark t={t} size={24} tone="nav" />{!compactNav && <span className="truncate text-[10px] font-semibold leading-tight">{name}</span>}</div>
                {['Dashboard', 'Employees', 'Payroll', 'Leave', 'Reports'].map((n, i) => <div key={n} className={`mb-0.5 flex items-center gap-1.5 rounded px-1.5 py-1.5 text-[10px] font-medium ${i === 0 ? 'bg-white/15 text-white' : 'text-white/60'} ${compactNav ? 'justify-center' : ''}`}><i className="size-2.5 shrink-0 rounded-sm bg-current opacity-80" />{!compactNav && n}</div>)}
                {!compactNav && <div className="mt-4 px-1.5 text-[8px] text-white/35">Powered by BizFlow</div>}
              </div>
              <div className="min-w-0 flex-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0"><div className="truncate text-[12px] font-semibold">Welcome back, Admin</div><div className="truncate text-[9px] text-slate">{name} · {host(slug)}</div></div>
                  <span className="relative"><span className="block size-5 rounded-full bg-line" /><i className="absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-white" style={{ background: 'var(--brand-accent)' }} /></span>
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  <span className="rounded bg-teal px-2.5 py-1 text-[10px] font-semibold" style={{ color: 'var(--brand-on)' }}>Run payroll</span>
                  <span className="rounded border px-2.5 py-1 text-[10px] font-semibold" style={{ borderColor: 'var(--brand-2)', color: 'var(--brand-2)' }}>Add employee</span>
                </div>
                <div className={`mt-2.5 grid gap-1.5 ${std ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {[['Employees', '120'], ['Payroll', '₦35.5M'], ['Present', '94%']].slice(0, std ? 2 : 3).map(([l, v]) => <div key={l} className="rounded-md border border-line bg-white p-2"><div className="text-[9px] text-slate">{l}</div><div className="font-display text-[15px] font-semibold">{v}</div></div>)}
                </div>
                <div className="mt-1.5 grid grid-cols-[1.3fr_1fr] gap-1.5">
                  <div className="rounded-md border border-line bg-white p-2">
                    <div className="text-[9px] font-semibold text-slate">Attendance this week</div>
                    <div className="mt-2 flex h-14 items-end gap-1">{[70, 88, 76, 94, 82, 40, 14].map((h, i) => <i key={i} className="flex-1 rounded-t-sm" style={{ height: h + '%', background: i === 3 ? 'var(--brand-accent)' : 'var(--color-teal)' }} />)}</div>
                  </div>
                  <div className="rounded-md border border-line bg-white p-2">
                    <div className="text-[9px] font-semibold text-slate">Approvals</div>
                    <div className="mt-1.5 space-y-1">{['Leave · A. Yusuf', 'Advance · E. Eze'].map((x, i) => <div key={x} className={`flex items-center justify-between rounded px-1.5 py-1 text-[9px] ${i === 0 ? 'bg-softmint' : ''}`}>{x}<i className="size-1.5 rounded-full" style={{ background: i ? 'var(--brand-accent)' : 'var(--color-teal)' }} /></div>)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'Sign-in' && (
            <div className="grid min-h-[340px] grid-cols-[1.1fr_1fr]">
              <div className="flex flex-col justify-center p-5">
                <TenantMark t={t} size={34} />
                <div className="mt-3 font-display text-[16px] font-semibold leading-tight">Welcome to {name.split(' ')[0]}</div>
                <div className="mt-3 space-y-1.5"><div className="h-7 rounded border border-line bg-white" /><div className="h-7 rounded border border-line bg-white" /></div>
                <div className="mt-2.5 rounded bg-teal py-1.5 text-center text-[10px] font-semibold" style={{ color: 'var(--brand-on)' }}>Sign in</div>
                <div className="mt-3 text-[8px] text-slate">Powered by BizFlow</div>
              </div>
              {slides.length > 0 ? <LoginSlides slides={slides} seconds={brand.loginSlideSeconds} compact /> : (
                <div className="on-dark relative flex flex-col justify-end overflow-hidden bg-midnight p-4 text-white">
                  <div className="relative h-1 w-8 rounded" style={{ background: 'var(--brand-accent)' }} /><div className="relative mt-2 font-display text-[13px] leading-tight">Your people.<br />Your payroll.<br />One workspace.</div>
                </div>
              )}
            </div>
          )}

          {tab === 'Onboarding' && (
            <div className="min-h-[340px]">
              <div className="flex items-center gap-2 bg-midnight px-4 py-2.5 text-white on-dark"><TenantMark t={t} size={22} tone="nav" /><span className="text-[11px] font-semibold">{name}</span><span className="ml-auto text-[9px] text-white/60">Employee onboarding</span></div>
              <div className="p-4">
                <div className="flex items-center gap-1">{['Personal', 'Contact', 'Employment', 'Bank', 'Documents'].map((s, i) => <div key={s} className="flex-1"><i className="block h-1 rounded" style={{ background: i < 2 ? 'var(--color-teal)' : 'var(--color-line)' }} /><span className={`mt-1 block text-[8px] ${i === 1 ? 'font-semibold text-teal' : 'text-slate'}`}>{s}</span></div>)}</div>
                <div className="mt-3 text-[13px] font-semibold">Contact details</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5"><div className="h-7 rounded border border-line bg-white" /><div className="h-7 rounded border border-line bg-white" /><div className="col-span-2 h-7 rounded border border-line bg-white" /></div>
                <div className="mt-3 flex justify-between"><span className="rounded border border-line px-2.5 py-1 text-[10px] font-semibold">Back</span><span className="rounded bg-teal px-2.5 py-1 text-[10px] font-semibold" style={{ color: 'var(--brand-on)' }}>Continue</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- page ---------- */
export default function Branding() {
  const t = useTenant()
  const { r, can } = useRole()
  const toast = useToast()
  const sys = useSystemDark()
  const [draft, setDraft] = useState<Brand | null>(t?.brand ?? null)
  const [logoPalette, setLogoPalette] = useState<ExtractedPalette | null>(null)
  const [saved, setSaved] = useState(false)
  const [reset, setReset] = useState(false)
  useEffect(() => { if (t && !draft) setDraft(t.brand) }, [t, draft])
  useEffect(() => {
    let active = true
    if (!draft?.logo) { setLogoPalette(null); return }
    extractLogoPalette(draft.logo).then((colors) => { if (active) setLogoPalette(colors) })
    return () => { active = false }
  }, [draft?.logo])
  if (!t || !draft) return null
  const up = (p: Partial<Brand>) => { setDraft({ ...draft, ...p }); setSaved(false) }
  const dirty = JSON.stringify(draft) !== JSON.stringify(t.brand)
  const canEdit = can('company.brand.manage')
  if (!canEdit) return (<div><PageHeader eyebrow="Settings · Company" title="Branding & Appearance" /><SettingsNav /><div className="rounded-lg border border-line bg-white"><EmptyState title="Branding is managed by your company administrators" body={`Your role (${r.title}) can see the workspace appearance but not change it. Ask a company administrator.`} /></div></div>)

  const sbBg = draft.sidebarColor || draft.secondary
  const sidebarBlocked = draft.sidebarBackground === 'solid' && !!draft.sidebarText && contrast(draft.sidebarText, sbBg) < MIN_CONTRAST
  const save = () => { if (sidebarBlocked) return; saveBrand(t.slug, draft); setSaved(true); toast('Branding updated successfully') }
  const doReset = () => {
    const b = { ...DEFAULT_BRAND, logo: draft.logo, logoLight: draft.logoLight, favicon: draft.favicon, loginBackground: draft.loginBackground, loginSlides: draft.loginSlides, loginSlideSeconds: draft.loginSlideSeconds }
    setDraft(b); saveBrand(t.slug, b); setReset(false); setSaved(false); toast('Appearance reset to BizFlow default')
  }
  const palette = SUGGESTED.find((p) => p.primary === draft.primary && p.secondary === draft.secondary && p.accent === draft.accent)

  return (
    <div className="pb-24">
      <PageHeader eyebrow="Settings · Company" title="Branding & Appearance" desc={`Make ${t.profile.name}'s BizFlow workspace look like your organisation. The platform stays recognisable; colours, logo and display preferences are yours.`} />
      <SettingsNav />
      {saved && (
        <div role="status" className="reveal mb-5 flex items-start gap-3 rounded-lg border border-ok/30 bg-green-50 px-4 py-3 text-green-700">
          <Check size={18} className="mt-0.5 shrink-0" /><div><div className="text-sm font-semibold">Branding updated successfully</div><div className="text-[13px]">Your company workspace has been updated.</div></div>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-5">
          <Section title="Company logo" desc="Shown in the sidebar, sign-in page, emails and employee onboarding.">
            <div className="space-y-3">
              <LogoSlot title="Primary logo" spec="PNG, SVG, JPG or WebP · 512 × 128 px recommended · max 1 MB" value={draft.logo} onChange={(v) => up({ logo: v })} bg="repeating-conic-gradient(#f0f4f4 0% 25%, #fff 0% 50%) 50% / 14px 14px" />
              <LogoSlot title="Light logo (optional)" spec="White or light version for dark backgrounds · PNG or SVG with transparency · max 1 MB" value={draft.logoLight} onChange={(v) => up({ logoLight: v })} bg="#14303a" />
              <LogoSlot title="Favicon (optional)" spec="Square PNG or ICO · 64 × 64 px · max 256 KB · Also used as your logo wherever no logo is uploaded" value={draft.favicon} onChange={(v) => up({ favicon: v })} bg="#fff" square />
            </div>
          </Section>

          <Section title="BizFlow brand assets" desc="Download the BizFlow logo, mark and favicon set for decks, email signatures and partner materials.">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[{ f: 'bizflow-mark.png', n: 'BizFlow mark', d: '1024 × 1024 · transparent' }, { f: 'favicon.ico', n: 'Favicon (.ico)', d: '16, 32, 48 px' }, { f: 'favicon-32x32.png', n: 'Favicon 32 px', d: 'PNG' }, { f: 'apple-touch-icon.png', n: 'Touch icon', d: '180 px · home screen' }, { f: 'icon-512.png', n: 'App icon 512', d: 'PNG' }, { f: 'bizflow-logo.png', n: 'Wordmark logo', d: 'Light backgrounds' }, { f: 'bizflow-logo-dark.png', n: 'Wordmark logo', d: 'Dark backgrounds' }, { f: 'bizflow-logo-tagline.png', n: 'Official logo + tagline', d: 'Light backgrounds' }, { f: 'bizflow-logo-tagline-dark.png', n: 'Official logo + tagline', d: 'Dark backgrounds' }, ].map((a) => (
                <li key={a.f}>
                  <a href={`/downloads/${a.f}`} download className="flex items-center gap-3 rounded-md border border-line p-2.5 hover:border-teal">
                    <span className="grid size-10 shrink-0 place-items-center rounded bg-cloud"><img src={`/downloads/${a.f}`} alt="" className="max-h-8 max-w-8 object-contain" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{a.n}</span><span className="block truncate text-xs text-slate">{a.d}</span></span>
                    <Download size={15} className="text-teal" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Login experience" desc="Upload images for the company sign-in page. They play as a slideshow, and every image is shown whole, with no cropping, stretching or overlay.">
            <SlidesEditor slides={draft.loginSlides?.length ? draft.loginSlides : draft.loginBackground ? [draft.loginBackground] : []} seconds={draft.loginSlideSeconds ?? 6} onChange={(loginSlides, loginSlideSeconds) => up({ loginSlides, loginSlideSeconds, loginBackground: null })} />
          </Section>

          <Section title="Brand colors" desc="Applied to navigation, buttons, selected states and highlights across your workspace.">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate">Start from</span>
              {logoPalette && <button onClick={() => up(logoPalette)} aria-pressed={draft.primary === logoPalette.primary && draft.secondary === logoPalette.secondary && draft.accent === logoPalette.accent} className={`flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${draft.primary === logoPalette.primary && draft.secondary === logoPalette.secondary && draft.accent === logoPalette.accent ? 'border-teal bg-softmint text-teal' : 'border-line hover:border-slate'}`}><Sparkles size={13} /><span className="flex -space-x-1">{[logoPalette.primary, logoPalette.secondary, logoPalette.accent].map((color) => <i key={color} className="size-3.5 rounded-full ring-2 ring-white" style={{ background: color }} />)}</span>From uploaded logo</button>}
              {SUGGESTED.map((p) => (
                <button key={p.name} onClick={() => up({ primary: p.primary, secondary: p.secondary, accent: p.accent })} aria-pressed={palette?.name === p.name} className={`flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${palette?.name === p.name ? 'border-teal bg-softmint text-teal' : 'border-line hover:border-slate'}`}>
                  <span className="flex -space-x-1">{[p.primary, p.secondary, p.accent].map((c) => <i key={c} className="size-3.5 rounded-full ring-2 ring-white" style={{ background: c }} />)}</span>{p.name}
                </button>
              ))}
            </div>
            {!draft.logo && <p className="mb-4 text-xs text-slate">Upload a primary logo to generate a matching brand palette automatically.</p>}
            <div className="grid gap-3 md:grid-cols-1">
              <ColorField label="Primary color" use="Main navigation, primary buttons, active navigation, important actions and selected states." value={draft.primary} onChange={(v) => up({ primary: v })} />
              <ColorField label="Secondary color" use="Supporting UI, secondary buttons and highlights." value={draft.secondary} onChange={(v) => up({ secondary: v })} />
              <ColorField label="Accent color" use="Notifications, highlights and selected visual accents." value={draft.accent} onChange={(v) => up({ accent: v })} />
            </div>
          </Section>

          <Section title="Appearance" desc="Controlled options so every BizFlow workspace stays familiar and easy to support.">
            <div className="space-y-5">
              <Seg label="Navigation style" value={draft.nav} onChange={(v) => up({ nav: v })} options={[{ v: 'sidebar', n: 'Sidebar', icon: <PanelLeft size={15} /> }, { v: 'compact', n: 'Compact Sidebar', icon: <PanelLeftClose size={15} /> }]} />
              <Seg label="Sidebar background" value={draft.sidebarBackground ?? 'gradient'} onChange={(v) => up({ sidebarBackground: v })} options={[{ v: 'gradient', n: 'Brand gradient' }, { v: 'solid', n: 'Solid custom color' }]} />
              <SidebarColors draft={draft} up={up} />
              <Seg<Theme> label="Theme" value={draft.theme} onChange={(v) => up({ theme: v })} options={[{ v: 'light', n: 'Light', icon: <Sun size={15} /> }, { v: 'dark', n: 'Dark', icon: <Moon size={15} /> }, { v: 'system', n: 'System Default', icon: <Monitor size={15} /> }]} />
              <Seg label="Interface density" value={draft.density} onChange={(v) => up({ density: v })} options={[{ v: 'comfortable', n: 'Comfortable' }, { v: 'compact', n: 'Compact' }]} />
              <Seg label="Dashboard layout" value={draft.layout} onChange={(v) => up({ layout: v })} options={[{ v: 'standard', n: 'Standard' }, { v: 'compact', n: 'Compact' }]} />
            </div>
          </Section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start max-xl:order-first" aria-label="Live preview">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold">Live preview</h2>{dirty ? <Badge tone="amber">Unsaved changes</Badge> : <Badge tone="green">Matches saved</Badge>}</div>
          <BrandPreview brand={draft} name={t.profile.name} slug={t.slug} sys={sys} />
          <p className="mt-2 text-xs text-slate">Changes appear here instantly. Your live workspace updates when you save.</p>
        </aside>
      </div>

      <div className="mobile-save-bar fixed inset-x-0 z-20 border-t border-line bg-white md:bottom-0 md:left-16 lg:left-[var(--sbw,248px)]" role="region" aria-label="Save changes">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2 px-3 py-3 sm:px-4 lg:px-8">
          <Btn v="ghost" onClick={() => setReset(true)}><RefreshCcw size={15} />Reset to BizFlow Default</Btn>
          <span className="ml-auto hidden text-xs text-slate sm:block">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
          <Btn v="secondary" disabled={!dirty} onClick={() => { setDraft(t.brand); setSaved(false) }}>Cancel</Btn>
          <Btn disabled={!dirty || sidebarBlocked} onClick={save}>Save Changes</Btn>
        </div>
      </div>

      <Overlay open={reset} onClose={() => setReset(false)} title="Reset company appearance?" alert>
        <p className="text-sm text-slate">This will restore the default BizFlow appearance for your company.</p>
        <p className="mt-2 text-sm text-slate">Colours, theme, navigation and density return to defaults. Your uploaded logos are kept.</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setReset(false)}>Cancel</Btn><Btn onClick={doReset} className="bg-err! hover:bg-red-700!">Reset Appearance</Btn></div>
      </Overlay>
    </div>
  )
}
