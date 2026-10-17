import { Navigate, useParams } from 'react-router'
import { Btn } from '../../components/ui'
import { StateScreen } from '../../tenant/states'
import { activeSlug, host, useApplyBrand, useTenant } from '../../tenant/store'

export function WorkspaceEntry() {
  const { slug = '' } = useParams()
  const want = useTenant(slug)
  const mine = useTenant()
  useApplyBrand(want)
  if (!want) return <StateScreen icon="link" title={`No workspace at ${slug}.bizflow.com`} body="Check the address, or ask your administrator for the correct link." actions={<Btn to="/">Go to BizFlow</Btn>} />
  if (want.slug === activeSlug()) return <Navigate to="/admin/business/dashboard" replace />
  if (new URLSearchParams(location.search).get('source') === 'pwa') return <Navigate to={`/w/${want.slug}/login`} replace />
  return <StateScreen tenant={want} icon="shield" title="You don't have access to this workspace" body={`You are signed in to ${mine?.profile.name ?? 'another company'}. For security, one account cannot open another company's workspace.`} detail={<p className="mt-3 text-sm text-slate">Signed in at <code className="font-mono">{host(mine?.slug ?? '')}</code></p>} actions={<><Btn to={`/w/${want.slug}/login`}>Sign in to {want.profile.name}</Btn><Btn v="secondary" to="/admin/business/dashboard">Back to my workspace</Btn></>} />
}

export function SessionExpired() {
  const mine = useTenant()
  return <StateScreen tenant={mine} icon="key" title="Your session expired" body="For your security you were signed out after a period of inactivity. Sign in again to pick up where you left off." actions={<Btn to={`/w/${mine?.slug ?? 'etranzact'}/login`}>Sign in again</Btn>} />
}
