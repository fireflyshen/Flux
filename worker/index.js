const SNAPSHOT_KEY = 'current.json'

function json(payload, status = 200, version = '') {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  if (version) headers.set('X-Flux-Snapshot', version.slice(0, 16))
  return new Response(JSON.stringify(payload), { status, headers })
}

async function readSnapshot(env) {
  const object = await env.FLUX_DATA.get(SNAPSHOT_KEY)
  if (!object) return null
  return object.json()
}

function emptyYear(snapshot, year) {
  return {
    schemaVersion: snapshot.schemaVersion ?? 1,
    year,
    firstYear: snapshot.firstYear,
    generatedAt: snapshot.generatedAt,
    currencies: snapshot.currencies ?? [],
    days: [],
  }
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() + 1 === Number(match[2])
    && parsed.getUTCDate() === Number(match[3])
}

async function handleApi(request, env, url) {
  if (request.method !== 'GET') return json({ error: 'Flux 只提供只读账本接口' }, 405)
  const snapshot = await readSnapshot(env)
  if (!snapshot) return json({ error: 'R2 中还没有 Flux 数据快照' }, 503)
  const version = snapshot.version ?? ''

  if (url.pathname === '/api/meta') {
    return json({ firstYear: snapshot.firstYear, currencies: snapshot.currencies ?? [], generatedAt: snapshot.generatedAt, version }, 200, version)
  }

  if (url.pathname === '/api/days' || url.pathname === '/api/reports') {
    const year = Number(url.searchParams.get('year'))
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return json({ error: '年份无效' }, 400, version)
    return json(snapshot.years?.[String(year)] ?? emptyYear(snapshot, year), 200, version)
  }

  const date = url.pathname.startsWith('/api/days/') ? url.pathname.slice('/api/days/'.length) : ''
  if (date) {
    if (!validDate(date)) return json({ error: '日期无效' }, 400, version)
    const yearData = snapshot.years?.[date.slice(0, 4)] ?? emptyYear(snapshot, Number(date.slice(0, 4)))
    return json(yearData.days.find((day) => day.date === date) ?? { date, totals: {}, categories: [], transactions: [] }, 200, version)
  }

  if (url.pathname === '/api/health') return json({ ok: true, generatedAt: snapshot.generatedAt, version }, 200, version)
  return json({ error: '接口不存在' }, 404, version)
}

function secureAsset(response) {
  const headers = new Headers(response.headers)
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url)
      return secureAsset(await env.ASSETS.fetch(request))
    } catch (error) {
      console.error('Flux request failed', error)
      return json({ error: '暂时无法读取账本快照' }, 500)
    }
  },
}
