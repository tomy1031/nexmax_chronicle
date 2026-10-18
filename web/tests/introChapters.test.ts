// 導入編の改訂（docs/シナリオ改訂案_導入編_v1.md の 6・7・8 章）の進行ロジック：
// 2026年の石標 A・B・C（順不同・C の印は社長のうわさのあと）、社長がついて歩く段階、1726年の段階と町人の台詞の場面。
import { describe, expect, it } from "vitest";
import { StoryState } from "../src/core/storyFlags";
import { edoIntroObjective, edoObjective, idoMarkersLeft, presentObjective } from "../src/core/storyDirector";
import { DialogueDB } from "../src/core/dialogue";
import { IDO_ACTOR, idoMarkerVisible, matsuiFollows, nambaBeat, type NambaActor } from "../src/stages/namba2026/script";
import { edoNpcPlace, edoPhase, gearGrabbable, mobPhase1726, oharuShouldCome } from "../src/stages/edo1726/script";
import { travelRule } from "../src/game/travel";
import d2026 from "../src/data/dialogue_2026.json";
import d1726 from "../src/data/dialogue_1726.json";
import mob1726 from "../src/stages/edo1726/mob_lines_1726.json";
import { TOWNSFOLK } from "../src/stages/edo1726/townsfolk";
import { MOB_STAFF_2026, MOB_TABLE_2026 } from "../src/stages/namba2026/mobTalk2026";
import { OFFICE_STAFF } from "../src/stages/namba2026/officeStaff";

const firstVisit = () => {
  const s = new StoryState();
  s.applyFlagList(["met_matsui", "met_saeki"]);
  return s;
};
const play = (s: StoryState, actor: NambaActor) => {
  const b = nambaBeat(actor, (n) => s.get(n));
  for (const fl of b.set ?? []) s.set(fl, true);
  if (b.confirmDrawing) s.timeline.confirmDrawing();
  return b;
};

describe("2026年：IDO の石標（6-6）", () => {
  it("社長に相談するまでは、どの石標も「社長に聞いてみよう」で、印も出ない", () => {
    const s = firstVisit();
    const f = (n: string) => s.get(n);
    for (const id of ["a", "b", "c"] as const) {
      expect(idoMarkerVisible(id, f)).toBe(false);
      expect(nambaBeat(IDO_ACTOR[id], f).dialogue).toBe("ido_ask_matsui");
      expect(nambaBeat(IDO_ACTOR[id], f).travel).toBeUndefined();
    }
    expect(presentObjective(f).target).toBe("matsui");
    expect(matsuiFollows(f)).toBe(false);
  });

  it("うわさを聞いたら C にも印が出て、C を最初に読んでもすぐ 1726年へ行ける", () => {
    const s = firstVisit();
    play(s, "matsui");
    const f = (n: string) => s.get(n);
    expect(s.get("ido_hint_heard")).toBe(true);
    expect(matsuiFollows(f)).toBe(true);
    expect(idoMarkerVisible("c", f)).toBe(true);
    expect(idoMarkersLeft(f)).toEqual(["a", "b", "c"]);
    const c = play(s, "ido_c");
    expect(c.panel).toBe("karakuri");
    expect(c.travel).toEqual({ to: "1726", cause: "ido_qr", spawn: "arrive" });
    expect(travelRule("2026", c.travel!, f).ok).toBe(true);
  });

  it("A・B は見るだけ。2 本目では社長が残りの C を指す。読んだ石標は印と目標から外れる", () => {
    const s = firstVisit();
    play(s, "matsui");
    const f = (n: string) => s.get(n);
    const b = play(s, "ido_b");
    expect(b.panel).toBe("expo1970");
    expect(b.dialogue).toBe("ido_b");
    expect(b.travel).toBeUndefined();
    expect(idoMarkerVisible("b", f)).toBe(false);
    expect(idoMarkersLeft(f)).toEqual(["a", "c"]);
    expect(presentObjective(f).sub).toContain("C（古い路地の奥）");
    const a = play(s, "ido");
    expect(a.panel).toBe("old1926");
    expect(a.dialogue).toBe("ido_a_last");
    expect(idoMarkersLeft(f)).toEqual(["c"]);
    expect(nambaBeat("matsui", f).dialogue).toBe("matsui_ido_last");
    expect(play(s, "ido_c").travel?.to).toBe("1726");
  });

  it("帰還後：B は見るだけ、C は記録の更新、帰りは見送りの待つ石標 A から", () => {
    const s = new StoryState();
    s.applyFlagList(["met_matsui", "met_saeki", "ido_hint_heard", "ido_qr_used", "gate_repaired", "genbei_drawing_found"]);
    const f = (n: string) => s.get(n);
    expect(matsuiFollows(f)).toBe(false);
    expect(play(s, "ido_b").travel).toBeUndefined();
    expect(play(s, "ido_c").panel).toBe("record");
    s.set("genbei_story_told", true);
    play(s, "saeki");
    expect(s.get("drawing_confirmed")).toBe(true);
    expect(play(s, "ido_c").dialogue).toBe("ido_go_front");
    expect(play(s, "ido_c").travel).toBeUndefined();
    expect(idoMarkerVisible("a", f)).toBe(true);
    expect(play(s, "ido").travel?.to).toBe("2086");
  });

  it("構想スケッチ・ポスターは見るだけ（フラグは変わらない）", () => {
    const s = firstVisit();
    const before = s.activeFlags();
    expect(play(s, "board").dialogue).toBe("look_board");
    expect(play(s, "poster").dialogue).toBe("look_poster");
    expect(s.activeFlags()).toEqual(before);
  });

  it("2026年の会話のキーがすべて揃っている（新しいフラグと相手の全組み合わせ）", () => {
    const db = new DialogueDB(d2026);
    const names = ["met_matsui", "met_saeki", "ido_hint_heard", "ido_a_seen", "ido_b_seen", "gate_repaired", "genbei_story_told", "fixture_made", "drawing_confirmed"];
    const actors: NambaActor[] = ["matsui", "saeki", "ido", "ido_b", "ido_c", "board", "poster"];
    for (let mask = 0; mask < 1 << names.length; mask++) {
      const s = new StoryState();
      names.forEach((n, i) => s.set(n, (mask & (1 << i)) !== 0));
      for (const a of actors) {
        const b = nambaBeat(a, (n) => s.get(n));
        expect(db.has(b.dialogue), `${a} mask=${mask} → ${b.dialogue}`).toBe(true);
      }
    }
    for (const k of ["arrive_first", "matsui_phone", "ido_ore", "ido_ore_alone", "arrive_return"]) expect(db.has(k), k).toBe(true);
  });
});

describe("1726年：仕掛け横丁の段階（7 章）", () => {
  it("町 → おはる → 工房 → 黒い輪（水門の危機）→ 水門を直した", () => {
    const s = new StoryState();
    const f = (n: string) => s.get(n);
    expect(edoPhase(f)).toBe("town");
    expect(edoIntroObjective(f)?.target).toBe("");
    expect(gearGrabbable(f)).toBe(false);
    s.set("met_oharu", true);
    expect(edoPhase(f)).toBe("follow");
    expect(edoIntroObjective(f)?.target).toBe("oharu");
    s.set("met_genbei", true);
    expect(edoPhase(f)).toBe("workshop");
    expect(edoIntroObjective(f)?.target).toBe("genbei");
    expect(edoNpcPlace(f)).toBe("workshop");
    expect(mobPhase1726(f)).toBe("town");
    s.set("black_ring_seen", true);
    expect(edoPhase(f)).toBe("crisis");
    expect(edoIntroObjective(f)).toBeNull();
    expect(edoNpcPlace(f)).toBe("gate");
    expect(gearGrabbable(f)).toBe(true);
    expect(mobPhase1726(f)).toBe("ring");
    expect(edoObjective(f).target).toBe("gate_gear");
    s.set("gate_repaired", true);
    expect(edoPhase(f)).toBe("after");
    expect(gearGrabbable(f)).toBe(false);
    expect(mobPhase1726(f)).toBe("after");
    expect(edoObjective(f).target).toBe("return_point");
  });

  it("古いセーブ（源兵衛には会ったがおはるのフラグが無い）は、おはるに会ったものとして扱う", () => {
    const s = new StoryState();
    s.set("met_genbei", true);
    expect(edoIntroObjective((n) => s.get(n))?.target).toBe("genbei");
  });

  it("おはるが出てくる合図（人形が止まって 16 秒・6 m 動いた・うわさを 2 つ聞いた）", () => {
    expect(oharuShouldCome(3, 1, 0)).toBe(false);
    expect(oharuShouldCome(16, 0, 0)).toBe(true);
    expect(oharuShouldCome(0, 6.2, 0)).toBe(true);
    expect(oharuShouldCome(0, 0, 2)).toBe(true);
  });

  it("1726年の会話と町人の台詞がそろっている", () => {
    const db = new DialogueDB(d1726);
    for (const k of ["arrive_from_2026", "doll_walks", "doll_stops", "oharu_meet", "oharu_wait", "genbei_first_meet", "ring_commotion", "ring_seen", "oharu_go_gate", "gate_alarm", "genbei_workshop", "ring_fades", "gate_drawing", "return_ring"]) {
      expect(db.has(k), k).toBe(true);
    }
    expect(db.lines("genbei_first_meet")[0].text).toBe("お前、また来たんか！");
    const speakers = (mob1726 as { speakers: Record<string, { bubble: Record<string, string[]> }> }).speakers;
    for (const p of TOWNSFOLK) {
      if (!p.id) continue;
      expect(speakers[p.id]?.bubble.town?.length, p.id).toBeGreaterThan(0);
      for (const l of [...(speakers[p.id].bubble.town ?? []), ...(speakers[p.id].bubble.ring ?? []), ...(speakers[p.id].bubble.after ?? [])]) expect([...l].length, l).toBeLessThanOrEqual(40);
    }
  });
});

describe("導入編の決まりごと", () => {
  it("2026年・1726年の台詞では誰も「オルム」と言わない", () => {
    const texts = [JSON.stringify(d2026), JSON.stringify(d1726), JSON.stringify(mob1726), JSON.stringify(MOB_TABLE_2026)]
      .join("")
      .replace(/"_note":"[^"]*"/g, "");
    expect(texts.includes("オルム")).toBe(false);
  });

  it("オフィスの社員は全員に台詞がある", () => {
    expect(MOB_STAFF_2026.length).toBe(OFFICE_STAFF.length);
    MOB_STAFF_2026.forEach((id, i) => {
      expect(OFFICE_STAFF[i].id).toBe(id);
      expect(MOB_TABLE_2026.speakers[id]?.bubble.first?.length, id).toBeGreaterThan(0);
    });
  });
});
