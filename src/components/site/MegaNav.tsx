import { useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { ArrowRight, ChevronDown } from "lucide-react"
import { Link } from "react-router"
import { CAPABILITIES, SOLUTIONS } from "../../data/capabilities"

export function CapabilitiesMenu({ onNavigate }: { onNavigate: () => void }) {
  const [active, setActive] = useState(0)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const capability = CAPABILITIES[active]
  const Icon = capability.icon

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const key = event.key
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return
    event.preventDefault()
    const count = CAPABILITIES.length
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? count - 1
          : (index + (key === "ArrowRight" || key === "ArrowDown" ? 1 : -1) + count) % count
    setActive(next)
    buttons.current[next]?.focus()
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-7">
      <div className="mb-6 flex items-end justify-between gap-8 border-b border-line pb-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal">Capabilities</div>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">
            Everything your business needs to operate from one connected platform.
          </p>
        </div>
        <span className="hidden text-xs font-medium text-slate xl:block">Use arrow keys to explore</span>
      </div>
      <div className="grid grid-cols-[1.15fr_1fr] gap-8">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Capability groups">
          {CAPABILITIES.map((item, index) => {
            const ItemIcon = item.icon
            const selected = index === active
            return (
              <button
                key={item.id}
                ref={(node) => { buttons.current[index] = node }}
                role="tab"
                aria-selected={selected}
                aria-controls="capability-detail"
                tabIndex={selected ? 0 : -1}
                onFocus={() => setActive(index)}
                onMouseEnter={() => setActive(index)}
                onKeyDown={(event) => move(event, index)}
                className={`group cursor-pointer rounded-md border p-4 text-left transition-[background-color,border-color,transform] duration-150 ${
                  selected ? "border-teal/30 bg-softmint/60" : "border-transparent hover:border-line hover:bg-cloud"
                }`}
              >
                <span className="flex items-center justify-between">
                  <ItemIcon size={18} strokeWidth={1.7} className={selected ? "text-teal" : "text-slate"} />
                  <span className="font-mono text-[10px] text-slate">{item.number}</span>
                </span>
                <span className="mt-3 block text-sm font-semibold uppercase tracking-[0.08em] text-ink">{item.name}</span>
                <span className="mt-1.5 block text-xs leading-relaxed text-slate">{item.shortDescription}</span>
              </button>
            )
          })}
        </div>
        <div id="capability-detail" role="tabpanel" className="rounded-lg bg-midnight p-6 text-white on-dark">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-white/10 text-mint">
              <Icon size={20} strokeWidth={1.7} />
            </span>
            <div>
              <span className="font-mono text-[10px] text-mint">{capability.number}</span>
              <h2 className="text-xl font-semibold">{capability.name}</h2>
            </div>
          </div>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/65">{capability.description}</p>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-white/10 py-4">
            {capability.modules.slice(0, 8).map((module) => (
              <Link
                key={module.name}
                to={`/capabilities#${capability.id}`}
                onClick={onNavigate}
                className="group flex items-center justify-between py-1 text-[13px] font-medium text-white/75 transition-colors hover:text-white"
              >
                {module.shortName ?? module.name}
                <ArrowRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
          <Link
            to={`/capabilities#${capability.id}`}
            onClick={onNavigate}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-mint"
          >
            Explore {capability.name} <ArrowRight size={15} />
          </Link>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
        <div className="text-sm text-slate"><b className="text-ink">Featured: BizFlow Sign.</b> Sign and manage documents without leaving BizFlow.</div>
        <Link to="/capabilities" onClick={onNavigate} className="inline-flex items-center gap-2 text-sm font-semibold text-teal">
          Explore all capabilities <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}

export function SolutionsMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="mx-auto grid max-w-[900px] grid-cols-[0.8fr_1.2fr] gap-10 px-6 py-7">
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-teal">By role</div>
        <div className="grid grid-cols-2 gap-1">
          {SOLUTIONS.roles.map((name) => (
            <Link key={name} to={`/solutions?role=${encodeURIComponent(name)}`} onClick={onNavigate} className="rounded px-3 py-2 text-sm font-medium text-ink hover:bg-softmint">
              {name}
            </Link>
          ))}
        </div>
      </div>
      <div className="border-l border-line pl-10">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-teal">By business</div>
        <div className="grid grid-cols-2 gap-1">
          {SOLUTIONS.businesses.map((name) => (
            <Link key={name} to={`/solutions?business=${encodeURIComponent(name)}`} onClick={onNavigate} className="rounded px-3 py-2 text-sm font-medium text-ink hover:bg-softmint">
              {name}
            </Link>
          ))}
        </div>
        <Link to="/solutions" onClick={onNavigate} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal">
          Explore all solutions <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}

export function MobileCapabilities({ onNavigate }: { onNavigate: () => void }) {
  const [active, setActive] = useState<string | null>(null)
  const capability = CAPABILITIES.find((item) => item.id === active)

  if (capability) {
    return (
      <div>
        <button onClick={() => setActive(null)} className="mb-3 flex min-h-11 w-full cursor-pointer items-center gap-2 text-sm font-semibold text-teal">
          <ArrowRight size={16} className="rotate-180" /> Capabilities
        </button>
        <div className="border-b border-line pb-4">
          <div className="font-mono text-xs text-teal">{capability.number}</div>
          <h2 className="mt-1 text-3xl font-semibold text-ink">{capability.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate">{capability.description}</p>
        </div>
        <div className="py-2">
          {capability.modules.map((module) => (
            <Link key={module.name} to={`/capabilities#${capability.id}`} onClick={onNavigate} className="block min-h-11 border-b border-line/70 py-3 text-sm font-medium text-ink">
              {module.name}
            </Link>
          ))}
        </div>
        <Link to={`/capabilities#${capability.id}`} onClick={onNavigate} className="mt-3 inline-flex min-h-11 items-center gap-2 py-2 text-sm font-semibold text-teal">
          Explore {capability.name} <ArrowRight size={15} />
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-teal">Capabilities</div>
      <p className="mb-4 text-sm text-slate">One connected platform for every part of your business.</p>
      {CAPABILITIES.map((item) => {
        const Icon = item.icon
        return (
          <button key={item.id} onClick={() => setActive(item.id)} className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-line text-left">
            <Icon size={18} strokeWidth={1.7} className="text-teal" />
            <span className="font-semibold text-ink">{item.name}</span>
            <ArrowRight size={16} className="ml-auto text-slate" />
          </button>
        )
      })}
      <Link to="/capabilities" onClick={onNavigate} className="mt-4 inline-flex min-h-11 items-center gap-2 py-2 text-sm font-semibold text-teal">
        Explore all capabilities <ArrowRight size={15} />
      </Link>
    </div>
  )
}

export function MobileSolutions({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState<"roles" | "businesses" | null>(null)
  const groups = [
    { id: "roles" as const, label: "By role", items: SOLUTIONS.roles, key: "role" },
    { id: "businesses" as const, label: "By business", items: SOLUTIONS.businesses, key: "business" },
  ]
  return (
    <div className="border-t border-line">
      {groups.map((group) => (
        <div key={group.id} className="border-b border-line">
          <button onClick={() => setOpen(open === group.id ? null : group.id)} aria-expanded={open === group.id} className="flex min-h-14 w-full cursor-pointer items-center justify-between text-left font-semibold text-ink">
            {group.label}<ChevronDown size={17} className={`transition-transform ${open === group.id ? "rotate-180" : ""}`} />
          </button>
          {open === group.id && (
            <div className="grid grid-cols-2 gap-1 pb-4">
              {group.items.map((name) => (
                <Link key={name} to={`/solutions?${group.key}=${encodeURIComponent(name)}`} onClick={onNavigate} className="rounded bg-cloud px-3 py-3 text-sm text-ink">
                  {name}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
