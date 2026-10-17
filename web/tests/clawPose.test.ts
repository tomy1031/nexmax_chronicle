// 操作とクローの状態 → ネクマックスのポーズ（新しいリグへの対応と、従来ポーズへの読み替え）
import { describe, expect, it } from "vitest";
import { choosePose, legacyPose, type PoseInput } from "../src/player/poseDriver";

const base: PoseInput = { wirePhase: "idle", targetType: null, grounded: true, vy: 0, speed: 0, dash: false, landTimer: 0, fireTimer: 0 };

describe("poseDriver: choosePose", () => {
  it("地上：止まる・歩く・走る・ダッシュ", () => {
    expect(choosePose(base)).toBe("idle");
    expect(choosePose({ ...base, speed: 3.3 })).toBe("walk");
    expect(choosePose({ ...base, speed: 6.4, dash: true })).toBe("dash");
    expect(choosePose({ ...base, speed: 5.0 })).toBe("run");
  });

  it("空中：上昇中は jump、下降中は fall、着地直後は land", () => {
    expect(choosePose({ ...base, grounded: false, vy: 4 })).toBe("jump");
    expect(choosePose({ ...base, grounded: false, vy: -2 })).toBe("fall");
    expect(choosePose({ ...base, landTimer: 0.1 })).toBe("land");
  });

  it("クロー：射出は fire、引き寄せは pulled、振り子は swing、仕掛けは hold", () => {
    expect(choosePose({ ...base, wirePhase: "firing", targetType: "pull_object" })).toBe("fire");
    expect(choosePose({ ...base, wirePhase: "miss" })).toBe("fire");
    expect(choosePose({ ...base, wirePhase: "zipping", targetType: "pull_player", grounded: false })).toBe("pulled");
    expect(choosePose({ ...base, wirePhase: "swinging", targetType: "swing_anchor", grounded: false })).toBe("swing");
    expect(choosePose({ ...base, wirePhase: "holding", targetType: "hold_mechanism" })).toBe("hold");
  });

  it("物を持っている間はふつうに歩ける", () => {
    expect(choosePose({ ...base, wirePhase: "carrying", targetType: "pull_object", speed: 3 })).toBe("walk");
  });
});

describe("poseDriver: 従来の仮モデルへの読み替え", () => {
  it("新しいポーズは idle / walk / hold のどれかになる", () => {
    expect(legacyPose("swing", 0)).toBe("hold");
    expect(legacyPose("pulled", 5)).toBe("hold");
    expect(legacyPose("fire", 0)).toBe("hold");
    expect(legacyPose("dash", 6)).toBe("walk");
    expect(legacyPose("land", 0)).toBe("idle");
    expect(legacyPose("fall", 0)).toBe("idle");
  });
});
