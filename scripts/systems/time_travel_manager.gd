extends Node
## 時代移動（仕様 §3 / §14.1 time_travel_manager）。
## 一度に一つの3Dシーンだけを読み込み、切替後にワールド状態を再適用する（各シーンの _ready で実施）。

enum { FX_WARP, FX_FADE }

const ERA_SCENES := {
	1726: "res://scenes/eras/Edo_Canal.tscn",
	2026: "res://scenes/eras/Present_Canal.tscn",
	2086: "res://scenes/eras/Future_Canal.tscn",
	0: "res://scenes/hub/DimensionalWorkshop.tscn",
}
const ERA_PLACES := {
	1726: "大坂・仕掛け横丁",
	2026: "なんば",
	2086: "ナンバタウン",
	0: "異次元拠点",
}
const ERA_TINTS := {
	1726: Color(1.0, 0.72, 0.38),
	2026: Color(0.45, 0.8, 1.0),
	2086: Color(0.7, 0.55, 1.0),
	0: Color(0.5, 1.0, 0.9),
}

var pending_spawn := ""
var pending_fx := FX_FADE
var busy := false


static func era_label(era: int) -> String:
	if era == 0:
		return "時の境界"
	return "%d年" % era


func travel_to(era: int, spawn_id: String, fx: int = FX_WARP) -> void:
	if not ERA_SCENES.has(era):
		push_error("TimeTravel: 未定義の時代 %d" % era)
		return
	await _go(ERA_SCENES[era], spawn_id, fx, era)


func travel_to_scene(path: String, spawn_id: String, _place: String, _id: String) -> void:
	await _go(path, spawn_id, FX_FADE, TimelineState.current_era)


func _go(path: String, spawn_id: String, fx: int, era: int) -> void:
	if busy:
		return
	busy = true
	Game.input_locked = true
	if fx == FX_WARP:
		Sfx.play("warp")
		TimelineState.add_metric("time_travels")
		await Hud.warp_out(ERA_TINTS.get(era, Color.WHITE))
	else:
		await Hud.fade_out(0.45)
	TimelineState.current_era = era
	pending_spawn = spawn_id
	pending_fx = fx
	var err := get_tree().change_scene_to_file(path)
	if err != OK:
		push_error("TimeTravel: シーンを読み込めません %s" % path)
		Hud.fade_in(0.3)
		Game.input_locked = false
	busy = false
