import { useEffect, useMemo, useRef } from 'react'
import {
  behaviorAmountOf,
  formatMoney,
  fromDateKey,
  quantileThresholds,
  scoreLevel,
  toDateKey,
  type DaySpend,
} from '../domain'

interface HeatmapProps {
  year: number
  days: DaySpend[]
  currency: string
  selectedDate: string | null
  onSelect: (date: string) => void
}

interface HeatmapDay {
  date: string
  inYear: boolean
  isFuture: boolean
  summary?: DaySpend
}

const weekDays = ['一', '三', '五']

function buildWeeks(year: number, summaries: Map<string, DaySpend>): HeatmapDay[][] {
  const first = new Date(year, 0, 1, 12)
  const last = new Date(year, 11, 31, 12)
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - cursor.getDay())
  const end = new Date(last)
  end.setDate(end.getDate() + (6 - end.getDay()))
  const today = toDateKey(new Date())
  const weeks: HeatmapDay[][] = []

  while (cursor <= end) {
    const week: HeatmapDay[] = []
    for (let day = 0; day < 7; day += 1) {
      const date = toDateKey(cursor)
      week.push({
        date,
        inYear: cursor.getFullYear() === year,
        isFuture: date > today,
        summary: summaries.get(date),
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}

export function Heatmap({ year, days, currency, selectedDate, onSelect }: HeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const summaryMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days])
  const weeks = useMemo(() => buildWeeks(year, summaryMap), [year, summaryMap])
  const thresholds = useMemo(() => quantileThresholds(days, currency, behaviorAmountOf), [currency, days])
  const monthLabels = useMemo(() => {
    const labels: { month: string; week: number }[] = []
    let lastMonth = -1
    weeks.forEach((week, index) => {
      const visibleDay = week.find((day) => day.inYear && fromDateKey(day.date).getMonth() !== lastMonth)
      if (visibleDay) {
        const month = fromDateKey(visibleDay.date).getMonth()
        labels.push({ month: `${month + 1}月`, week: index + 1 })
        lastMonth = month
      }
    })
    return labels
  }, [weeks])

  useEffect(() => {
    const container = scrollRef.current
    if (!container || !window.matchMedia('(max-width: 760px)').matches) return
    const target = container.querySelector<HTMLElement>('[data-today]')
    if (!target) return
    const frame = window.requestAnimationFrame(() => {
      const containerLeft = container.getBoundingClientRect().left
      const targetLeft = target.getBoundingClientRect().left - containerLeft + container.scrollLeft
      container.scrollLeft = Math.max(0, targetLeft - container.clientWidth + 72)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [year])

  return (
    <div ref={scrollRef} className="heatmap-scroll" tabIndex={0} aria-label={`${year} 年 ${currency} 支出热力图`}>
      <div className="heatmap-inner">
        <div className="month-spacer" />
        <div className="month-labels" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--cell-size))` }}>
          {monthLabels.map(({ month, week }) => <span key={month} style={{ gridColumn: week }}>{month}</span>)}
        </div>
        <div className="weekday-labels" aria-hidden="true">
          {weekDays.map((label, index) => <span key={label} style={{ gridRow: index * 2 + 2 }}>{label}</span>)}
        </div>
        <div className="heatmap-grid">
          {weeks.map((week) => (
            <div className="heatmap-week" key={week[0].date}>
              {week.map((day) => {
                if (!day.inYear) return <span className="heatmap-blank" key={day.date} />
                const amount = behaviorAmountOf(day.summary, currency)
                const level = day.summary ? scoreLevel(amount, thresholds) : -1
                const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(fromDateKey(day.date))
                const statusLabel = day.summary ? `行为支出 ${formatMoney(amount, currency)}` : '没有支出记录'
                return (
                  <button
                    type="button"
                    className="heatmap-cell"
                    data-level={level}
                    data-today={day.date === toDateKey(new Date()) || undefined}
                    data-selected={day.date === selectedDate || undefined}
                    key={day.date}
                    disabled={day.isFuture}
                    title={`${dateLabel} · ${statusLabel}`}
                    aria-label={`${dateLabel}，${statusLabel}`}
                    onClick={() => onSelect(day.date)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
