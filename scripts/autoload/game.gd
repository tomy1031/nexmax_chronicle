extends Node
## ゲーム全体の共通処理：入力マップ、ポーズ、設定、プレイ時間。

signal pause_changed(paused: bool)
signal quality_changed(low: bool)

const SCENE_TITLE := "res://scenes/ui/Title.tscn"
const SCENE_PROTOTYPE := "res://scenes/prototype/ClawPrototype.tscn"

## 会話・演出中はプレイヤー操作を止める
var input_locked := false
## ゲームプレイ中（タイトル以外）か
var in_gameplay := false
var player: Node = null
var era_scene: Node = null

var mouse_sensitivity := 0.0024
var invert_y := false
var low_quality := false

var _was_captured := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_input_map()


func _process(delta: float) -> void:
	if in_gameplay and not get_tree().paused:
		TimelineState.play_time += delta
	# Web版は Esc でブラウザがマウスのロックを解除する。解除されたらポーズを開く。
	var captured := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if _was_captured and not captured and in_gameplay and not get_tree().paused and not input_locked:
		set_paused(true)
	_was_captured = captured


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("menu") and in_gameplay:
		set_paused(not get_tree().paused)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("debug_overlay"):
		Hud.toggle_debug()


func set_paused(p: bool) -> void:
	if get_tree().paused == p:
		return
	get_tree().paused = p
	if p:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	pause_changed.emit(p)


func capture_mouse() -> void:
	if not get_tree().paused:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func release_mouse() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func set_low_quality(v: bool) -> void:
	low_quality = v
	quality_changed.emit(v)


func goto_title() -> void:
	set_paused(false)
	in_gameplay = false
	input_locked = false
	release_mouse()
	Hud.reset_for_title()
	Sfx.stop_music()
	get_tree().change_scene_to_file(SCENE_TITLE)


func new_game() -> void:
	TimelineState.reset()
	SaveManager.delete_save()
	TimeTravel.travel_to(TimelineState.ERA_FUTURE, "future_intro", TimeTravel.FX_FADE)


func continue_game() -> bool:
	if not SaveManager.load_game():
		return false
	var era := TimelineState.current_era
	TimeTravel.travel_to(era, TimelineState.checkpoint, TimeTravel.FX_FADE)
	return true


func open_claw_prototype() -> void:
	TimelineState.reset()
	TimeTravel.travel_to_scene(SCENE_PROTOTYPE, "proto_start", "クロー練習場", "ClawPrototype")


func _setup_input_map() -> void:
	_keys("move_forward", [KEY_W, KEY_UP])
	_keys("move_back", [KEY_S, KEY_DOWN])
	_keys("move_left", [KEY_A, KEY_LEFT])
	_keys("move_right", [KEY_D, KEY_RIGHT])
	_keys("jump", [KEY_SPACE])
	_keys("dash", [KEY_SHIFT])
	_keys("interact", [KEY_F])
	_keys("claw_aim", [KEY_Q])
	_mouse("claw_aim", MOUSE_BUTTON_RIGHT)
	_keys("primary", [KEY_E])
	_mouse("primary", MOUSE_BUTTON_LEFT)
	_keys("menu", [KEY_ESCAPE, KEY_P])
	_keys("advance", [KEY_SPACE, KEY_ENTER, KEY_F, KEY_KP_ENTER])
	_mouse("advance", MOUSE_BUTTON_LEFT)
	_keys("debug_overlay", [KEY_F3])


func _ensure(action: String) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)


func _keys(action: String, keys: Array) -> void:
	_ensure(action)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		InputMap.action_add_event(action, ev)


func _mouse(action: String, button: MouseButton) -> void:
	_ensure(action)
	var ev := InputEventMouseButton.new()
	ev.button_index = button
	InputMap.action_add_event(action, ev)
