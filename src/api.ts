import type { AppMeta, DaySpend, YearSpend } from './domain'

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  let response: Response

  try {
    response = await fetch(path, { signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('读取 Bills 超时，请确认账本可以正常校验', { cause: error })
    }
    throw new Error('无法连接 Flux 数据服务，请使用 pnpm dev 启动项目', { cause: error })
  } finally {
    window.clearTimeout(timeout)
  }

  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) throw new Error(payload?.error ?? `请求失败（${response.status}）`)
  return payload as T
}

export function fetchMeta(): Promise<AppMeta> {
  return request('/api/meta')
}

export function fetchYear(year: number): Promise<YearSpend> {
  return request(`/api/days?year=${year}`)
}

export function fetchDay(date: string): Promise<DaySpend> {
  return request(`/api/days/${date}`)
}
