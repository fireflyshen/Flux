import { useMemo, useRef, useState } from 'react'
import { behaviorAmountOf, behaviorDetailAvailable, formatDate, formatMoney, isAccrualTransaction, type DaySpend, type ExpenseCategory } from '../domain'
import { DrawerShell } from './DrawerShell'
import { PixelLoader } from './PixelLoader'

interface DayDrawerProps {
  date: string
  day: DaySpend | null
  currency: string
  median: number
  loading: boolean
  error: string | null
  onClosed: () => void
}

function comparisonCopy(amount: number, median: number) {
  if (amount <= 0) return '这一天没有净支出'
  if (median <= 0) return '还没有足够记录形成日常基线'
  const difference = Math.round(Math.abs(amount / median - 1) * 100)
  if (amount > median * 1.12) return `比当年典型支出高 ${difference}%`
  if (amount < median * .88) return `比当年典型支出低 ${difference}%`
  return '接近当年的典型日常支出'
}

export function DayDrawer({ date, day, currency, median, loading, error, onClosed }: DayDrawerProps) {
  const [mobileSection, setMobileSection] = useState<'categories' | 'transactions'>('categories')
  const contentRef = useRef<HTMLDivElement>(null)
  const detailAvailable = behaviorDetailAvailable(day ?? undefined, currency)

  const transactions = useMemo(() => day?.transactions.filter((item) => item.amounts[currency] && !isAccrualTransaction(item)) ?? [], [currency, day])
  const categories = useMemo(() => {
    if (!day) return []
    if (day.transactions.length === 0) return []
    const rows = new Map<string, ExpenseCategory>()
    for (const transaction of transactions) {
      for (const category of transaction.categories.filter((item) => item.currency === currency)) {
        const current = rows.get(category.account)
        if (!current) rows.set(category.account, { ...category })
        else {
          current.gross = String(Number(current.gross) + Number(category.gross))
          current.refunds = String(Number(current.refunds) + Number(category.refunds))
          current.net = String(Number(current.net) + Number(category.net))
        }
      }
    }
    return [...rows.values()].sort((a, b) => Number(b.gross) - Number(a.gross))
  }, [currency, day, transactions])
  const net = behaviorAmountOf(day ?? undefined, currency)
  const gross = behaviorAmountOf(day ?? undefined, currency, 'gross')
  const refunds = behaviorAmountOf(day ?? undefined, currency, 'refunds')
  const maxCategory = Math.max(0, ...categories.map((item) => Number(item.gross)))

  const showMobileSection = (section: 'categories' | 'transactions') => {
    setMobileSection(section)
    window.requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  return (
    <DrawerShell labelledBy="drawer-title" closeLabel="关闭日期详情" onClosed={onClosed}>
        {day ? (
          <div className="drawer-content" ref={contentRef} data-mobile-section={mobileSection}>
            <div className="page-heading spend-heading">
              <span className="eyebrow">{formatDate(day.date || date)}</span>
              <h2 id="drawer-title">{detailAvailable ? formatMoney(gross, currency) : '行为口径不可用'}</h2>
              <div className="page-meta"><strong>{detailAvailable ? comparisonCopy(gross, median) : '这一天缺少交易明细'}</strong>{detailAvailable && <span>退款 {formatMoney(refunds, currency)} · 净支出 {formatMoney(net, currency)}</span>}</div>
            </div>

            <nav className="mobile-section-switch" aria-label="日期内容">
              <button type="button" data-active={mobileSection === 'categories'} onClick={() => showMobileSection('categories')}>分类 <span>{categories.length}</span></button>
              <button type="button" data-active={mobileSection === 'transactions'} onClick={() => showMobileSection('transactions')}>交易 <span>{transactions.length}</span></button>
            </nav>

            <section className="spend-category-section" aria-labelledby="category-title">
              <div className="drawer-section-heading"><h3 id="category-title">行为支出分类</h3><span>{categories.length} 类</span></div>
              {categories.length > 0 ? <div className="category-list">{categories.map((category) => {
                const value = Number(category.gross)
                return <article className="category-row" key={category.account}>
                  <div><strong>{category.name}</strong><span>{formatMoney(value, currency)}</span></div>
                  <div className="report-bar" aria-hidden="true"><i style={{ width: `${maxCategory <= 0 ? 0 : Math.max(0, value) / maxCategory * 100}%` }} /></div>
                </article>
              })}</div> : <p className="drawer-empty">这一天没有 {currency} 支出分类</p>}
            </section>

            <section className="transaction-section" aria-labelledby="transaction-title">
              <div className="drawer-section-heading"><h3 id="transaction-title">交易明细</h3><span>{transactions.length} 笔</span></div>
              {transactions.length > 0 ? <div className="transaction-list">{transactions.map((transaction) => {
                const total = transaction.amounts[currency]
                return <article className="transaction-row" key={transaction.id}>
                  <div><strong>{transaction.payee || transaction.narration || '未命名交易'}</strong>{transaction.payee && transaction.narration && <small>{transaction.narration}</small>}</div>
                  <span>{formatMoney(total.net, currency)}</span>
                </article>
              })}</div> : <p className="drawer-empty">这一天没有 {currency} 支出交易</p>}
            </section>
          </div>
        ) : <div className="drawer-loading">{error && !loading ? <span className="save-error">{error}</span> : <PixelLoader label="正在读取这一天…" />}</div>}
    </DrawerShell>
  )
}
