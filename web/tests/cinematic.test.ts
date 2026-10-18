// カメラの演出（src/game/cinematic.ts）：加減速・時間の進み・自動のカメラ位置・ディレクターの混ぜ方。
// 始まりと終わりでカメラが飛ばないこと（プレイのカメラの姿勢へぴったり戻ること）を確かめる。
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CineDirector, arcHeight, autoFramePosition, easeInOut, shotState, shotTiming, type CineShot } from "../src/game/cinematic";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** CameraRig の代わり：毎フレーム同じプレイの姿勢に置く */
function rigPose(cam: THREE.PerspectiveCamera): void {
  cam.position.set(0, 2, 5);
  cam.lookAt(0, 1, 0);
}

describe("easeInOut", () => {
  it("0 と 1 で止まり、単調に増え、真ん中で 0.5", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
    let prev = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const e = easeInOut(t);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    // 始まりはゆっくり（線形より遅い）
    expect(easeInOut(0.1)).toBeLessThan(0.1);
  });
});

describe("shotState（寄る → 保持 → 戻る）", () => {
  const tm = shotTiming({ look: v(0, 0, 0), inSec: 2, hold: 1, outSec: 1.5 });

  it("既定の時間と、hold が Infinity のときのパンの時間", () => {
    const d = shotTiming({ look: v(0, 0, 0) });
    expect(d.inSec).toBeCloseTo(1.9);
    expect(d.hold).toBeCloseTo(2.2);
    expect(d.outSec).toBeCloseTo(1.5);
    expect(shotTiming({ look: v(0, 0, 0), hold: Infinity }).panSec).toBe(3);
  });

  it("段階と混ぜ具合 w が途切れずにつながる", () => {
    const outStart = tm.inSec + tm.hold;
    expect(shotState(0, tm, outStart, 1)).toMatchObject({ phase: "in", w: 0 });
    expect(shotState(1.999, tm, outStart, 1).w).toBeCloseTo(1, 3);
    expect(shotState(2.5, tm, outStart, 1)).toMatchObject({ phase: "hold", w: 1 });
    expect(shotState(3.001, tm, outStart, 1).w).toBeCloseTo(1, 3);
    expect(shotState(3.75, tm, outStart, 1).phase).toBe("out");
    expect(shotState(4.5, tm, outStart, 1)).toMatchObject({ phase: "done", w: 0 });
    // 細かく刻んでも大きく跳ばない
    let prev = 0;
    for (let t = 0; t < 4.6; t += 1 / 60) {
      const w = shotState(t, tm, outStart, 1).w;
      expect(Math.abs(w - prev)).toBeLessThan(0.05);
      prev = w;
    }
  });

  it("寄っている途中で切り上げても、その時点の w から戻る（飛ばない）", () => {
    const t = 1.0;
    const w0 = shotState(t, tm, Infinity, 1).w;
    expect(w0).toBeGreaterThan(0.2);
    expect(w0).toBeLessThan(0.8);
    const after = shotState(t + 1e-4, tm, t, w0);
    expect(after.phase).toBe("out");
    expect(after.w).toBeCloseTo(w0, 3);
  });

  it("パンは保持の間に 0 → 1", () => {
    const t2 = shotTiming({ look: v(0, 0, 0), inSec: 1, hold: 2, panSec: 2 });
    expect(shotState(0.5, t2, 3, 1).pan).toBe(0);
    expect(shotState(2, t2, 3, 1).pan).toBeCloseTo(0.5, 2);
    expect(shotState(3, t2, 3, 1).pan).toBeCloseTo(1, 3);
    // 戻りの間はパンを止めたまま
    expect(shotState(3.5, t2, 3, 1).pan).toBeCloseTo(1, 3);
  });
});

describe("autoFramePosition・arcHeight", () => {
  it("プレイヤーの後ろ上から目標を見る（目標の反対側・プレイヤーより高い）", () => {
    const player = v(0, 0, 0);
    const look = v(0, 3, -8);
    const p = autoFramePosition(player, look, new THREE.Vector3());
    expect(p.z).toBeGreaterThan(player.z + 2);
    expect(p.y).toBeGreaterThan(1.5);
    expect(Math.abs(p.x)).toBeGreaterThan(0.5);
    expect(Math.abs(p.x)).toBeLessThan(2);
  });

  it("遠い目標へは寄る（プレイヤーの位置に縛られない）", () => {
    const p = autoFramePosition(v(0, 0, 0), v(0, 2, -60), new THREE.Vector3());
    expect(p.z).toBeLessThan(-30);
    expect(p.distanceTo(v(0, 2, -60))).toBeLessThan(25);
  });

  it("近い移動はまっすぐ、遠い移動ほど高く（上限あり）", () => {
    expect(arcHeight(2)).toBe(0);
    expect(arcHeight(10)).toBeGreaterThan(0.5);
    expect(arcHeight(100)).toBe(2.5);
  });
});

describe("CineDirector", () => {
  function run(dir: CineDirector, cam: THREE.PerspectiveCamera, seconds: number, dt = 1 / 60): { maxStep: number; ended: boolean } {
    let maxStep = 0;
    let ended = false;
    const last = cam.position.clone();
    for (let t = 0; t < seconds; t += dt) {
      rigPose(cam);
      if (dir.apply(dt, cam)) ended = true;
      maxStep = Math.max(maxStep, cam.position.distanceTo(last));
      last.copy(cam.position);
    }
    return { maxStep, ended };
  }

  it("プレイの姿勢から寄って、終わるとプレイの姿勢にぴったり戻り、Promise が解決する", async () => {
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
    rigPose(cam);
    const rigPos = cam.position.clone();
    const rigQuat = cam.quaternion.clone();
    const dir = new CineDirector();
    const shot: CineShot = { look: v(8, 3, -6), from: v(4, 4, 0), inSec: 1, hold: 0.5, outSec: 1, fov: 45 };
    let resolved = false;
    void dir.start(shot, cam, null).then(() => (resolved = true));
    expect(dir.active).toBe(true);
    // 寄りきったところではショットの位置と画角
    run(dir, cam, 1.2);
    expect(dir.phase).toBe("hold");
    expect(cam.position.distanceTo(shot.from!)).toBeLessThan(1e-3);
    expect(cam.fov).toBeCloseTo(45, 3);
    const r = run(dir, cam, 2);
    expect(r.ended).toBe(true);
    expect(dir.active).toBe(false);
    expect(cam.position.distanceTo(rigPos)).toBeLessThan(1e-6);
    expect(cam.quaternion.angleTo(rigQuat)).toBeLessThan(1e-6);
    expect(cam.fov).toBeCloseTo(55, 6);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("hold: Infinity は release() まで保持し、続けて次のショットへ移っても飛ばない", async () => {
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
    rigPose(cam);
    const dir = new CineDirector();
    let first = false;
    void dir.start({ look: v(0, 5, -20), from: v(0, 3, 0), inSec: 0.5, hold: Infinity }, cam, null).then(() => (first = true));
    run(dir, cam, 10);
    expect(dir.phase).toBe("hold");
    // 保持中に次のショット：前のショットは解決し、いまのカメラから寄る
    rigPose(cam);
    dir.apply(0, cam);
    const before = cam.position.clone();
    void dir.start({ look: v(10, 1, 0), from: v(6, 2, 4), inSec: 1, hold: 0.2, outSec: 0.5 }, cam, null);
    await Promise.resolve();
    expect(first).toBe(true);
    rigPose(cam);
    dir.apply(1 / 60, cam);
    expect(cam.position.distanceTo(before)).toBeLessThan(0.05);
    // 1 フレームの動きは速くても数十 cm（飛ぶと数 m 動く）
    const r = run(dir, cam, 3);
    expect(r.maxStep).toBeLessThan(0.6);
    expect(r.ended).toBe(true);
  });

  it("release(fast) で戻りに入り、cancel で画角を戻してすぐ終わる", () => {
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
    rigPose(cam);
    const dir = new CineDirector();
    void dir.start({ look: v(0, 0, -5), from: v(1, 2, 2), inSec: 0.5, hold: Infinity, fov: 40, skippable: true }, cam, null);
    run(dir, cam, 1);
    expect(dir.skippable).toBe(true);
    dir.release(true);
    expect(dir.skippable).toBe(false);
    run(dir, cam, 0.3);
    expect(dir.phase).toBe("out");
    dir.cancel(cam);
    expect(dir.active).toBe(false);
    expect(cam.fov).toBe(55);
  });

  it("揺れは収まる（加えた直後はカメラが傾き、しばらくすると元のまま）", () => {
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
    const dir = new CineDirector();
    dir.addShake(1);
    rigPose(cam);
    const q0 = cam.quaternion.clone();
    dir.applyShake(0.05, cam);
    expect(cam.quaternion.angleTo(q0)).toBeGreaterThan(1e-4);
    for (let i = 0; i < 120; i++) dir.applyShake(1 / 60, cam);
    rigPose(cam);
    dir.applyShake(1 / 60, cam);
    expect(cam.quaternion.angleTo(q0)).toBeLessThan(1e-9);
  });
});
