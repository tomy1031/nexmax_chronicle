// 照準の自動選択（スコア）と R によるロック切り替え（操作マニュアル v1.1 §2.1）。左右はネクマックスの向き（turnBasisToFacing）
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  TARGET_CATEGORY,
  chooseTarget,
  cycleLock,
  evaluateTarget,
  nearestOutOfRange,
  rankTargets,
  turnBasisToFacing,
  type ClawTargetDef,
  type ViewBasis,
} from "../src/player/clawLogic";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 原点から -Z を向いたカメラ（画角 60°×45° 程度） */
function basis(): ViewBasis {
  return {
    origin: v(0, 1, 0),
    forward: v(0, 0, -1),
    right: v(1, 0, 0),
    up: v(0, 1, 0),
    tanHalfX: Math.tan((30 * Math.PI) / 180),
    tanHalfY: Math.tan((22.5 * Math.PI) / 180),
  };
}

function target(id: string, p: THREE.Vector3, extra: Partial<ClawTargetDef> = {}): ClawTargetDef {
  return { id, type: "pull_object", label: id, point: p, radius: 0.3, enabled: true, ...extra };
}

const chest = v(0, 1, 0);

describe("clawTargeting: 対象の評価", () => {
  it("画面中央に近い射程内の対象は狙える", () => {
    const r = evaluateTarget(target("a", v(0.2, 1, -5)), basis(), chest);
    expect(r?.valid).toBe(true);
    expect(r?.inCone).toBe(true);
    expect(Math.abs(r?.ndcX ?? 9)).toBeLessThan(0.1);
  });

  it("射程（10m）より遠い対象は狙えない（遠い表示の候補にはなる）", () => {
    const far = evaluateTarget(target("far", v(0, 1, -12)), basis(), chest);
    expect(far?.inRange).toBe(false);
    expect(far?.valid).toBe(false);
    expect(nearestOutOfRange([far])?.def.id).toBe("far");
  });

  it("対象ごとの射程の上書き", () => {
    const r = evaluateTarget(target("x", v(0, 1, -12), { range: 13 }), basis(), chest);
    expect(r?.valid).toBe(true);
  });

  it("カメラの後ろの対象は評価しない", () => {
    expect(evaluateTarget(target("back", v(0, 1, 4)), basis(), chest)).toBeNull();
  });

  it("中央から外れた（吸い付き範囲外の）対象は狙えない", () => {
    const r = evaluateTarget(target("side", v(2.5, 1, -5)), basis(), chest);
    expect(r === null || r.valid === false).toBe(true);
  });

  it("無効（enabled=false）の対象は評価しない", () => {
    expect(evaluateTarget(target("off", v(0, 1, -5), { enabled: false }), basis(), chest)).toBeNull();
  });

  it("正面の向き（facing）の裏側からは狙えない", () => {
    const front = evaluateTarget(target("hook", v(0, 2, -5), { facing: v(0, 0, 1) }), basis(), chest);
    const back = evaluateTarget(target("hook", v(0, 2, -5), { facing: v(0, 0, -1) }), basis(), chest);
    expect(front?.valid).toBe(true);
    expect(back?.valid).toBe(false);
  });

  it("遮られている（視線チェック失敗）と狙えない。noLineOfSight の仕掛けは除外", () => {
    const blocked = () => false;
    expect(evaluateTarget(target("w", v(0, 1, -5)), basis(), chest, blocked)?.valid).toBe(false);
    expect(evaluateTarget(target("g", v(0, 1, -5), { noLineOfSight: true }), basis(), chest, blocked)?.valid).toBe(true);
  });
});

describe("clawTargeting: 自動照準とロック", () => {
  const b = basis();
  const center = target("center", v(0.1, 1, -6));
  const off = target("off", v(1.2, 1.3, -6));
  const near = target("near", v(0.4, 1, -3));

  it("中央に近い対象ほど優先される", () => {
    const ranked = rankTargets([evaluateTarget(center, b, chest), evaluateTarget(off, b, chest)]);
    expect(ranked.map((r) => r.def.id)).toEqual(["center", "off"]);
    expect(chooseTarget(ranked, null)?.def.id).toBe("center");
  });

  it("中央からの近さが同じなら近い方が優先される", () => {
    const a = target("a", v(0, 1, -4));
    const z = target("z", v(0, 1, -9));
    expect(chooseTarget(rankTargets([evaluateTarget(z, b, chest), evaluateTarget(a, b, chest)]), null)?.def.id).toBe("a");
  });

  it("R で次の候補へロックを移し、最後まで行くと先頭に戻る", () => {
    const ranked = rankTargets([evaluateTarget(center, b, chest), evaluateTarget(off, b, chest), evaluateTarget(near, b, chest)]);
    const ids = ranked.map((r) => r.def.id);
    let lock = cycleLock(ranked, ids[0]);
    expect(lock).toBe(ids[1]);
    lock = cycleLock(ranked, lock);
    expect(lock).toBe(ids[2]);
    lock = cycleLock(ranked, lock);
    expect(lock).toBe(ids[0]);
  });

  it("ロック中の対象が狙える間はスコアより優先される", () => {
    const ranked = rankTargets([evaluateTarget(center, b, chest), evaluateTarget(off, b, chest)]);
    expect(chooseTarget(ranked, "off")?.def.id).toBe("off");
  });

  it("ロック中の対象が狙えなくなったら自動照準に戻る", () => {
    const ranked = rankTargets([evaluateTarget(center, b, chest)]);
    expect(chooseTarget(ranked, "gone")?.def.id).toBe("center");
  });

  it("候補が無ければ選ばない・候補 1 つなら R でも変わらない", () => {
    expect(chooseTarget([], null)).toBeNull();
    expect(cycleLock([], "x")).toBeNull();
    const one = rankTargets([evaluateTarget(center, b, chest)]);
    expect(cycleLock(one, "center")).toBe("center");
  });

  it("照準の分類：軽い物／固定支点／協力装置", () => {
    expect(TARGET_CATEGORY.pull_object).toBe("light");
    expect(TARGET_CATEGORY.pull_player).toBe("anchor");
    expect(TARGET_CATEGORY.swing_anchor).toBe("anchor");
    expect(TARGET_CATEGORY.hold_mechanism).toBe("mechanism");
  });
});

describe("clawTargeting: ステージが付ける優先度", () => {
  it("優先度の付いた対象は、まん中から少しはずれていても先に選ばれる", () => {
    const center = target("center", v(0, 1, -6));
    const side = target("side", v(0.6, 1, -6));
    const plain = rankTargets([evaluateTarget(center, basis(), chest), evaluateTarget(side, basis(), chest)]);
    expect(chooseTarget(plain, null)?.def.id).toBe("center");
    side.priority = 0.6;
    const ranked = rankTargets([evaluateTarget(center, basis(), chest), evaluateTarget(side, basis(), chest)]);
    expect(chooseTarget(ranked, null)?.def.id).toBe("side");
  });
});

describe("clawTargeting: ネクマックスの向きの照準", () => {
  /** プレイヤー（原点）の左うしろ 5m から +X を見ているカメラ（ネクマックスは -Z を向いている） */
  function sideCamera(): ViewBasis {
    return {
      origin: v(-5, 2, 0),
      forward: v(1, 0, 0),
      right: v(0, 0, 1),
      up: v(0, 1, 0),
      tanHalfX: Math.tan((30 * Math.PI) / 180),
      tanHalfY: Math.tan((22.5 * Math.PI) / 180),
    };
  }
  const player = v(0, 0, 0);

  it("カメラが横を向いていても、ネクマックスの正面の対象を狙う（カメラの向きの対象は狙わない）", () => {
    const b = sideCamera();
    turnBasisToFacing(b, player, 0);
    expect(b.forward.x).toBeCloseTo(0);
    expect(b.forward.z).toBeCloseTo(-1);
    expect(b.origin.x).toBeCloseTo(0);
    expect(b.origin.z).toBeCloseTo(5);
    expect(b.right.x).toBeCloseTo(1);
    const front = evaluateTarget(target("front", v(0, 1, -5)), b, chest);
    const camDir = evaluateTarget(target("camDir", v(5, 1, 0)), b, chest);
    expect(front?.valid).toBe(true);
    expect(camDir === null || camDir.valid === false).toBe(true);
  });

  it("上下（見上げ）はカメラのまま", () => {
    const b = sideCamera();
    b.forward.set(Math.cos(0.4), Math.sin(0.4), 0);
    b.up.set(-Math.sin(0.4), Math.cos(0.4), 0);
    turnBasisToFacing(b, player, Math.PI / 2);
    // facing = π/2 → 前は -X
    expect(b.forward.x).toBeCloseTo(-Math.cos(0.4));
    expect(b.forward.y).toBeCloseTo(Math.sin(0.4));
    expect(b.forward.z).toBeCloseTo(0);
  });

  it("カメラがネクマックスの真うしろなら、何も変わらない", () => {
    const b = basis();
    turnBasisToFacing(b, player, 0);
    expect(b.origin.toArray()).toEqual([0, 1, 0]);
    expect(b.forward.toArray()).toEqual([0, 0, -1]);
  });
});
