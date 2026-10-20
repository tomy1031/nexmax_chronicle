// 場面の時計：await wait(秒) で待てるタイマー。ステージの update（一時停止中は呼ばれない）で進め、dispose で全部終わらせる。
// 1970 年のステージの wait() と同じ考え（場面の async 関数が、時代を移ったあとまで動き続けないように）。

export class SceneClock {
  private readonly timers: Array<{ t: number; done: () => void }> = []
  private disposed = false
  /** 経った時間（秒。update で進む） */
  time = 0

  /** 秒数だけ待つ（dispose 後はすぐ終わる） */
  wait(sec: number): Promise<void> {
    if (this.disposed) return Promise.resolve()
    return new Promise((r) => this.timers.push({ t: Math.max(0, sec), done: r }))
  }

  /** 条件がそろうまで待つ（毎フレーム調べる。timeout 秒で打ち切り） */
  until(ok: () => boolean, timeout = Infinity): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false)
    return new Promise((r) => {
      let left = timeout
      const check = (): void => {
        if (this.disposed) return r(false)
        if (ok()) return r(true)
        if (left <= 0) return r(false)
        this.timers.push({
          t: 0,
          done: () => {
            left -= this.lastDt
            check()
          },
        })
      }
      check()
    })
  }

  private lastDt = 0

  update(dt: number): void {
    this.time += dt
    this.lastDt = dt
    if (this.timers.length === 0) return
    const due: Array<() => void> = []
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]
      t.t -= dt
      if (t.t <= 0) {
        this.timers.splice(i, 1)
        due.push(t.done)
      }
    }
    for (let i = due.length - 1; i >= 0; i--) due[i]()
  }

  get dead(): boolean {
    return this.disposed
  }

  dispose(): void {
    this.disposed = true
    const all = this.timers.splice(0)
    for (const t of all) t.done()
  }
}
