// 腕パーツの装備状態と異次元拠点の判定（操作マニュアル v1.1 §1・§2.2・§5・§8.5）
import { describe, expect, it } from "vitest";
import { HUB_MESSAGES, armLabel, canOpenHub, clawArm, initialEquipment, selectArm } from "../src/player/equipment";

describe("equipment: 初期装備", () => {
  it("開始時は右腕だけに つかむNMClaw、左腕は未装備", () => {
    const eq = initialEquipment();
    expect(eq.right).toBe("grapple_claw");
    expect(eq.left).toBeNull();
    expect(eq.selected).toBe("right");
    expect(clawArm(eq)).toBe("right");
    expect(armLabel(eq, "right")).toBe("右腕：つかむNMClaw");
    expect(armLabel(eq, "left")).toBe("左腕：装備なし");
  });

  it("Q（左腕）は未装備なので選べず「左腕：装備なし」を返す。選択は右腕のまま", () => {
    const eq = initialEquipment();
    const r = selectArm(eq, "left");
    expect(r.ok).toBe(false);
    expect(r.message).toBe("左腕：装備なし");
    expect(eq.selected).toBe("right");
    expect(clawArm(eq)).toBe("right");
  });

  it("E（右腕）は つかむNMClaw を選ぶ", () => {
    const eq = initialEquipment();
    const r = selectArm(eq, "right");
    expect(r.ok).toBe(true);
    expect(r.message).toBe("右腕：つかむNMClaw");
  });

  it("左腕に装備が付けば左腕も選べる（将来の装備台）", () => {
    const eq = initialEquipment();
    eq.left = "grapple_claw";
    expect(selectArm(eq, "left").ok).toBe(true);
    expect(clawArm(eq)).toBe("left");
  });
});

describe("equipment: 異次元拠点（G）", () => {
  const base = { unlocked: true, atSafePoint: true, wireMoving: false, airborne: false, inCombat: false };

  it("解放済みで安全地点なら開ける", () => {
    expect(canOpenHub(base).ok).toBe(true);
  });

  it("安全地点でない／未解放なら「ここでは異次元拠点を開けません」", () => {
    expect(canOpenHub({ ...base, atSafePoint: false })).toEqual({ ok: false, message: HUB_MESSAGES.place });
    expect(canOpenHub({ ...base, unlocked: false })).toEqual({ ok: false, message: HUB_MESSAGES.place });
    expect(HUB_MESSAGES.place).toBe("ここでは異次元拠点を開けません");
  });

  it("ワイヤー移動中・戦闘中・空中は安全地点でも開けない", () => {
    expect(canOpenHub({ ...base, wireMoving: true })).toEqual({ ok: false, message: HUB_MESSAGES.wire });
    expect(canOpenHub({ ...base, inCombat: true }).ok).toBe(false);
    expect(canOpenHub({ ...base, airborne: true }).ok).toBe(false);
  });
});
