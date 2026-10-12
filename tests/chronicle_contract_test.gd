extends Node
## 時代をまたぐ契約テスト：物語の各段階で、正しいシーン・スポーン地点が読み込まれ、
## 目標マーカーの対象（QuestDirector の target）がシーンに存在して見えているかを確かめる。
## 実行: godot --headless --path . res://tests/ChronicleContractTest.tscn

const F_INTRO := ["intro_done"]
const F_MATSUI := ["intro_done", "met_matsui"]
const F_GENBEI := ["intro_done", "met_matsui", "met_genbei"]
const F_GEAR := ["intro_done", "met_matsui", "met_genbei", "gear_placed"]
const F_GATE := ["intro_done", "met_matsui", "met_genbei", "gear_placed", "gate_repaired", "genbei_drawing_found"]
const F_DRAW := ["intro_done", "met_matsui", "met_genbei", "gear_placed", "gate_repaired", "genbei_drawing_found", "drawing_confirmed"]
const F_SORA := ["intro_done", "met_matsui", "met_genbei", "gear_placed", "gate_repaired", "genbei_drawing_found", "drawing_confirmed", "met_sora"]

## [説明, 時代, スポーンID, フラグ, 倒した警備ロボ数]
var STAGES := [
	["2086 冒頭（経路閉鎖から逃げる）", 2086, "future_intro", [], 0],
	["2026 到着（マツイ社長に会う）", 2026, "present_start", F_INTRO, 0],
	["2026 IDOを調べる", 2026, "present_start", F_MATSUI, 0],
	["1726 到着（からくり人形を追う）", 1726, "edo_arrive", F_MATSUI, 0],
	["1726 大歯車を軸へ", 1726, "edo_arrive", F_GENBEI, 0],
	["1726 大歯車を支える", 1726, "edo_arrive", F_GEAR, 0],
	["1726 帰還地点へ", 1726, "edo_arrive", F_GATE, 0],
	["2026 帰還（記録を確かめる）", 2026, "present_ido", F_GATE, 0],
	["2026 異次元拠点へ", 2026, "present_ido", F_DRAW, 0],
	["拠点 2086年へ", 0, "hub_start", F_DRAW, 0],
	["2026 拠点から戻る", 2026, "present_portal", F_DRAW, 0],
	["2086 帰還（ソラに会う）", 2086, "future_return", F_DRAW, 0],
	["2086 警備ロボを停止", 2086, "future_return", F_SORA, 0],
	["2086 セントラルタワーへ", 2086, "future_return", F_SORA, 2],
]

var failures := 0


func _ready() -> void:
	SaveManager.save_path = "user://test_slot.json"
	Game.debug_args["nostory"] = "1"
	Game.debug_args["shot"] = "1"
	for st in STAGES:
		await _run_stage(st)
	print("CONTRACT %s (failures=%d)" % ["OK" if failures == 0 else "FAILED", failures])
	get_tree().quit(1 if failures > 0 else 0)


func _run_stage(st: Array) -> void:
	TimelineState.reset()
	for f in st[3]:
		TimelineState.set(f, true)
	TimelineState.robots_defeated = st[4]
	var era: int = st[1]
	var label: String = st[0]
	# change_scene はこのテスト自身を消してしまうので、TimeTravel と同じ対応表で子として読み込む
	TimeTravel.pending_spawn = st[2]
	TimeTravel.pending_fx = TimeTravel.FX_FADE
	TimelineState.current_era = era
	var scene: Node = (load(TimeTravel.ERA_SCENES[era]) as PackedScene).instantiate()
	add_child(scene)
	for i in 30:
		await get_tree().process_frame
	var era_node := Game.era_scene
	_check(era_node == scene, label + "：シーン " + str(TimeTravel.ERA_SCENES[era]).get_file())
	if era_node == null:
		_check(false, label + "：EraBase が見つからない")
		scene.queue_free()
		return
	var spawns: Dictionary = era_node.get("spawns")
	_check(spawns.has(st[2]), label + "：スポーン %s が定義されている" % st[2])
	var p := Game.player as Node3D
	if spawns.has(st[2]) and p:
		var want: Vector3 = spawns[st[2]][0]
		_check(p.global_position.distance_to(want) < 2.5, label + "：プレイヤーがスポーン付近にいる")
	var o := QuestDirector.objective(era)
	var targets: Dictionary = era_node.get("targets")
	var tgt: Node3D = targets.get(o.target)
	_check(tgt != null and is_instance_valid(tgt), label + "：目標「%s」の対象 %s がある" % [o.title, o.target])
	if tgt and is_instance_valid(tgt):
		_check(tgt.is_visible_in_tree(), label + "：目標の対象 %s が表示されている" % o.target)
	scene.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	Hud.reset_for_title()
	Game.input_locked = false


func _check(cond: bool, msg: String) -> void:
	print(("PASS  " if cond else "FAIL  ") + msg)
	if not cond:
		failures += 1
