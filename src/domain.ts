export interface MoneyTotals {
  gross: string
  refunds: string
  net: string
}

export interface ExpenseCategory extends MoneyTotals {
  account: string
  name: string
  currency: string
}

export interface ExpenseTransaction {
  id: string
  payee: string | null
  narration: string
  source: string | null
  amounts: Record<string, MoneyTotals>
  categories: ExpenseCategory[]
}

export interface DaySpend {
  date: string
  totals: Record<string, MoneyTotals>
  categories: ExpenseCategory[]
  transactions: ExpenseTransaction[]
}

export interface YearSpend {
  schemaVersion: number
  year: number
  firstYear: number
  generatedAt: string
  currencies: string[]
  days: DaySpend[]
}

export interface AppMeta {
  firstYear: number
  currencies: string[]
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(fromDateKey(value))
}

export function amountOf(day: DaySpend | undefined, currency: string, field: keyof MoneyTotals = 'net'): number {
  return Number(day?.totals[currency]?.[field] ?? 0)
}

export function formatMoney(value: number | string, currency: string, maximumFractionDigits = 2): string {
  const amount = typeof value === 'number' ? value : Number(value)
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits,
    }).format(amount)
  } catch {
    return `${amount.toFixed(maximumFractionDigits)} ${currency}`
  }
}

export function quantileThresholds(days: DaySpend[], currency: string): number[] {
  const values = days
    .map((day) => amountOf(day, currency))
    .filter((amount) => amount > 0)
    .sort((a, b) => a - b)

  if (values.length === 0) return [0, 0, 0, 0]
  return [.2, .4, .6, .8].map((ratio) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))])
}

export function scoreLevel(amount: number, thresholds: number[]): number {
  if (amount <= 0) return 0
  const index = thresholds.findIndex((threshold) => amount <= threshold)
  return index === -1 ? 5 : index + 1
}

export function medianDailySpend(days: DaySpend[], currency: string): number {
  const values = days
    .map((day) => amountOf(day, currency))
    .filter((amount) => amount > 0)
    .sort((a, b) => a - b)
  if (values.length === 0) return 0
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle]
}

export function emptyDay(date: string): DaySpend {
  return { date, totals: {}, categories: [], transactions: [] }
}
