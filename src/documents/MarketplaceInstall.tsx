import { useState } from 'react'
import { Store } from 'lucide-react'
import { Badge, Btn, EmptyState, Overlay, useToast } from '../components/ui'
import type { Tenant } from '../tenant/store'
import { recordInstall, useTemplates } from '../platform/sysops'
import type { Template } from '../platform/sysops'
import { A4Page, ScaledPage, UploadedPreview } from './TemplatePage'
import { createTemplate, resolveIdentity, sampleData, saveTemplate, seedIdentity, useTemplateConfig } from './templates'
import type { Block } from './templates'
import { isOwnDataset } from '../data/demo'

type Ctx = Pick<Tenant, 'slug' | 'profile' | 'brand'>
const fresh = (b: Block): Block => ({ ...b, id: `b${Math.random().toString(36).slice(2, 9)}` })

/** Lets a company admin copy a published BizFlow marketplace document template into the company's own templates. */
export default function MarketplaceInstall({ tenant, user }: { tenant: Ctx; user: string }) {
  const toast = useToast()
  const cfg = useTemplateConfig(tenant)
  const all = useTemplates()
  const [open, setOpen] = useState(false)
  const [peek, setPeek] = useState<string | null>(null)
  const items = all.filter((t) => t.status === 'Published' && t.payload.kind === 'Document template')
  const identity = resolveIdentity(cfg.identity ?? seedIdentity(tenant), tenant)
  const install = (t: Template) => {
    const p = t.payload
    if (p.kind !== 'Document template') return
    const made = createTemplate(tenant, p.docType, t.name, user)
    saveTemplate(tenant, { ...made, description: t.desc, blocks: p.blocks.map(fresh), letterhead: p.letterhead, upload: p.upload }, user)
    recordInstall(t.id, tenant.slug, user)
    toast(`${t.name} added to your templates as a variant`)
  }
  const sel = items.find((t) => t.id === peek)
  return (
    <>
      <Btn v="secondary" onClick={() => setOpen(true)}><Store size={15} />Marketplace</Btn>
      <Overlay open={open} onClose={() => { setOpen(false); setPeek(null) }} title="BizFlow template marketplace" side wide>
        <p className="mb-4 text-sm text-slate">Published document templates from BizFlow. Installing adds a copy to your templates as a variant that you can edit. It does not change your company standard.</p>
        {items.length === 0 ? <EmptyState title="Nothing published yet" body="BizFlow has not published any document templates." /> : (
          <ul className="space-y-3">{items.map((t) => {
            const mine = t.installedBy.find((i) => i.slug === tenant.slug)
            return (
              <li key={t.id} className="rounded-lg border border-line bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><b className="text-sm">{t.name}</b><p className="text-[13px] text-slate">{t.desc}</p><p className="mt-1 text-xs text-slate">v{t.version} · {t.industry}</p></div>{mine && <Badge tone="green">Installed v{mine.version}</Badge>}</div>
                <div className="mt-3 flex gap-2"><Btn s="sm" v="secondary" onClick={() => setPeek(peek === t.id ? null : t.id)}>{peek === t.id ? 'Hide preview' : 'Preview'}</Btn><Btn s="sm" onClick={() => install(t)}>{mine ? 'Install again' : 'Install'}</Btn></div>
                {sel?.id === t.id && t.payload.kind === 'Document template' && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-line bg-slate/10 p-2">
                    {t.payload.upload ? <div className="bg-white"><UploadedPreview file={t.payload.upload} /></div>
                      : <ScaledPage><A4Page template={{ id: 'mk', type: t.payload.docType, name: t.name, description: t.desc, blocks: t.payload.blocks, letterhead: t.payload.letterhead, isStandard: false, builtin: false, version: 1, editedBy: '', editedAt: '2026-01-01T00:00:00.000Z' }} identity={identity} data={sampleData(cfg.identity, isOwnDataset(tenant.slug))} /></ScaledPage>}
                  </div>
                )}
              </li>
            )
          })}</ul>
        )}
      </Overlay>
    </>
  )
}
