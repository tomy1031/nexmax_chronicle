class_name EraBase
extends Node3D
## 各時代シーンの共通処理。シーン開始時に保存された進行フラグからワールドを再現する（仕様 §4.3）。
## 各時代は _build_world() と _start_story() を実装する。

const PLAYER_SCENE := preload("res://scenes/shared/Player.tscn")

var era := TimelineState.ERA_FUTURE
var music_theme := ""
var kill_y := -14.0
var player: Player
var sun: DirectionalLight3D
var spawns := {}            # spawn_id -> [位置, 向き(度)]
var targets := {}           # 目標ID -> Node3D（目標マーカーの対象）
var marker: ObjectiveMarker
var arrived_by_warp := false


func _ready() -> void:
	Game.era_scene = self
	Game.in_gameplay = true
	Game.input_locked = true
	TimelineState.current_era = era
	arrived_by_warp = TimeTravel.pending_fx == TimeTravel.FX_WARP
	_build_world()
	_spawn_player()
	marker = ObjectiveMarker.new()
	add_child(marker)
	Hud.show_gameplay(true)
	Hud.set_era(era)
	Hud.set_crystals(TimelineState.crystal_count())
	Hud.set_companions([])
	refresh_objective()
	Game.quality_changed.connect(_on_quality_changed)
	if music_theme != "":
		Sfx.play_music(music_theme)
	Hud.arrive(era, _show_era_card())
	await get_tree().create_timer(0.5).timeout
	Game.input_locked = false
	Game.capture_mouse()
	_start_story()


func _exit_tree() -> void:
	if Game.era_scene == self:
		Game.era_scene = null


# ---- 各時代で上書きする

func _build_world() -> void:
	pass


func _start_story() -> void:
	pass


func _show_era_card() -> bool:
	return true


## その位置の水面の高さ。水に落ちたら直前の安全地点へ戻す。
func water_level_at(_pos: Vector3) -> float:
	return -INF


func is_safe_ground(_pos: Vector3) -> bool:
	return true


# ---- 共通

func add_spawn(id: String, pos: Vector3, yaw_deg: float) -> void:
	spawns[id] = [pos, yaw_deg]


func _spawn_player() -> void:
	player = PLAYER_SCENE.instantiate() as Player
	add_child(player)
	var id := TimeTravel.pending_spawn
	if not spawns.has(id):
		id = TimelineState.checkpoint if spawns.has(TimelineState.checkpoint) else "default"
	var s: Array = spawns.get(id, [Vector3.ZERO, 0.0])
	player.place_at(s[0], s[1])


func respawn_player() -> void:
	var id := TimelineState.checkpoint
	if not spawns.has(id):
		id = "default"
	var s: Array = spawns.get(id, [Vector3.ZERO, 0.0])
	player.place_at(s[0], s[1])
	player.heal_full()


func refresh_objective() -> void:
	var o := QuestDirector.objective(era)
	Hud.set_objective(o.title, o.sub)
	if marker:
		marker.target = targets.get(o.target)


## チェックポイント＋自動保存（仕様 §17）。
func checkpoint(id: String, notify: bool = true) -> void:
	TimelineState.checkpoint = id
	TimelineState.current_era = era
	if SaveManager.save_game() and notify:
		Hud.hint("記録しました（自動セーブ）", 2.0)


## 変化した場所を同じ構図で見せる演出（仕様 §3.4 / §9.1）。
func reveal(cam_pos: Vector3, look: Vector3, secs: float, text: String = "") -> void:
	var was_locked := Game.input_locked
	Game.input_locked = true
	var cam := Camera3D.new()
	cam.fov = 60.0
	add_child(cam)
	cam.global_position = cam_pos
	cam.look_at(look, Vector3.UP)
	cam.current = true
	if text != "":
		Hud.toast(text, "change", secs)
	var tw := create_tween()
	tw.tween_property(cam, "global_position", cam_pos + (look - cam_pos).normalized() * 1.5, secs).set_trans(Tween.TRANS_SINE)
	await tw.finished
	player.camera.current = true
	cam.queue_free()
	Game.input_locked = was_locked


func say(key: String) -> void:
	await Hud.say_key(key)


func _on_quality_changed(low: bool) -> void:
	if sun:
		sun.shadow_enabled = not low


## 落下・水への転落の直後に呼ばれる（必要な時代で上書き）。
func on_player_fell() -> void:
	pass
