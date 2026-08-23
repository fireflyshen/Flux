import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST_DIR = join(ROOT_DIR, 'dist')
const LEDGER = resolve(process.env.BILLS_LEDGER || join(ROOT_DIR, '..', '..', '..', 'flowspace', 'Bills', 'main.bean'))
const EXPORTER = resolve(process.env.BILLS_EXPORTER || join(LEDGER, '..', 'tools', 'export_flux_snapshot.py'))
const PYTHON = process.env.FLUX_PYTHON || '/Users/enmu/.local/pipx/venvs/fava/bin/python'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT || (IS_PRODUCTION ? 4173 : 5173))
const HOST = process.env.HOST || '127.0.0.1'
const cache = new Map()

async function runExporter(key, args) {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.createdAt < 10_000) return cached.value
  const { stdout } = await execFileAsync(PYTHON, [EXPORTER, '--ledger', LEDGER, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 20_000,
  })
  const value = JSON.parse(stdout)
  cache.set(key, { createdAt: Date.now(), value })
  return value
}

async function readYear(year) {
  return runExporter(`year:${year}`, ['--year', String(year)])
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

async function handleApi(request, response, url) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Flux 只提供只读账本接口' })

  if (url.pathname === '/api/meta') {
    return sendJson(response, 200, await runExporter('meta', ['--meta']))
  }

  if (url.pathname === '/api/days' || url.pathname === '/api/reports') {
    const year = Number(url.searchParams.get('year'))
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return sendJson(response, 400, { error: '年份无效' })
    return sendJson(response, 200, await readYear(year))
  }

  const match = /^\/api\/days\/(\d{4})-(\d{2})-(\d{2})$/.exec(url.pathname)
  if (match) {
    const date = `${match[1]}-${match[2]}-${match[3]}`
    const parsed = new Date(`${date}T12:00:00`)
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== Number(match[1]) || parsed.getMonth() + 1 !== Number(match[2]) || parsed.getDate() !== Number(match[3])) {
      return sendJson(response, 400, { error: '日期无效' })
    }
    const yearData = await readYear(Number(match[1]))
    return sendJson(response, 200, yearData.days.find((day) => day.date === date) ?? { date, totals: {}, categories: [], transactions: [] })
  }

  return sendJson(response, 404, { error: '接口不存在' })
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveStatic(response, url) {
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }
  const relativePath = normalize(pathname).replace(/^[/\\]+/, '')
  let target = resolve(DIST_DIR, relativePath || 'index.html')
  if (target !== DIST_DIR && !target.startsWith(`${DIST_DIR}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    if (!(await stat(target)).isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    target = join(DIST_DIR, 'index.html')
  }
  const details = await stat(target)
  response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(target)] || 'application/octet-stream', 'Content-Length': details.size })
  createReadStream(target).pipe(response)
}

let vite
if (!IS_PRODUCTION) {
  const { createServer: createViteServer } = await import('vite')
  vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url)
    else if (vite) vite.middlewares(request, response, () => { if (!response.writableEnded) response.writeHead(404).end('Not found') })
    else await serveStatic(response, url)
  } catch (error) {
    console.error(error)
    const detail = error.stderr?.trim()
    const message = detail ? `Bills 账本读取失败：${detail.split('\n').at(-1)}` : error.message || '服务器内部错误'
    if (!response.headersSent) sendJson(response, 500, { error: message })
    else response.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Flux 已启动：http://localhost:${PORT}`)
  console.log(`只读账本：${LEDGER}`)
})
