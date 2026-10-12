extends Node
## 1726年・水門パズルの通しテスト（P2・P3 の受け入れ確認を自動化）。
## 実行: godot --headless --path . res://tests/EdoFlowTest.tscn
## 歯車の設置 → 早すぎる解除 → 舟が通る間の解除 → おはるの合図で解除 → フラグ確定、を実シーンで確認する。

var edo: Node
var failures := 0


func _ready() -> void:
	Engine.time_scale = 4.0
	TimelineState.reset()
	TimelineState.met_genbei = true
	TimeTravel.pending_spawn = "edo_arrive"
	edo = load("res://scenes/eras/Edo_Canal.tscn").instantiate()
	add_child(edo)
	await _wait(1.5)
	var claw: Node = edo.player.claw

	# 1) 外れた大歯車を遠くで離す → 元の場所へ戻る
	edo.gear.on_grab(claw)
	edo.gear.global_position = Vector3(0, 1.5, 12)
	edo.gear.on_release(claw)
	await _wait(1.2)
	_check(not edo.gear.is_placed(), "遠くで離すと設置されない")
	_check(edo.gear.global_position.distance_to(edo.gear.home.origin) < 0.05, "遠くで離すと元の位置へ戻る")

	# 2) 軸の近くで離す → 設置される
	edo.gear.on_grab(claw)
	edo.gear.global_position = edo.AXLE + Vector3(0, -0.3, 1.0)
	edo.gear.on_release(claw)
	await _wait(2.0)
	await _drain_dialogue()
	_check(edo.gear.is_placed(), "軸の近くで離すと設置される")
	_check(TimelineState.gear_placed, "gear_placed フラグ")
	_check(edo.puzzle_active and edo.gate_hold.grab_enabled, "協力パズルが始まる")

	# 3) 調整中に離す → 早すぎる
	edo._on_gate_hold_started()
	await _wait(2.0)
	_check(edo.logic.phase == GatePuzzleLogic.Phase.ADJUSTING, "保持中は源兵衛が調整中")
	edo._on_gate_released()
	_check(TimelineState.metrics.release_too_early >= 1, "早すぎる解除が記録される")
	_check(not TimelineState.gate_repaired, "早すぎる解除では直らない")
	await _wait(1.5)

	# 4) 調整を終える → 舟が危険範囲にいる間に離す → 歯止めが受け止める
	edo._on_gate_hold_started()
	var t := 0.0
	while edo.logic.phase != GatePuzzleLogic.Phase.WAIT_SIGNAL and t < 12.0:
		await _wait(0.25)
		t += 0.25
	_check(edo.logic.phase == GatePuzzleLogic.Phase.WAIT_SIGNAL, "歯止めの調整が終わる")
	_check(edo.logic.is_danger(), "調整完了時は舟が通っている（待って）")
	edo._on_gate_released()
	_check(TimelineState.metrics.release_person_danger >= 1, "人がいる時の解除が記録される")
	_check(not TimelineState.gate_repaired, "人がいる時の解除では直らない")
	await _wait(3.0)

	# 5) もう一度つかみ、おはるの合図（危険なし）で離す → 成功
	edo._on_gate_hold_started()
	t = 0.0
	while edo.logic.is_danger() and t < 15.0:
		await _wait(0.25)
		t += 0.25
	_check(not edo.logic.is_danger(), "舟が通り過ぎて合図が出る")
	edo._on_gate_released()
	t = 0.0
	while not TimelineState.gate_repaired and t < 30.0:
		await _drain_dialogue()
		await _wait(0.25)
		t += 0.25
	_check(TimelineState.gate_repaired, "gate_repaired = true")
	_check(TimelineState.genbei_drawing_found, "genbei_drawing_found = true")
	_check(absf(edo.board.position.y - edo.BOARD_CLOSED_Y) < 0.05, "堰板が閉じている")
	_check(edo.water_level_at(Vector3(-4, 0, 0)) <= edo.WATER_DOWN_LOW + 0.01, "下流の水位が下がる")
	_check(SaveManager.has_save() and SaveManager.read_save().get("gate_repaired", false), "自動セーブにフラグが残る")

	SaveManager.delete_save()  # テストで作ったセーブを残さない
	print("EDO FLOW %s (failures=%d)" % ["OK" if failures == 0 else "FAILED", failures])
	Engine.time_scale = 1.0
	get_tree().quit(1 if failures > 0 else 0)


func _wait(secs: float) -> void:
	var t := 0.0
	while t < secs:
		await get_tree().process_frame
		t += get_process_delta_time()
		if Hud.is_dialogue_active():
			Hud._line_advanced.emit()


func _drain_dialogue() -> void:
	for i in 40:
		if not Hud.is_dialogue_active():
			return
		Hud._line_advanced.emit()
		await get_tree().process_frame


func _check(cond: bool, label: String) -> void:
	print(("PASS  " if cond else "FAIL  ") + label)
	if not cond:
		failures += 1
