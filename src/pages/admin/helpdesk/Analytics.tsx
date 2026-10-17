import { useMemo } from 'react'
import { CHART, TrendChart } from '../../../components/charts'
import { EmptyState, Panel, Stat, Table } from '../../../components/ui'
import { fmtAt } from '../../../platform/persist'
import { helpdeskKpis } from '../../../platform/helpdesk'
import type { Ticket } from '../../../platform/helpdesk'

const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${Math.round(min % 60)}m` : `${Math.round(min)}m`)

export default function Analytics({ tickets, now, co }: { tickets: Ticket[]; now: number; co: (slug: string) => string }) {
  const k = useMemo(() => helpdeskKpis(tickets, now), [tickets, now])
  const csatRows = k.weekly.filter((w) => w.csat !== null)
  const feedback = tickets.filter((t) => t.csat && t.csat.score !== null).sort((a, b) => b.csat!.at.localeCompare(a.csat!.at)).slice(0, 8)
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Panel><Stat label="Avg first response" value={dur(k.avgFirstMin)} sub="all replied tickets" /></Panel>
        <Panel><Stat label="Avg resolution time" value={k.avgResolveH >= 48 ? `${(k.avgResolveH / 24).toFixed(1)}d` : `${k.avgResolveH.toFixed(1)}h`} sub="excludes waiting time" /></Panel>
        <Panel><Stat label="SLA breach rate" value={`${k.breachRate}%`} sub={`${k.breachedN} of ${tickets.length} tickets`} up={false} /></Panel>
        <Panel><Stat label="CSAT average" value={k.csatCount ? `${k.csatAvg.toFixed(1)} / 5` : 'No data'} sub={`${k.csatCount} rated, ${k.noResponse} no response`} /></Panel>
        <Panel><Stat label="Tickets" value={String(tickets.length)} sub={`${tickets.filter((t) => t.status === 'Resolved').length} resolved`} /></Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="CSAT trend by week" action={<span className="text-xs text-slate">By resolution week</span>}>
          {csatRows.length === 0 ? <EmptyState title="No CSAT yet" body="Ratings appear here once tickets are resolved with a score." /> : <TrendChart data={csatRows as unknown as Record<string, number | string>[]} series={[{ key: 'csat', label: 'Average CSAT' }]} fmt={(v) => v.toFixed(1)} label="Average CSAT score by week" height={230} />}
        </Panel>
        <Panel title="SLA breach rate trend" action={<span className="text-xs text-slate">By ticket creation week</span>}>
          <TrendChart data={k.weekly as unknown as Record<string, number | string>[]} series={[{ key: 'breach', label: 'Breach rate', color: CHART.red }]} fmt={(v) => `${v}%`} label="Share of tickets that breached an SLA, by week" height={230} />
        </Panel>
      </div>
      <Panel title="Recent customer feedback" pad={false}>
        {feedback.length === 0 ? <EmptyState title="No feedback yet" body="Comments left with CSAT scores show here." /> : (
          <Table label="Recent CSAT feedback" pageSize={8} head={['Ticket', 'Company', 'Score', 'Comment', 'Recorded']} rows={feedback.map((t) => [t.id, co(t.slug), `${t.csat!.score} / 5`, t.csat!.comment || 'No comment', fmtAt(t.csat!.at)])} />
        )}
      </Panel>
    </div>
  )
}
