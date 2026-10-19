// Service Worker の「差分ダウンロード」の計画（純粋なロジック。sw/sw.ts と tests/swPlan.test.ts が使う）。
//
// 書き出しのたびに、すべてのファイルの内容のハッシュを sw.js に埋め込む（scripts/vite-pwa-plugin.ts）。
// 新しい版の Service Worker を入れるとき（install）、前の版のキャッシュと見比べて：
//   ・同じハッシュのファイルが手元にある → コピー（通信なし）
//   ・中身が変わったファイルのうち、前に一度ダウンロードしていたもの（名前が変わった JS も、元のソースが同じなら）・
//     最初に要るもの → ダウンロード
//   ・まだ一度も使っていないファイル → 何もしない（その時代へ行ったときに初めてダウンロード）
// つまり、更新のときに通信するのは「変わったファイル」だけ。

/**
 * パス（スコープからの相対。例 'assets/index-abc.js'）→
 * [内容のハッシュ, バイト数, 通信のバイト数（gzip 後。無ければバイト数）, 元のソースの名前（JS・CSS のみ）]
 * 元のソースの名前（例 'src/stages/namba2026/stage.ts'）は、中身が変わってファイル名（ハッシュ入り）が変わっても同じ。
 * 前の版で使っていたステージなら、新しいファイル名でも先にダウンロードしておくのに使う
 */
export type FileEntry = readonly [hash: string, size: number, transfer?: number, source?: string]
export type FileMap = Record<string, FileEntry>

/** 通信のおおよそのバイト数（配信側が gzip する文字のファイルは小さくなる） */
export function transferSize(entry: FileEntry): number {
  return entry[2] ?? entry[1]
}

/** 埋め込む書き出しの情報 */
export type BuildInfo = {
  /** すべてのファイルのハッシュから作った版（キャッシュの名前に使う） */
  version: string
  files: FileMap
  /** 最初に要るファイル（index.html・入口の JS/CSS・アイコンなど）。一度も遊んでいなくても入れておく */
  precache: readonly string[]
}

/** 前の版のキャッシュ：名前・その版のファイルの表・実際にキャッシュに入っているパス */
export type PreviousCache = {
  name: string
  files: FileMap
  cached: ReadonlySet<string>
}

export type InstallPlan = {
  /** 手元の前の版から写す（通信なし） */
  copy: Array<{ path: string; from: string }>
  /** ダウンロードする（変わった・まだ無い）。size は通信のおおよそのバイト数 */
  fetch: Array<{ path: string; hash: string; size: number }>
  /** ダウンロードするバイト数（通信のおおよその量）の合計 */
  bytes: number
  /** 写すバイト数の合計（参考） */
  reusedBytes: number
}

export function planInstall(next: BuildInfo, previous: readonly PreviousCache[]): InstallPlan {
  const plan: InstallPlan = { copy: [], fetch: [], bytes: 0, reusedBytes: 0 }
  const pre = new Set(next.precache)
  // 前の版で一度ダウンロードしていた「元のソース」（ファイル名が変わっても同じもの）
  const usedSources = new Set<string>()
  for (const p of previous) for (const c of p.cached) {
    const src = p.files[c]?.[3]
    if (src) usedSources.add(src)
  }
  for (const [path, entry] of Object.entries(next.files)) {
    const [hash, size] = entry
    // 同じ中身を持っている前の版（新しい順に探す）
    const same = previous.find((p) => p.cached.has(path) && p.files[path]?.[0] === hash)
    if (same) {
      plan.copy.push({ path, from: same.name })
      plan.reusedBytes += size
      continue
    }
    const hadBefore = previous.some((p) => p.cached.has(path)) || (entry[3] !== undefined && usedSources.has(entry[3]))
    if (pre.has(path) || hadBefore) {
      const t = transferSize(entry)
      plan.fetch.push({ path, hash, size: t })
      plan.bytes += t
    }
  }
  return plan
}

/**
 * リクエストの URL → キャッシュの表のパス（スコープの外・表に無いものは null）。
 * クエリと # は無視する。スコープそのもの（/nexmax_chronicle/）は index.html。
 */
export function pathInScope(scope: string, url: string, files: FileMap): string | null {
  if (!url.startsWith(scope)) return null
  let rest = url.slice(scope.length)
  const cut = rest.search(/[?#]/)
  if (cut >= 0) rest = rest.slice(0, cut)
  try {
    rest = decodeURIComponent(rest)
  } catch {
    return null
  }
  if (rest === '') rest = 'index.html'
  return Object.prototype.hasOwnProperty.call(files, rest) ? rest : null
}

/** ダウンロードするときの URL（ハッシュをクエリに付けて、配信側の古いキャッシュをつかまないように） */
export function fetchUrl(scope: string, path: string, hash: string): string {
  return `${scope}${path.split('/').map(encodeURIComponent).join('/')}?v=${hash}`
}

/** 人に見せるバイト数（例 1.2 MB・340 KB） */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (n >= 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${n} B`
}
