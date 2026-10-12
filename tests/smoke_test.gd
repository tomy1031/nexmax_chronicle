extends Node
## スモークテスト：全スクリプトの読み込みと、各シーンを一定フレーム動かしてエラーが出ないか確認する。
## 実行: godot --headless --path . res://tests/SmokeTest.tscn
## 出力に "SCRIPT ERROR" / "ERROR:" が無く、最後に "SMOKE OK" が出れば合格。

const SCENES := [
	["res://scenes/ui/Title.tscn", ""],
	["res://scenes/prototype/ClawPrototype.tscn", "proto_start"],
	["res://scenes/eras/Future_Canal.tscn", "future_intro"],
	["res://scenes/eras/Present_Canal.tscn", "present_start"],
	["res://scenes/eras/Edo_Canal.tscn", "edo_arrive"],
	["res://scenes/hub/DimensionalWorkshop.tscn", "hub_start"],
]

var failures := 0


func _ready() -> void:
	SaveManager.save_path = "user://test_slot.json"
	await get_tree().process_frame
	_check_scripts("res://scripts")
	for entry in SCENES:
		await _run_scene(entry[0], entry[1], false)
	# 進行後の状態（時代改変後）でも各時代を確認する
	TimelineState.reset()
	TimelineState.intro_done = true
	TimelineState.met_matsui = true
	TimelineState.met_genbei = true
	TimelineState.gear_placed = true
	TimelineState.gate_repaired = true
	TimelineState.genbei_drawing_found = true
	TimelineState.drawing_confirmed = true
	for entry in SCENES.slice(2):
		await _run_scene(entry[0], entry[1], true)
	print("SMOKE %s (failures=%d)" % ["OK" if failures == 0 else "FAILED", failures])
	get_tree().quit(1 if failures > 0 else 0)


func _run_scene(path: String, spawn: String, changed: bool) -> void:
	print("SMOKE: scene %s (changed=%s)" % [path, changed])
	var ps := load(path) as PackedScene
	if ps == null:
		push_error("SMOKE: cannot load %s" % path)
		failures += 1
		return
	TimeTravel.pending_spawn = spawn
	TimeTravel.pending_fx = TimeTravel.FX_FADE
	var inst := ps.instantiate()
	get_tree().root.add_child(inst)
	for i in 100:
		await get_tree().physics_frame
	inst.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	Hud.reset_for_title()
	Game.input_locked = false
	Game.in_gameplay = false


func _check_scripts(dir_path: String) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	for f in dir.get_files():
		if f.ends_with(".gd"):
			var p := dir_path.path_join(f)
			var s := load(p) as Script
			if s == null or not s.can_instantiate():
				push_error("SMOKE: script failed %s" % p)
				failures += 1
	for d in dir.get_directories():
		_check_scripts(dir_path.path_join(d))
