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
  transactionAmountOf,
  type DaySpend,
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

function daysInRange(days: DaySpend[], start: Date, end: Date) {
  return days.filter((day) => {
    const date = fromDateKey(day.date)
    return date >= start && date <= end
  })
}

function behaviorCategories(days: DaySpend[], currency: string) {
  const rows = new Map<string, { account: string; name: string; value: number; transactionCount: number }>()
  for (const day of days) {
    for (const transaction of day.transactions.filter((item) => !isAccrualTransaction(item))) {
      const transactionAccounts = new Set<string>()
      for (const category of transaction.categories.filter((item) => item.currency === currency)) {
        const row = rows.get(category.account) ?? { account: category.account, name: category.name, value: 0, transactionCount: 0 }
        row.value += Number(category.gross)
        rows.set(category.account, row)
        if (Number(category.gross) !== 0) transactionAccounts.add(category.account)
      }
      for (const account of transactionAccounts) {
        const row = rows.get(account)
        if (row) row.transactionCount += 1
      }
    }
  }
  return rows
}

export function ReportPanel({ year, report, currency, loading, error, onRetry }: ReportPanelProps) {
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(() => yearAnchor(year))
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [selectedAccountScope, setSelectedAccountScope] = useState<'behavior' | 'cost'>('cost')
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
  const [openSection, setOpenSection] = useState<'weekday' | 'structure' | null>(null)
  const { start, end } = periodRange(period, anchor)

  const analysis = useMemo(() => {
    const reportDays = report?.days ?? []
    const days = daysInRange(reportDays, start, end)
    const total = days.reduce((sum, day) => sum + amountOf(day, currency), 0)
    const refunds = days.reduce((sum, day) => sum + amountOf(day, currency, 'refunds'), 0)
    const behaviorNetTotal = days.reduce((sum, day) => sum + behaviorAmountOf(day, currency), 0)
    const behaviorGrossTotal = days.reduce((sum, day) => sum + behaviorGrossAmountOf(day, currency), 0)
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

    const comparisonMonths: { days: DaySpend[]; total: number; spendDays: number }[] = []
    if (period === 'month' && elapsedDays > 0) {
      for (let offset = 1; offset <= 3; offset += 1) {
        const baselineStart = new Date(start.getFullYear(), start.getMonth() - offset, 1, 12)
        if (baselineStart.getFullYear() !== year) continue
        const baselineLastDay = new Date(baselineStart.getFullYear(), baselineStart.getMonth() + 1, 0, 12).getDate()
        const baselineEnd = new Date(baselineStart.getFullYear(), baselineStart.getMonth(), Math.min(elapsedDays, baselineLastDay), 12)
        const baselineDays = daysInRange(reportDays, baselineStart, baselineEnd)
        if (!baselineDays.every((day) => behaviorDetailAvailable(day, currency))) continue
        comparisonMonths.push({
          days: baselineDays,
          total: baselineDays.reduce((sum, day) => sum + behaviorGrossAmountOf(day, currency), 0),
          spendDays: baselineDays.filter((day) => behaviorGrossAmountOf(day, currency) > 0).length,
        })
      }
    }

    const baselineAverage = comparisonMonths.length === 0 ? null : comparisonMonths.reduce((sum, month) => sum + month.total, 0) / comparisonMonths.length
    const difference = baselineAverage === null ? null : behaviorGrossTotal - baselineAverage
    const differenceRate = baselineAverage && difference !== null ? difference / baselineAverage : null
    const baselineSpendDays = comparisonMonths.length === 0
      ? null
      : comparisonMonths.reduce((sum, month) => sum + month.spendDays, 0) / comparisonMonths.length
    const baselineSpendDayCount = comparisonMonths.reduce((sum, month) => sum + month.spendDays, 0)
    const baselineSpendDayAmount = comparisonMonths.length === 0 || baselineSpendDayCount === 0
      ? null
      : comparisonMonths.reduce((sum, month) => sum + month.total, 0)
        / baselineSpendDayCount
    const spendDayAmount = spendDays === 0 ? 0 : behaviorGrossTotal / spendDays
    const spendDaysDifference = baselineSpendDays === null ? null : spendDays - baselineSpendDays
    const spendDayAmountRate = baselineSpendDayAmount && baselineSpendDayAmount > 0
      ? (spendDayAmount - baselineSpendDayAmount) / baselineSpendDayAmount
      : null
    const currentBehaviorCategories = behaviorCategories(days, currency)
    const baselineCategoryTotals = new Map<string, { name: string; value: number }>()
    for (const month of comparisonMonths) {
      for (const row of behaviorCategories(month.days, currency).values()) {
        const totalRow = baselineCategoryTotals.get(row.account) ?? { name: row.name, value: 0 }
        totalRow.value += row.value
        baselineCategoryTotals.set(row.account, totalRow)
      }
    }
    const driverAccounts = new Set([...currentBehaviorCategories.keys(), ...baselineCategoryTotals.keys()])
    const drivers = [...driverAccounts].map((account) => {
      const current = currentBehaviorCategories.get(account)
      const baseline = baselineCategoryTotals.get(account)
      return {
        account,
        name: current?.name ?? baseline?.name ?? account,
        currentValue: current?.value ?? 0,
        transactionCount: current?.transactionCount ?? 0,
        difference: (current?.value ?? 0) - (baseline?.value ?? 0) / Math.max(1, comparisonMonths.length),
      }
    }).filter((row) => Math.abs(row.difference) >= .01)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      .slice(0, 2)
    return {
      total,
      behaviorNetTotal,
      behaviorGrossTotal,
      behaviorAvailable,
      accrualTotal,
      refunds,
      spendDays,
      days,
      categoryRows,
      visibleCategories,
      hiddenCategories,
      categoryTotal,
      weekdayTotals,
      weekdayMax,
      comparisonMonths: comparisonMonths.length,
      baselineAverage,
      difference,
      differenceRate,
      spendDaysDifference,
      spendDayAmountRate,
      drivers,
    }
  }, [currency, end, period, report, start, year])

  const comparisonCopy = period !== 'month' || analysis.comparisonMonths === 0
    ? null
    : analysis.baselineAverage === 0
      ? analysis.behaviorGrossTotal > 0 ? '本期新增' : '保持为零'
      : analysis.differenceRate !== null && Math.abs(analysis.differenceRate) < .02
        ? '基本持平'
        : `${(analysis.difference ?? 0) > 0 ? '↑' : '↓'} ${Math.round(Math.abs(analysis.differenceRate ?? 0) * 100)}%`
  const comparisonTone = (analysis.difference ?? 0) > 0 ? 'up' : (analysis.difference ?? 0) < 0 ? 'down' : 'flat'
  const spendDaysCopy = analysis.spendDaysDifference === null
    ? null
    : Math.abs(analysis.spendDaysDifference) < .5
      ? '支出日持平'
      : `支出日 ${analysis.spendDaysDifference > 0 ? '+' : '−'}${Math.round(Math.abs(analysis.spendDaysDifference))} 天`
  const spendDayAmountCopy = analysis.spendDayAmountRate === null
    ? null
    : Math.abs(analysis.spendDayAmountRate) < .02
      ? '支出日均额持平'
      : `支出日均额 ${analysis.spendDayAmountRate > 0 ? '+' : '−'}${Math.round(Math.abs(analysis.spendDayAmountRate) * 100)}%`
  const topWeekday = analysis.weekdayTotals.reduce((best, row) => row.average > best.average ? row : best, analysis.weekdayTotals[0])
  const topCategory = analysis.visibleCategories[0]

  const selectedCategory = selectedAccountScope === 'behavior'
    ? analysis.drivers.find((row) => row.account === selectedAccount) ?? null
    : analysis.visibleCategories.find((row) => row.account === selectedAccount) ?? null
  const selectedTransactions = useMemo(() => {
    if (!selectedAccount) return []
    const selectedAccounts = new Set(selectedAccount === '__others__'
      ? analysis.hiddenCategories.map((category) => category.account)
      : [selectedAccount])
    return analysis.days.flatMap((day) => day.transactions.flatMap((transaction) => {
      if (selectedAccountScope === 'behavior' && isAccrualTransaction(transaction)) return []
      const value = transaction.categories
        .filter((category) => selectedAccounts.has(category.account) && category.currency === currency)
        .reduce((sum, category) => sum + Number(selectedAccountScope === 'behavior' ? category.gross : category.net), 0)
      return value === 0 ? [] : [{ day: day.date, transaction, value }]
    })).sort((a, b) => b.day.localeCompare(a.day))
  }, [analysis.days, analysis.hiddenCategories, currency, selectedAccount, selectedAccountScope])

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
          <section className="report-balance" aria-label="周期核心数据">
            <article>
              <div><span>行为支出</span><small>{analysis.behaviorAvailable ? `${analysis.spendDays} 个支出日 · 净支出 ${formatMoney(analysis.behaviorNetTotal, currency)}` : '缺少交易明细，未使用期间成本代替'}</small></div>
              <div className="report-figure">
                <strong>{analysis.behaviorAvailable ? formatMoney(analysis.behaviorGrossTotal, currency) : '—'}</strong>
                {comparisonCopy && <em data-tone={comparisonTone}>{comparisonCopy}</em>}
              </div>
            </article>
            <article>
              <div><span>期间成本</span><small>含非现金成本 {formatMoney(analysis.accrualTotal, currency)}{analysis.refunds > 0 ? ` · 退款 ${formatMoney(analysis.refunds, currency)}` : ''}</small></div>
              <div className="report-figure"><strong>{formatMoney(analysis.total, currency)}</strong></div>
            </article>
          </section>

          {analysis.behaviorAvailable && analysis.comparisonMonths > 0 && (spendDaysCopy || spendDayAmountCopy || analysis.drivers.length > 0) && (
            <section className="change-summary" aria-labelledby="change-summary-title">
              <div className="quiet-heading"><span id="change-summary-title">主要变化</span><small>较近 {analysis.comparisonMonths} 个月同期</small></div>
              {(spendDaysCopy || spendDayAmountCopy) && <p className="change-factors">{[spendDaysCopy, spendDayAmountCopy].filter(Boolean).join(' · ')}</p>}
              {analysis.drivers.length > 0 && (
                <div className="change-list">
                  {analysis.drivers.map((driver) => (
                    <button type="button" key={driver.account} onClick={() => { setSelectedAccountScope('behavior'); setSelectedAccount(driver.account) }} aria-haspopup="dialog">
                      <span><strong>{driver.name}</strong><small>{driver.transactionCount > 0 ? `本期 ${formatMoney(driver.currentValue, currency)} · ${driver.transactionCount} 笔` : '本期无支出'}</small></span>
                      <em data-tone={driver.difference > 0 ? 'up' : 'down'}>{driver.difference > 0 ? '+' : ''}{formatMoney(driver.difference, currency)}</em>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="report-disclosures">
            <section>
              <button type="button" className="disclosure-trigger" aria-expanded={openSection === 'weekday'} onClick={() => setOpenSection((current) => current === 'weekday' ? null : 'weekday')}>
                <div><strong>消费习惯</strong><small>{topWeekday.name}平均 {formatMoney(topWeekday.average, currency)} · {topWeekday.spendDays}/{topWeekday.days} 天消费</small></div>
                <span>{openSection === 'weekday' ? '收起' : '查看'}</span>
              </button>
              <div className="disclosure-body" data-open={openSection === 'weekday' || undefined}>
                <div><div className="weekday-bars">
                  {analysis.weekdayTotals.map((row, weekday) => (
                    <button className="weekday-row" type="button" key={row.name} data-top={row.average === analysis.weekdayMax && row.average > 0 || undefined} onClick={() => setSelectedWeekday(weekday)} aria-haspopup="dialog">
                      <span className="weekday-name">{row.name}</span>
                      <div className="weekday-track"><i style={{ width: `${analysis.weekdayMax <= 0 ? 0 : row.average / analysis.weekdayMax * 100}%` }} /></div>
                      <span className="weekday-value">{formatMoney(row.average, currency)}</span>
                      <small>{row.spendDays}/{row.days} 天 · {row.days === 0 ? 0 : Math.round(row.spendDays / row.days * 100)}%</small>
                    </button>
                  ))}
                </div></div>
              </div>
            </section>
            <section>
              <button type="button" className="disclosure-trigger" aria-expanded={openSection === 'structure'} onClick={() => setOpenSection((current) => current === 'structure' ? null : 'structure')}>
                <div><strong>期间成本结构</strong><small>{topCategory ? `${topCategory.name} · ${Math.round(topCategory.value / analysis.categoryTotal * 100)}%` : '暂无分类'}</small></div>
                <span>{openSection === 'structure' ? '收起' : '查看'}</span>
              </button>
              <div className="disclosure-body" data-open={openSection === 'structure' || undefined}>
                <div>
                  <div className="composition-bar" aria-label="分类支出占比">
                    {analysis.visibleCategories.map((row, index) => <i key={row.account} data-tone={index} style={{ width: `${analysis.categoryTotal <= 0 ? 0 : row.value / analysis.categoryTotal * 100}%` }} />)}
                  </div>
                  <div className="category-summary-grid">
                    {analysis.visibleCategories.map((row, index) => (
                      <button className="category-summary" type="button" key={row.account} onClick={() => { setSelectedAccountScope('cost'); setSelectedAccount(row.account) }} aria-haspopup="dialog">
                        <i data-tone={index} aria-hidden="true" />
                        <div><strong>{row.name}</strong><small>{formatMoney(row.value, currency)}</small></div>
                        <span>{analysis.categoryTotal <= 0 ? '0%' : `${Math.round(row.value / analysis.categoryTotal * 100)}%`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : <div className="report-empty">这一周期没有 {currency} 支出</div>}

      <footer className="report-footnote">行为口径排除摊销与计提 · 期间成本保留全部费用</footer>

      {selectedCategory && (
        <DrawerShell labelledBy="report-drawer-title" closeLabel="关闭分类明细" onClosed={() => setSelectedAccount(null)}>
          <div className="drawer-content report-detail-content">
            <div className="page-heading report-detail-heading">
              <span className="eyebrow">{rangeLabel(period, start, end)}</span>
              <h2 id="report-drawer-title">{selectedCategory.name}</h2>
              <div className="page-meta"><strong>{formatMoney('currentValue' in selectedCategory ? selectedCategory.currentValue : selectedCategory.value, currency)}</strong><span>{selectedTransactions.length} 笔交易</span></div>
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
