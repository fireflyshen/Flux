import { useMemo, useState } from 'react'
import {
  accrualAmountOf,
  amountOf,
  behaviorAmountOf,
  behaviorDetailAvailable,
  behaviorGrossAmountOf,
  formatDate,
  formatMoney,
  fromDateKey,
  isAccrualTransaction,
  quantileThresholds,
  transactionAmountOf,
  type ExpenseCategory,
  type YearSpend,
} from '../domain'
import { DrawerShell } from './DrawerShell'
import { PixelLoader } from './PixelLoader'

type Period = 'week' | 'month' | 'quarter' | 'year'

const weekdayCopy = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

interface ReportPanelProps {
  year: number
  report: YearSpend | null
  currency: string
  loading: boolean
  error: string | null
  onRetry: () => void
}

const periodCopy: Record<Period, string> = { week: '周', month: '月', quarter: '季度', year: '年' }

function yearAnchor(year: number) {
  const now = new Date()
  return year === now.getFullYear() ? now : new Date(year, 11, 31, 12)
}

function periodRange(period: Period, anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12)
  const end = new Date(start)
  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 6)
  } else if (period === 'month') {
    start.setDate(1)
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0)
  } else if (period === 'quarter') {
    const firstMonth = Math.floor(start.getMonth() / 3) * 3
    start.setMonth(firstMonth, 1)
    end.setFullYear(start.getFullYear(), firstMonth + 3, 0)
  } else {
    start.setMonth(0, 1)
    end.setFullYear(start.getFullYear(), 11, 31)
  }
  return { start, end }
}

function shiftAnchor(anchor: Date, period: Period, amount: number) {
  const next = new Date(anchor)
  if (period === 'week') next.setDate(next.getDate() + amount * 7)
  if (period === 'month') next.setMonth(next.getMonth() + amount)
  if (period === 'quarter') next.setMonth(next.getMonth() + amount * 3)
  return next
}

function rangeLabel(period: Period, start: Date, end: Date) {
  if (period === 'year') return `${start.getFullYear()} 年`
  if (period === 'quarter') return `${start.getFullYear()} 年第 ${Math.floor(start.getMonth() / 3) + 1} 季度`
  if (period === 'month') return `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`
  const format = (date: Date) => `${date.getMonth() + 1}.${date.getDate()}`
  return `${format(start)} — ${format(end)}`
}

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 6 6 6-6 6'} /></svg>
}

export function ReportPanel({ year, report, currency, loading, error, onRetry }: ReportPanelProps) {
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(() => yearAnchor(year))
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
  const { start, end } = periodRange(period, anchor)

  const analysis = useMemo(() => {
    const days = (report?.days ?? []).filter((day) => {
      const date = fromDateKey(day.date)
      return date >= start && date <= end
    })
    const total = days.reduce((sum, day) => sum + amountOf(day, currency), 0)
    const gross = days.reduce((sum, day) => sum + amountOf(day, currency, 'gross'), 0)
    const refunds = days.reduce((sum, day) => sum + amountOf(day, currency, 'refunds'), 0)
    const behaviorNetTotal = days.reduce((sum, day) => sum + behaviorAmountOf(day, currency), 0)
    const behaviorGrossTotal = days.reduce((sum, day) => sum + behaviorGrossAmountOf(day, currency), 0)
    const behaviorRefunds = days.reduce((sum, day) => sum + behaviorAmountOf(day, currency, 'refunds'), 0)
    const accrualTotal = days.reduce((sum, day) => sum + accrualAmountOf(day, currency), 0)
    const behaviorAvailable = days.every((day) => behaviorDetailAvailable(day, currency))
    const spendDays = days.filter((day) => behaviorGrossAmountOf(day, currency) > 0).length
    const today = new Date()
    const visibleEnd = end < today ? end : today
    const elapsedDays = visibleEnd < start ? 0 : Math.floor((visibleEnd.getTime() - start.getTime()) / 86_400_000) + 1
    const weekdayOccurrences = Array<number>(7).fill(0)
    if (visibleEnd >= start) {
      const cursor = new Date(start)
      while (cursor <= visibleEnd) {
        weekdayOccurrences[cursor.getDay()] += 1
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    const categories = new Map<string, ExpenseCategory & { value: number; grossValue: number; refundValue: number }>()
    for (const day of days) {
      for (const category of day.categories.filter((item) => item.currency === currency)) {
        const row = categories.get(category.account) ?? { ...category, value: 0, grossValue: 0, refundValue: 0 }
        row.value += Number(category.net)
        row.grossValue += Number(category.gross)
        row.refundValue += Number(category.refunds)
        categories.set(category.account, row)
      }
    }
    const categoryRows = [...categories.values()].filter((row) => row.value > 0).sort((a, b) => b.value - a.value)
    const visibleCategories = categoryRows.slice(0, 5)
    const hiddenCategories = categoryRows.slice(5)
    if (hiddenCategories.length > 0) {
      visibleCategories.push({
        ...hiddenCategories[0],
        account: '__others__',
        name: 'Others · 其他',
        value: hiddenCategories.reduce((sum, row) => sum + row.value, 0),
        grossValue: hiddenCategories.reduce((sum, row) => sum + row.grossValue, 0),
        refundValue: hiddenCategories.reduce((sum, row) => sum + row.refundValue, 0),
      })
    }
    const categoryTotal = categoryRows.reduce((sum, row) => sum + row.value, 0)
    const weekdayTotals = weekdayCopy.map((name, weekday) => {
      const matchingDays = days.filter((day) => fromDateKey(day.date).getDay() === weekday)
      const grossTotal = matchingDays.reduce((sum, day) => sum + behaviorGrossAmountOf(day, currency), 0)
      const occurrences = weekdayOccurrences[weekday]
      return {
        name,
        grossTotal,
        average: occurrences === 0 ? 0 : grossTotal / occurrences,
        spendDays: matchingDays.filter((day) => behaviorGrossAmountOf(day, currency) > 0).length,
        days: occurrences,
      }
    })
    const weekdayMax = Math.max(...weekdayTotals.map((row) => row.average), 0)
    const peakDay = days.reduce<{ date: string; value: number } | null>((peak, day) => {
      const value = behaviorGrossAmountOf(day, currency)
      return !peak || value > peak.value ? { date: day.date, value } : peak
    }, null)
    const annualHighThreshold = quantileThresholds(report?.days ?? [], currency, behaviorGrossAmountOf)[3] ?? 0
    const highDays = days.filter((day) => behaviorGrossAmountOf(day, currency) > annualHighThreshold && annualHighThreshold > 0).length
    return {
      total,
      behaviorNetTotal,
      behaviorGrossTotal,
      behaviorRefunds,
      behaviorAvailable,
      accrualTotal,
      gross,
      refunds,
      spendDays,
      noSpendDays: Math.max(0, elapsedDays - spendDays),
      dailyAverage: elapsedDays === 0 ? 0 : total / elapsedDays,
      days,
      categoryRows,
      visibleCategories,
      hiddenCategories,
      categoryTotal,
      weekdayTotals,
      weekdayMax,
      peakDay,
      highDays,
    }
  }, [currency, end, report, start])

  const selectedCategory = analysis.visibleCategories.find((row) => row.account === selectedAccount) ?? null
  const selectedTransactions = useMemo(() => {
    if (!selectedAccount) return []
    const selectedAccounts = new Set(selectedAccount === '__others__'
      ? analysis.hiddenCategories.map((category) => category.account)
      : [selectedAccount])
    return analysis.days.flatMap((day) => day.transactions.flatMap((transaction) => {
      const value = transaction.categories
        .filter((category) => selectedAccounts.has(category.account) && category.currency === currency)
        .reduce((sum, category) => sum + Number(category.net), 0)
      return value === 0 ? [] : [{ day: day.date, transaction, value }]
    })).sort((a, b) => b.day.localeCompare(a.day))
  }, [analysis.days, analysis.hiddenCategories, currency, selectedAccount])

  const selectedWeekdayTransactions = useMemo(() => {
    if (selectedWeekday === null) return []
    return analysis.days.flatMap((day) => day.transactions.flatMap((transaction) => {
      if (isAccrualTransaction(transaction)) return []
      const value = transactionAmountOf(transaction, currency, 'gross')
      return value === 0 ? [] : [{ day: day.date, transaction, value }]
    })).filter(({ day }) => fromDateKey(day).getDay() === selectedWeekday)
      .sort((a, b) => b.day.localeCompare(a.day))
  }, [analysis.days, currency, selectedWeekday])

  const selectedWeekdayTotal = selectedWeekdayTransactions.reduce((sum, row) => sum + row.value, 0)

  const canShift = (amount: number) => period !== 'year' && shiftAnchor(anchor, period, amount).getFullYear() === year
  return (
    <section className="report-panel" aria-label={`${year} 年支出洞察`} data-loading={loading || undefined}>
      <div className="report-toolbar">
        <div className="period-switch" role="group" aria-label="报表周期">
          {(Object.keys(periodCopy) as Period[]).map((value) => (
            <button type="button" key={value} data-active={period === value || undefined} aria-pressed={period === value} onClick={() => setPeriod(value)}>{periodCopy[value]}</button>
          ))}
        </div>
        <div className="period-navigation">
          <button type="button" disabled={!canShift(-1)} aria-label="上一周期" onClick={() => setAnchor(shiftAnchor(anchor, period, -1))}><Arrow direction="left" /></button>
          <span aria-live="polite">{rangeLabel(period, start, end)}</span>
          <button type="button" disabled={!canShift(1)} aria-label="下一周期" onClick={() => setAnchor(shiftAnchor(anchor, period, 1))}><Arrow direction="right" /></button>
        </div>
      </div>

      {loading && !report ? (
        <div className="report-empty"><PixelLoader /></div>
      ) : error ? (
        <div className="report-empty"><button type="button" onClick={onRetry} title={error}>账本读取失败 · 重试</button></div>
      ) : analysis.categoryRows.length > 0 ? (
        <>
          <div className="metric-grid" aria-label="周期摘要">
            <article><span>期间成本</span><strong>{formatMoney(analysis.total, currency)}</strong><small>{analysis.refunds > 0 ? `已抵扣退款 ${formatMoney(analysis.refunds, currency)}` : `总支出 ${formatMoney(analysis.gross, currency)}`}</small></article>
            <article><span>期间日均</span><strong>{formatMoney(analysis.dailyAverage, currency)}</strong><small>按已过去的自然日计算</small></article>
            <article><span>行为峰值</span><strong>{formatMoney(analysis.peakDay?.value ?? 0, currency)}</strong><small>{analysis.peakDay ? `${Number(analysis.peakDay.date.slice(5, 7))} 月 ${Number(analysis.peakDay.date.slice(8, 10))} 日` : '这一周期暂无支出'}</small></article>
          </div>
          <p className="report-scope-note">{analysis.behaviorAvailable ? <>行为毛支出 {formatMoney(analysis.behaviorGrossTotal, currency)} · 退款 {formatMoney(analysis.behaviorRefunds, currency)} · 行为净支出 {formatMoney(analysis.behaviorNetTotal, currency)} · 非现金摊销/计提 {formatMoney(analysis.accrualTotal, currency)}</> : <>缺少交易明细，行为支出口径暂不可用；期间成本仍按原始汇总展示</>}</p>
          <section className="weekday-report" aria-labelledby="weekday-report-title">
            <div className="report-section-heading">
              <div><div id="weekday-report-title" className="report-section-label">星期几更容易花钱</div><small>平均行为毛支出 · 同时显示消费频率</small></div>
              <span>{analysis.weekdayTotals.reduce((best, row) => row.average > best.average ? row : best, analysis.weekdayTotals[0]).name}最高</span>
            </div>
            <div className="weekday-bars">
              {analysis.weekdayTotals.map((row, weekday) => (
                <button className="weekday-row" type="button" key={row.name} data-top={row.average === analysis.weekdayMax && row.average > 0 || undefined} onClick={() => setSelectedWeekday(weekday)} aria-haspopup="dialog">
                  <span className="weekday-name">{row.name}</span>
                  <div className="weekday-track"><i style={{ width: `${analysis.weekdayMax <= 0 ? 0 : row.average / analysis.weekdayMax * 100}%` }} /></div>
                  <span className="weekday-value">{formatMoney(row.average, currency)}</span>
                  <small>{row.spendDays}/{row.days} 天 · {row.days === 0 ? 0 : Math.round(row.spendDays / row.days * 100)}%</small>
                </button>
              ))}
            </div>
          </section>
          <div className="report-section-heading">
            <div><div className="report-section-label">支出结构</div><small>{analysis.spendDays} 个支出日 · {analysis.noSpendDays} 个无支出日</small></div>
            <span>前五类 + Others</span>
          </div>
          <div className="composition-bar" aria-label="分类支出占比">
            {analysis.visibleCategories.map((row, index) => <i key={row.account} data-tone={index} style={{ width: `${analysis.categoryTotal <= 0 ? 0 : row.value / analysis.categoryTotal * 100}%` }} />)}
          </div>
          <div className="category-summary-grid">
            {analysis.visibleCategories.map((row, index) => (
              <button className="category-summary" type="button" key={row.account} onClick={() => setSelectedAccount(row.account)} aria-haspopup="dialog">
                <i data-tone={index} aria-hidden="true" />
                <div><strong>{row.name}</strong><small>{formatMoney(row.value, currency)}</small></div>
                <span>{analysis.categoryTotal <= 0 ? '0%' : `${Math.round(row.value / analysis.categoryTotal * 100)}%`}</span>
              </button>
            ))}
          </div>
        </>
      ) : <div className="report-empty">这一周期没有 {currency} 支出</div>}

      <footer className="report-footnote">星期与峰值按行为毛支出，排除摊销/计提；期间成本保留全部费用<span aria-hidden="true">·</span>{analysis.highDays} 个高于年度日常区间的支出日</footer>

      {selectedCategory && (
        <DrawerShell labelledBy="report-drawer-title" closeLabel="关闭分类明细" onClosed={() => setSelectedAccount(null)}>
          <div className="drawer-content report-detail-content">
            <div className="page-heading report-detail-heading">
              <span className="eyebrow">{rangeLabel(period, start, end)}</span>
              <h2 id="report-drawer-title">{selectedCategory.name}</h2>
              <div className="page-meta"><strong>{formatMoney(selectedCategory.value, currency)}</strong><span>{selectedTransactions.length} 笔交易</span></div>
            </div>
            <section aria-labelledby="report-transaction-title">
              <div className="drawer-section-heading"><h3 id="report-transaction-title">具体明细</h3><span>按日期倒序</span></div>
              <div className="transaction-list report-transaction-list">
                {selectedTransactions.map(({ day, transaction, value }) => (
                  <article className="transaction-row report-transaction-row" key={`${day}-${transaction.id}`}>
                    <time dateTime={day}>{formatDate(day)}</time>
                    <div><strong>{transaction.payee || transaction.narration || '未命名交易'}</strong>{transaction.payee && transaction.narration && <small>{transaction.narration}</small>}</div>
                    <span>{formatMoney(value, currency)}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </DrawerShell>
      )}

      {selectedWeekday !== null && (
        <DrawerShell labelledBy="weekday-drawer-title" closeLabel="关闭星期明细" onClosed={() => setSelectedWeekday(null)}>
          <div className="drawer-content report-detail-content">
            <div className="page-heading report-detail-heading">
              <span className="eyebrow">{rangeLabel(period, start, end)}</span>
              <h2 id="weekday-drawer-title">{weekdayCopy[selectedWeekday]}消费明细</h2>
              <div className="page-meta"><strong>行为毛支出 {formatMoney(selectedWeekdayTotal, currency)}</strong><span>{selectedWeekdayTransactions.length} 笔交易</span></div>
            </div>
            <section aria-labelledby="weekday-transaction-title">
              <div className="drawer-section-heading"><h3 id="weekday-transaction-title">具体明细</h3><span>按日期倒序</span></div>
              <div className="transaction-list report-transaction-list">
                {selectedWeekdayTransactions.length === 0 ? <div className="drawer-empty">这一周期没有该星期的支出</div> : selectedWeekdayTransactions.map(({ day, transaction, value }) => (
                  <article className="transaction-row report-transaction-row" key={`${day}-${transaction.id}`}>
                    <time dateTime={day}>{formatDate(day)}</time>
                    <div><strong>{transaction.payee || transaction.narration || '未命名交易'}</strong>{transaction.payee && transaction.narration && <small>{transaction.narration}</small>}</div>
                    <span>{formatMoney(value, currency)}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </DrawerShell>
      )}
    </section>
  )
}
