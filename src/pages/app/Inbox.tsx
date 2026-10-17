import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Badge, Btn, EmptyState, PageHeader, Panel, Tabs, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { useTenant } from '../../tenant/store'
import SupportTab, { useRateable } from './SupportTab'
import { canRate } from '../../platform/helpdesk'
import { recordClick } from '../../platform/announcements'
import { CHANNELS, NTYPES, markRead, markUnread, setPref, useInbox } from '../../notifications/store'
import type { NType } from '../../notifications/store'

export default function Inbox() {
  const tenant = useTenant(); const slug = tenant?.slug ?? ''
  const navigate = useNavigate()
  const { role, r, can } = useRole(); const toast = useToast()
  const { items, unread, prefs, hidden } = useInbox(slug, { user: r.user, role, modules: r.modules, isAdmin: can('company.users.manage') })
  const supportCount = useRateable(slug, r.user, can('company.users.manage')).filter(canRate).length
  const [sp] = useSearchParams()
  const [tab, setTab] = useState(sp.get('tab') === 'Support' ? 'Support' : 'Inbox')
  const [type, setType] = useState<'All' | NType>('All')
  const [show, setShow] = useState('All')
  const shown = items.filter((i) => (type === 'All' || i.type === type) && (show === 'All' || (show === 'Unread' ? !i.read : i.read)))
  const sel = 'h-9 rounded-md border border-line bg-white px-2 text-sm'
  return (
    <div>
      <PageHeader eyebrow="Workspace" title="Inbox" desc="Approvals, tasks, signatures, follow-ups and payments waiting on you." actions={unread > 0 && <Btn v="secondary" onClick={() => { markRead(slug, r.user, items.map((i) => i.id)); toast('All notifications marked as read') }}>Mark all read</Btn>} />
      <Tabs tabs={['Inbox', supportCount ? `Support (${supportCount})` : 'Support', 'Preferences']} value={tab.startsWith('Support') ? (supportCount ? `Support (${supportCount})` : 'Support') : tab} onChange={(t) => setTab(t.startsWith('Support') ? 'Support' : t)} />
      {tab === 'Inbox' ? (
        <Panel title={`${unread} unread of ${items.length}`} action={
          <div className="flex gap-2">
            <select aria-label="Filter by type" className={sel} value={type} onChange={(e) => setType(e.target.value as 'All' | NType)}><option>All</option>{NTYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <select aria-label="Filter by status" className={sel} value={show} onChange={(e) => setShow(e.target.value)}><option>All</option><option>Unread</option><option>Read</option></select>
          </div>}>
          {shown.length === 0 ? <EmptyState title="You are all caught up" body={hidden ? `${hidden} item(s) are hidden by your preferences.` : 'Nothing needs your attention right now.'} /> : (
            <ul className="-my-2 divide-y divide-line">
              {shown.map((i) => (
                <li key={i.id} className="flex items-start gap-3 py-3">
                  <span className={`mt-2 size-2 shrink-0 rounded-full ${i.read ? 'bg-transparent' : i.urgent ? 'bg-err' : 'bg-teal'}`} aria-label={i.read ? 'Read' : 'Unread'} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${i.read ? 'text-slate' : 'font-semibold text-ink'}`}>{i.title}</div>
                    <p className="text-[13px] text-slate">{i.body}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate"><Badge>{i.type}</Badge>{i.urgent && <Badge tone="err">Urgent</Badge>}<span>{i.when}</span></div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-[13px] font-semibold">
                    {i.cta && i.id.startsWith('ann:') && (
                      <button className="cursor-pointer text-teal" onClick={() => {
                        recordClick(i.id.slice(4), slug); markRead(slug, r.user, [i.id])
                        if (/^https?:\/\//i.test(i.cta!.url)) window.open(i.cta!.url, '_blank', 'noopener')
                        else if (i.cta!.url.startsWith('/')) navigate(i.cta!.url)
                      }}>{i.cta.label}</button>
                    )}
                    <Link to={i.to} onClick={() => markRead(slug, r.user, [i.id])} className={i.cta ? 'text-slate' : 'text-teal'}>{i.cta ? 'Read' : 'Open'}</Link>
                    <button className="cursor-pointer text-slate" onClick={() => i.read ? markUnread(slug, r.user, i.id) : markRead(slug, r.user, [i.id])}>{i.read ? 'Mark unread' : 'Mark read'}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : tab === 'Support' ? (
        <SupportTab slug={slug} user={r.user} isAdmin={can('company.users.manage')} />
      ) : (
        <Panel title="Notification preferences" action={<Btn v="secondary" s="sm" onClick={() => toast('Digest preview sent to ' + r.user + ' (demo)')}>Send test digest</Btn>}>
          <p className="mb-3 text-sm text-slate">Choose how each type reaches you. Email and WhatsApp send a daily digest. Turning off in-app hides the type from your inbox and bell.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate"><th className="py-2 font-medium">Type</th>{CHANNELS.map(([k, l]) => <th key={k} className="px-3 py-2 text-center font-medium">{l}</th>)}</tr></thead>
              <tbody>
                {NTYPES.map((t) => (
                  <tr key={t} className="border-t border-line">
                    <td className="py-2.5 font-medium">{t}</td>
                    {CHANNELS.map(([k, l]) => <td key={k} className="px-3 text-center"><input type="checkbox" aria-label={`${t} ${l}`} className="size-4 accent-teal" checked={prefs[t][k]} onChange={(e) => setPref(slug, r.user, t, k, e.target.checked)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
