import { CheckCircle2, Circle } from 'lucide-react'
import { Avatar, Badge, useToast } from '../components/ui'
import { dueLabel, isOverdue, setTaskStatus, useTasks } from './store'

const PRI: Record<string, string> = { Low: 'gray', Normal: 'blue', High: 'amber', Urgent: 'red' }

export function TaskList({ scope, tenant, assignee, limit = 4, me, empty = 'Nothing outstanding.' }: { scope: 'Platform' | 'Business'; tenant?: string; assignee?: string; limit?: number; me: string; empty?: string }) {
  const toast = useToast()
  const all = useTasks()
  const list = all.filter((t) => t.scope === scope && (!tenant || t.tenant === tenant) && (!assignee || t.assignees.includes(assignee) || t.collaborators.includes(assignee))).sort((a, b) => a.due.localeCompare(b.due)).slice(0, limit)
  if (!list.length) return <p className="py-4 text-sm text-slate">{empty}</p>
  return (
    <ul className="divide-y divide-line/70">
      {list.map((t) => (
        <li key={t.id} className={`flex items-start gap-3 py-2.5 text-sm ${t.status === 'Done' ? 'text-slate' : ''}`}>
          <button aria-label={t.status === 'Done' ? `Reopen ${t.title}` : `Complete ${t.title}`} onClick={() => { setTaskStatus(t.id, t.status === 'Done' ? 'To do' : 'Done', me); toast(`${t.id} ${t.status === 'Done' ? 'reopened' : 'marked completed'}`) }} className="mt-0.5 cursor-pointer text-slate hover:text-ok">{t.status === 'Done' ? <CheckCircle2 size={17} className="text-ok" /> : <Circle size={17} />}</button>
          <div className="min-w-0 flex-1"><div className={`truncate font-medium ${t.status === 'Done' ? 'line-through' : ''}`}>{t.title}</div><div className={`text-xs ${isOverdue(t) ? 'font-semibold text-err' : 'text-slate'}`}>{t.status === 'Done' ? 'Completed' : <>{dueLabel(t.due)}{isOverdue(t) && ' · overdue'}</>} · {t.related}</div></div>
          {assignee ? <Badge tone={t.status === 'Done' ? 'green' : PRI[t.priority]}>{t.status === 'Done' ? 'Completed' : t.priority}</Badge> : <span className="flex -space-x-2">{t.assignees.slice(0, 2).map((name) => <Avatar key={name} name={name} size={22} />)}</span>}
        </li>
      ))}
    </ul>
  )
}
