// ごく小さな型付きイベントエミッタ。Godot の `signal` 相当（TimelineState.flag_changed など）。
// 通知の最中にリスナーを外しても安全なよう、emit は登録済みリスナーのコピーを回す。

export type Listener<Args extends unknown[]> = (...args: Args) => void;

export class Emitter<Args extends unknown[]> {
  private readonly listeners = new Set<Listener<Args>>();

  /** リスナーを登録する。戻り値を呼ぶと登録を解除できる。 */
  on(listener: Listener<Args>): () => void {
    this.listeners.add(listener);
    return () => this.off(listener);
  }

  off(listener: Listener<Args>): void {
    this.listeners.delete(listener);
  }

  emit(...args: Args): void {
    for (const listener of [...this.listeners]) {
      listener(...args);
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
