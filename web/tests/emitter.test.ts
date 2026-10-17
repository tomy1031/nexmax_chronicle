// Emitter（型付きの小さなイベントエミッタ）のテスト
import { describe, expect, it } from "vitest";
import { Emitter } from "../src/core/emitter";

describe("Emitter", () => {
  it("登録順に引数つきで通知し、on の戻り値で解除できる", () => {
    const e = new Emitter<[name: string, value: number]>();
    const log: string[] = [];
    const off = e.on((n, v) => log.push(`a:${n}=${v}`));
    e.on((n, v) => log.push(`b:${n}=${v}`));
    e.emit("x", 1);
    off();
    e.emit("y", 2);
    expect(log).toEqual(["a:x=1", "b:x=1", "b:y=2"]);
  });

  it("同じリスナーを二重登録しても1回だけ呼ぶ / off で解除 / clear で全解除", () => {
    const e = new Emitter<[]>();
    let n = 0;
    const l = (): void => {
      n += 1;
    };
    e.on(l);
    e.on(l);
    expect(e.size).toBe(1);
    e.emit();
    expect(n).toBe(1);
    e.off(l);
    e.emit();
    expect(n).toBe(1);
    e.on(l);
    e.clear();
    expect(e.size).toBe(0);
  });

  it("通知の最中にリスナーを外しても、その回の通知は登録時点のリスナー全員に届く", () => {
    const e = new Emitter<[]>();
    const log: string[] = [];
    let unsubB = (): void => {};
    e.on(() => {
      log.push("a");
      unsubB();
    });
    unsubB = e.on(() => log.push("b"));
    e.emit();
    e.emit();
    expect(log).toEqual(["a", "b", "a"]);
  });
});
