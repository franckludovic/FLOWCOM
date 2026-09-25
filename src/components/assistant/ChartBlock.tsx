import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Table2, BarChart3 } from 'lucide-react'
import type { ChartSpec } from '@/lib/assistant'
import { cn } from '@/lib/utils'

// Categorical slots in fixed order (never cycled); a 7th series never appears
// because the assistant caps charts at 6 series.
const SERIES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)']

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat()

const axisTick = { fill: 'var(--color-text-muted)', fontSize: 11 }

function ChartTooltip({ active, payload, label, unit }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: { fill?: string } }>
  label?: string
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 shadow-md text-xs">
      {label && <p className="font-semibold text-[var(--color-text)] mb-0.5">{label}</p>}
      {payload.map(p => (
        <p key={p.name} className="flex items-center gap-1.5 text-[var(--color-text)]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-[var(--color-text-muted)]">{p.name}</span>
          <span className="font-medium ml-auto pl-3">{full.format(p.value ?? 0)}{unit ? ` ${unit}` : ''}</span>
        </p>
      ))}
    </div>
  )
}

export function ChartBlock({ chart }: { chart: ChartSpec }) {
  const [asTable, setAsTable] = useState(false)
  const rows = chart.labels.map((label, i) => ({ label, ...Object.fromEntries(chart.series.map(s => [s.name, s.values[i] ?? 0])) }))
  const multi = chart.series.length > 1
  const legend = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--color-text-muted)' }} />

  return (
    <figure className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <figcaption className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-[var(--color-text)]">{chart.title}{chart.unit ? ` (${chart.unit})` : ''}</span>
        <button onClick={() => setAsTable(v => !v)} title={asTable ? 'Chart' : 'Table'}
          className="p-1 rounded text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]">
          {asTable ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
        </button>
      </figcaption>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                <th className="py-1 pr-3 font-medium" />
                {chart.series.map(s => <th key={s.name} className="py-1 pr-3 font-medium text-right">{s.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(row => (
                <tr key={row.label} className="text-[var(--color-text)]">
                  <td className="py-1 pr-3">{row.label}</td>
                  {chart.series.map(s => <td key={s.name} className="py-1 pr-3 text-right">{full.format(Number((row as Record<string, unknown>)[s.name]) || 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === 'donut' ? (
              <PieChart>
                <Pie data={chart.labels.map((label, i) => ({ name: label, value: chart.series[0].values[i] ?? 0 }))}
                  dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={1}
                  stroke="var(--color-surface)" strokeWidth={2} isAnimationActive={false}
                  label={({ percent }: { percent?: number }) => `${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                  {chart.labels.map((label, i) => <Cell key={label} fill={SERIES[i % SERIES.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip unit={chart.unit} />} />
                {legend}
              </PieChart>
            ) : chart.type === 'line' ? (
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} minTickGap={16} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={v => compact.format(v)} width={44} />
                <Tooltip content={<ChartTooltip unit={chart.unit} />} cursor={{ stroke: 'var(--color-text-muted)', strokeDasharray: '3 3' }} />
                {chart.series.map((s, i) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={SERIES[i]} strokeWidth={2}
                    dot={rows.length <= 12 ? { r: 4, strokeWidth: 2, stroke: 'var(--color-surface)', fill: SERIES[i] } : false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)' }} isAnimationActive={false} />
                ))}
                {multi && legend}
              </LineChart>
            ) : (
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap="24%">
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} minTickGap={8} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={v => compact.format(v)} width={44} />
                <Tooltip content={<ChartTooltip unit={chart.unit} />} cursor={{ fill: 'var(--color-surface-alt)' }} />
                {chart.series.map((s, i) => (
                  <Bar key={s.name} dataKey={s.name} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                ))}
                {multi && legend}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  )
}

export function TableBlock({ title, columns, rows }: { title: string; columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <figure className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      {title && <figcaption className="text-xs font-semibold text-[var(--color-text)] mb-2">{title}</figcaption>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              {columns.map(col => <th key={col} className="py-1 pr-3 font-medium whitespace-nowrap">{col}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row, i) => (
              <tr key={i} className="text-[var(--color-text)] align-top">
                {row.map((cell, j) => (
                  <td key={j} className={cn('py-1 pr-3', typeof cell === 'number' && 'text-right whitespace-nowrap')}>
                    {typeof cell === 'number' ? full.format(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
