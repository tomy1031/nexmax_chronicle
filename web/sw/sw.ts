/// <reference lib="webworker" />
// Service Worker（書き出すと dist/sw.js。scripts/vite-pwa-plugin.ts が組み立てて、書き出しの情報 __NX_BUILD__ を先頭に入れる）。
// ・ファイルごとに内容のハッシュを持ち、新しい版を入れるときは、変わったファイルだけダウンロードする（src/pwa/swPlan.ts）
// ・まだ使っていない時代のファイルは、その時代へ行ったときに初めてダウンロードして残す
// ・新しい版は自分からは切り替えない。ページが 'nx-skip-waiting' を送ってきたら切り替える（src/pwa/pwa.ts）
// ・一度ダウンロードしたファイルはキャッシュから出すので、2 回目からは通信しない（オフラインでも動く）
import { fetchUrl, pathInScope, planInstall, transferSize, type BuildInfo, type FileMap, type PreviousCache } from '../src/pwa/swPlan'

declare const __NX_BUILD__: BuildInfo
declare const self: ServiceWorkerGlobalScope

const BUILD = __NX_BUILD__
const PREFIX = 'nexmax-v-'
const CACHE = PREFIX + BUILD.version
/** 版ごとのファイルの表をキャッシュに入れておくときのパス */
const META = '__nexmax_build__.json'

const scope = (): string => self.registration.scope
const keyUrl = (path: string): string => scope() + path.split('/').map(encodeURIComponent).join('/')

async function broadcast(msg: Record<string, unknown>): Promise<void> {
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const c of list) c.postMessage({ type: 'nx-sw', version: BUILD.version, ...msg })
}

/** 取ってきた中身を、URL を持たない素の Response にしてキャッシュに入れる（?v= の付いた URL を残さない） */
async function download(path: string): Promise<Response> {
  const [hash] = BUILD.files[path]
  const res = await fetch(fetchUrl(scope(), path, hash))
  if (!res.ok || res.status !== 200) throw new Error(`${path}: HTTP ${res.status}`)
  const body = await res.blob()
  // 中身の種類だけ写す（content-encoding・content-length は展開前の値なので写さない）
  const headers = new Headers()
  const type = res.headers.get('content-type')
  if (type) headers.set('content-type', type)
  return new Response(body, { status: 200, statusText: 'OK', headers })
}

async function readPrevious(): Promise<PreviousCache[]> {
  // 新しく作った順（keys は作った順なので逆にする）
  const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== CACHE).reverse()
  const out: PreviousCache[] = []
  for (const name of names) {
    const c = await caches.open(name)
    const meta = await c.match(keyUrl(META))
    if (!meta) continue
    let files: FileMap
    try {
      files = ((await meta.json()) as { files: FileMap }).files
    } catch {
      continue
    }
    const cached = new Set<string>()
    for (const req of await c.keys()) {
      const p = pathInScope(scope(), req.url, files)
      if (p) cached.add(p)
    }
    out.push({ name, files, cached })
  }
  return out
}

async function install(): Promise<void> {
  const cache = await caches.open(CACHE)
  const plan = planInstall(BUILD, await readPrevious())
  // 同じ版の入れかけ（前回の途中で止まった）分は飛ばす
  const have = new Set<string>()
  for (const req of await cache.keys()) {
    const p = pathInScope(scope(), req.url, BUILD.files)
    if (p) have.add(p)
  }
  const pre = new Set(BUILD.precache)
  const fetchList = plan.fetch.filter((f) => !have.has(f.path))
  for (const c of plan.copy) {
    if (have.has(c.path)) continue
    const old = await caches.open(c.from)
    const res = await old.match(keyUrl(c.path))
    if (res) await cache.put(keyUrl(c.path), res)
    else if (pre.has(c.path)) fetchList.push({ path: c.path, hash: BUILD.files[c.path][0], size: transferSize(BUILD.files[c.path]) })
  }
  const total = fetchList.reduce((s, f) => s + f.size, 0)
  let done = 0
  await broadcast({ phase: 'download', done, total })
  // 4 本ずつ並べてダウンロード
  let i = 0
  const worker = async (): Promise<void> => {
    while (i < fetchList.length) {
      const f = fetchList[i++]
      try {
        await cache.put(keyUrl(f.path), await download(f.path))
      } catch (e) {
        // 最初に要るファイルが取れなければ入れ直し（次に開いたときにもう一度）。それ以外は使うときに取る
        if (pre.has(f.path)) throw e
      }
      done += f.size
      await broadcast({ phase: 'download', done, total })
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  await cache.put(keyUrl(META), new Response(JSON.stringify({ version: BUILD.version, files: BUILD.files }), { headers: { 'content-type': 'application/json' } }))
  await broadcast({ phase: 'installed', bytes: total })
}

self.addEventListener('install', (e) => {
  e.waitUntil(install())
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const n of await caches.keys()) if (n.startsWith(PREFIX) && n !== CACHE) await caches.delete(n)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (e) => {
  const d = e.data as { type?: string } | null
  if (d?.type === 'nx-skip-waiting') void self.skipWaiting()
})

/** キャッシュにあればそれ、無ければダウンロードして残す */
async function cacheFirst(req: Request, path: string): Promise<Response> {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(keyUrl(path))
  if (hit) return hit
  try {
    const res = await download(path)
    await cache.put(keyUrl(path), res.clone())
    return res
  } catch {
    // ダウンロードできない（オフライン・まだ公開前など）ときはブラウザに任せる
    return fetch(req)
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || req.headers.has('range')) return
  // 表にあるファイルだけ受け持つ（スコープそのもの・?quality= などのクエリ付きのページは、この版の index.html）。
  // 表に無いもの（ほかのサイトのフォントなど）はブラウザに任せる
  const path = pathInScope(scope(), req.url, BUILD.files)
  if (path) e.respondWith(cacheFirst(req, path))
})
