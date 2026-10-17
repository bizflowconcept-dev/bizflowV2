import type { ReactNode } from 'react'
import { AlertTriangle, Ban, Clock, KeyRound, Link2Off, Lock, ShieldAlert, WifiOff } from 'lucide-react'
import { Btn } from '../components/ui'
import { PoweredBy, TenantMark } from './ui'
import { host } from './store'
import type { Tenant } from './store'

const ICONS = { warn: AlertTriangle, ban: Ban, clock: Clock, key: KeyRound, link: Link2Off, lock: Lock, shield: ShieldAlert, off: WifiOff }

export function StateScreen({ icon = 'warn', title, body, actions, tenant, detail }: { icon?: keyof typeof ICONS; title: string; body: string; actions?: ReactNode; tenant?: Pick<Tenant, 'brand' | 'profile' | 'slug'>; detail?: ReactNode }) {
  const I = ICONS[icon]
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cloud px-4 py-10 text-center">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8">
        {tenant && <div className="mb-5 flex items-center justify-center gap-2.5"><TenantMark t={tenant} size={32} /><span className="font-display font-semibold">{tenant.profile.name}</span></div>}
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-softmint text-teal"><I size={24} /></span>
        <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-slate">{body}</p>
        {detail}
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
      <div className="mt-6 flex flex-col items-center gap-1"><PoweredBy />{tenant && <code className="font-mono text-[11px] text-slate">{host(tenant.slug)}</code>}</div>
    </div>
  )
}

export function WorkspaceBlocked({ tenant, canBilling }: { tenant: Tenant; canBilling: boolean }) {
  const expired = tenant.status === 'Expired'
  return (
    <StateScreen tenant={tenant} icon={expired ? 'clock' : 'ban'} title={expired ? 'Subscription expired' : 'Workspace Suspended'}
      body={expired ? 'Your BizFlow subscription has ended. Your data is safe and kept for 90 days. Renew to restore access for your whole team.' : 'Access to this workspace is paused. Your data is safe and has not been deleted.'}
      detail={!expired && <p className="mt-4 rounded-md bg-cloud px-3 py-2 text-sm"><span className="text-slate">Reason: </span><b>Unpaid subscription</b></p>}
      actions={<>{canBilling && <Btn to="/admin/business/billing">{expired ? 'Renew subscription' : 'Pay outstanding invoice'}</Btn>}<Btn v="secondary" to="/contact">Contact BizFlow Support</Btn><Btn v="ghost" to={`/w/${tenant.slug}/login`}>Sign out</Btn></>} />
  )
}
