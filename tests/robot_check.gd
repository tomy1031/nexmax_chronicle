extends SceneTree
## 警備ロボ（GuardRobot）の状態遷移と、2086年シーンの進行（冒頭→裂け目／帰還→ソラ→戦闘→ゴール）をヘッドレスで確かめる。
## 実行: godot --headless --path . --fixed-fps 60 -s res://tests/robot_check.gd
## 最後に "ROBOT_CHECK OK" が出れば合格（失敗は "ROBOT_CHECK FAIL: ..." を表示し、終了コード 1）。
##
## -s モードでは起動時に Autoload の名前でコンパイルできないため、Autoload は root から取り出し、
## ロボやシーンのスクリプトは実行時に load() する。

const ROBOT_PATH := "res://scripts/enemy/guard_robot.gd"
const SCENE_PATH := "res://scenes/eras/Future_Canal.tscn"

const FAKE_PLAYER_SRC := """extends Node3D
var invulnerable_t := 0.0
var damage := 0
var _knockback := Vector3.ZERO
func take_damage(amount: int, _from_dir: Vector3 = Vector3.ZERO) -> void:
	damage += amount
"""
const FAKE_CLAW_SRC := """extends Node3D
var player: Node3D
var held: Node = null
var released := false
func force_release(_silent: bool = false) -> void:
	released = true
	if held:
		var t := held
		held = null
		t.on_release(self)
"""

var fails := 0
var game: Node
var tl: Node
var hud: Node


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	game = root.get_node("Game")
	tl = root.get_node("TimelineState")
	hud = root.get_node("Hud")
	# 本物のセーブスロットを汚さない
	root.get_node("SaveManager").set("save_path", "user://test_slot.json")
	await _robot_logic()
	await _future_intro_flow()
	await _future_return_flow()
	print("ROBOT_CHECK %s (failures=%d)" % ["OK" if fails == 0 else "FAILED", fails])
	# 終了時のリーク警告を減らす：残ったシーンを片付け、共有マテリアルのキャッシュを空にする
	if current_scene:
		current_scene.queue_free()
	for n in root.get_children():
		if not n in [game, tl, hud, root.get_node("SaveManager"), root.get_node("Sfx"), root.get_node("TimeTravel")]:
			n.queue_free()
	await _frames(5)
	(load("res://scripts/world/level_kit.gd") as GDScript).set("_mats", {})
	(load("res://scripts/eras/future/future_decor.gd") as GDScript).set("_holo_mats", {})
	(load("res://scripts/eras/future/future_decor.gd") as GDScript).set("_holo_shader", null)
	await _frames(2)
	quit(1 if fails > 0 else 0)


func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok: ", msg)
	else:
		fails += 1
		print("ROBOT_CHECK FAIL: ", msg)


func _frames(n: int) -> void:
	for i in n:
		await physics_frame


## 条件が満たされるまで待つ（最大 secs 秒）。
func _wait_until(cond: Callable, secs: float) -> bool:
	var n := int(secs * 60.0)
	for i in n:
		if cond.call():
			return true
		await physics_frame
	return bool(cond.call())


func _script(src: String) -> GDScript:
	var gs := GDScript.new()
	gs.source_code = src
	gs.reload()
	return gs


# ================================================================ ロボ単体

func _robot_logic() -> void:
	print("-- GuardRobot state machine")
	tl.call("reset")
	var world := Node3D.new()
	root.add_child(world)
	var floor_body := StaticBody3D.new()
	floor_body.collision_layer = 1
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(60, 1, 60)
	cs.shape = bs
	floor_body.add_child(cs)
	floor_body.position = Vector3(0, -0.5, 0)
	world.add_child(floor_body)

	var fake: Node3D = Node3D.new()
	fake.set_script(_script(FAKE_PLAYER_SRC))
	world.add_child(fake)
	fake.global_position = Vector3(0, 0, -6)
	game.set("player", fake)

	var robot_script: GDScript = load(ROBOT_PATH)
	var empty: Array[Vector3] = []
	var r: CharacterBody3D = robot_script.call("create", world, Vector3(0, 0.05, 0), empty)
	var downs := [0]
	var blocks := [0]
	r.connect("shut_down", func() -> void: downs[0] += 1)
	r.connect("shield_blocked", func() -> void: blocks[0] += 1)
	_check(r.is_in_group("enemy"), "ロボは enemy グループに入る")
	_check(r.collision_layer == 4 and r.collision_mask == (1 | 8), "衝突レイヤー ENEMY / マスク WORLD|BOUNDS")

	# 闘技場の外（arena_check=false）では反応しない
	r.set("arena_check", func() -> bool: return false)
	await _frames(30)
	_check(r.call("state_name") == "PATROL", "闘技場の外ではプレイヤーに反応しない（PATROL のまま）")

	# 発見 → 予備動作 → 突進 → 接触ダメージ → 立て直し
	r.set("arena_check", func() -> bool: return true)
	var ok := await _wait_until(func() -> bool: return r.call("state_name") == "ALERT", 0.5)
	_check(ok, "11m以内で ALERT になる")
	ok = await _wait_until(func() -> bool: return r.call("state_name") == "WINDUP", 2.5)
	_check(ok, "向き直ってから WINDUP（予備動作）に入る")
	var t0 := Time.get_ticks_msec()
	var frames := 0
	while r.call("state_name") == "WINDUP" and frames < 200:
		await physics_frame
		frames += 1
	_check(frames >= 50 and frames <= 58, "予備動作は約0.9秒（%d フレーム）" % frames)
	_check(r.call("state_name") == "CHARGE", "予備動作の後に CHARGE")
	ok = await _wait_until(func() -> bool: return r.call("state_name") == "RECOVER", 1.5)
	_check(ok, "突進は止まって RECOVER になる")
	_check(int(fake.get("damage")) == 1, "突進が当たると take_damage(1)")
	ok = await _wait_until(func() -> bool: return r.call("state_name") == "ALERT", 1.3)
	_check(ok, "RECOVER の後は ALERT に戻る")

	# ダッシュの無敵中は当たらない
	fake.set("invulnerable_t", 99.0)
	fake.global_position = r.global_position + (-r.global_transform.basis.z) * 5.0
	ok = await _wait_until(func() -> bool: return r.call("state_name") == "CHARGE", 3.0)
	await _wait_until(func() -> bool: return r.call("state_name") != "CHARGE", 1.5)
	_check(int(fake.get("damage")) == 1, "無敵中（ダッシュ）は突進のダメージを受けない")
	fake.set("invulnerable_t", 0.0)

	# 盾があるうちは攻撃が弾かれる
	var st_before: String = r.call("state_name")
	r.call("on_player_attack", fake)
	_check(blocks[0] == 1, "盾があると shield_blocked が出る")
	_check(r.get("hits") == 0, "盾があるとダメージが通らない")
	_check((fake.get("_knockback") as Vector3).length() > 1.0, "盾に弾かれてプレイヤーが少し押し戻される")
	_check(r.call("state_name") == st_before or r.call("state_name") != "OFF", "盾に弾かれても状態は変わらない")

	# クローで盾をはがす → ひるむ
	var shield: Node3D = r.get("shield")
	var claw: Node3D = Node3D.new()
	claw.set_script(_script(FAKE_CLAW_SRC))
	world.add_child(claw)
	claw.set("player", fake)
	_check(shield.call("can_grab"), "盾はクローでつかめる（ClawTarget / claw_target グループ）")
	_check(shield.is_in_group("claw_target"), "盾は claw_target グループに入る")
	claw.set("held", shield)
	shield.call("on_grab", claw)
	_check(r.get("_frozen") == true, "つかまれている間ロボは止まる")
	shield.call("on_hold_start", claw)
	var n := 0
	while not claw.get("released") and n < 60:
		shield.call("hold_process", 1.0 / 60.0, claw)
		await physics_frame
		n += 1
	_check(claw.get("released"), "盾を引きはがすとクロー側から自動で解除される（%d フレーム）" % n)
	_check(r.call("state_name") == "STUNNED", "盾をはがすと STUNNED")
	_check(not shield.visible and not shield.call("can_grab"), "はがした盾は消え、つかめない")
	_check(is_equal_approx(float(r.get("_stun_time")), 4.0), "標準クローではひるみ4秒")

	# ひるみ中に2回攻撃 → 機能停止
	r.call("on_player_attack", fake)
	_check(r.get("hits") == 1 and r.call("state_name") == "STUNNED", "1回目の攻撃でまだ停止しない")
	r.call("on_player_attack", fake)
	_check(r.call("state_name") == "OFF" and r.call("is_disabled"), "2回目の攻撃で機能停止（OFF）")
	_check(downs[0] == 1, "shut_down シグナルが1回出る")
	_check(not r.is_in_group("enemy"), "停止したロボは enemy グループから外れる")
	r.call("on_player_attack", fake)
	_check(downs[0] == 1, "停止後の攻撃では何も起きない")

	# ひるみが切れると盾が再生する（長距離クローは3秒）
	tl.set("equipment", "claw_long")
	var r2: CharacterBody3D = robot_script.call("create", world, Vector3(6, 0.05, 0), empty)
	r2.set("arena_check", func() -> bool: return true)
	await _frames(2)
	var sh2: Node3D = r2.get("shield")
	r2.call("on_shield_ripped", sh2.global_transform)
	_check(is_equal_approx(float(r2.get("_stun_time")), 3.0), "長距離クローではひるみ3秒（仕様 §11.1）")
	ok = await _wait_until(func() -> bool: return r2.call("state_name") == "ALERT", 3.4)
	_check(ok and r2.call("shield_up"), "ひるみが切れると盾が再生して ALERT に戻る")
	tl.set("equipment", "claw_standard")

	# 行動範囲から出ない
	var r3: CharacterBody3D = robot_script.call("create", world, Vector3(-6, 0.05, 0), empty)
	r3.set("bounds", Rect2(-8.0, -2.0, 4.0, 4.0))
	r3.set("arena_check", func() -> bool: return true)
	fake.global_position = Vector3(-6, 0, -12)
	await _frames(240)
	var p3 := r3.global_position
	_check(p3.x >= -8.01 and p3.x <= -3.99 and p3.z >= -2.01 and p3.z <= 2.01, "突進しても行動範囲（bounds）の外に出ない")

	game.set("player", null)
	world.queue_free()
	await _frames(3)


# ================================================================ シーン：冒頭

func _advance_dialogue(max_secs: float = 8.0) -> void:
	var n := int(max_secs * 60.0)
	for i in n:
		if hud.call("is_dialogue_active"):
			hud.emit_signal("_line_advanced")
		await physics_frame


func _wait_dialogue(secs: float) -> bool:
	return await _wait_until(func() -> bool: return hud.call("is_dialogue_active"), secs)


func _load_scene(spawn: String) -> Node:
	var tt := root.get_node("TimeTravel")
	tt.set("pending_spawn", spawn)
	tt.set("pending_fx", 1)
	var inst: Node = (load(SCENE_PATH) as PackedScene).instantiate()
	root.add_child(inst)
	return inst


func _unload(inst: Node) -> void:
	if is_instance_valid(inst):
		inst.queue_free()
	await _frames(3)
	hud.call("reset_for_title")
	game.set("input_locked", false)
	game.set("in_gameplay", false)


func _future_intro_flow() -> void:
	print("-- Future_Canal intro flow")
	tl.call("reset")
	var era: Node = _load_scene("future_intro")
	var ok := await _wait_dialogue(3.0)
	_check(ok, "冒頭のルートの通達（future_intro_start）が始まる")
	await _advance_dialogue(2.0)
	var route: Node = era.get("route")
	ok = await _wait_until(func() -> bool: return route.get("closing"), 2.0)
	_check(ok, "会話の後に経路閉鎖が始まる")
	var player: Node3D = era.get("player")
	_check(player.global_position.x < -28.0, "プレイヤーは追走路の始点にいる")
	# 落下 → 最初からやり直し（タイル復元）
	await _wait_until(func() -> bool: return int(route.call("tiles_gone")) > 0, 4.0)
	_check(int(route.call("tiles_gone")) > 0, "前線が通過したタイルが沈む")
	player.global_position = Vector3(-17.0, -1.0, 8.0)
	ok = await _wait_until(func() -> bool: return int(route.call("tiles_gone")) == 0 and not route.get("closing"), 2.0)
	_check(ok, "落下するとタイルが元に戻る")
	ok = await _wait_until(func() -> bool: return route.get("closing"), 3.0)
	await _frames(2)
	_check(ok and player.global_position.x < -28.0, "落下後は追走の最初からやり直す")
	# 実際に走って逃げ切れるか（前進を押しっぱなし、切れ目でジャンプ、シャッターは待つ）
	var falls0 := float(tl.get("metrics").get("falls", 0))
	# 最悪のケース：シャッターに着いた時にちょうど閉じている（約1.3秒待たされる）
	route.call("set_shutter_phase", 0.72)
	Input.action_press("move_forward")
	var jumped := false
	var jump_t := 0
	var min_gap := INF
	var t_run := 0
	while t_run < 60 * 20 and player.global_position.x < 4.6:
		var px := player.global_position.x
		if px < -25.0:
			jumped = false
		if not jumped and px > -19.0 and px < -18.0 and player.call("is_on_floor"):
			Input.action_press("jump")
			jumped = true
			jump_t = 0
		jump_t += 1
		if jumped and jump_t == 25:
			Input.action_release("jump")
		if route.get("closing"):
			min_gap = minf(min_gap, px - float(route.get("front_x")))
		await physics_frame
		t_run += 1
		if t_run % 60 == 0 and OS.has_environment("ROBOT_CHECK_VERBOSE"):
			print("    run t=%d pos=%s floor=%s locked=%s vel=%s" % [t_run / 60, player.global_position, player.call("is_on_floor"), game.get("input_locked"), player.get("velocity")])
	Input.action_release("move_forward")
	Input.action_release("jump")
	var fell := float(tl.get("metrics").get("falls", 0)) > falls0
	_check(player.global_position.x >= 4.6 and not fell, "前進＋切れ目でジャンプで、落ちずに足場まで逃げ切れる（%.1f秒・前線との最小距離 %.1fm）" % [t_run / 60.0, min_gap])
	# 安全な足場へ → 閉鎖中の保守路を見せる → 時の裂け目
	if player.global_position.x < 4.6:
		player.global_position = Vector3(8.0, 4.3, 8.0)
	ok = await _wait_dialogue(6.0)
	_check(ok and era.get("_chase_done"), "足場に着くと閉鎖中の保守路を見せ、future_intro_platform へ")
	_check((era.get("gate_switch") as Node).get("current") == "A", "冒頭の保守路は閉鎖（variant A）")
	await _advance_dialogue(1.5)
	var rift: Node3D = era.get("rift")
	_check(rift != null, "時の裂け目が現れる")
	_check(era.get("targets").get("intro_goal") == rift, "目標マーカーは時の裂け目を指す")
	await _frames(45)
	player.global_position = rift.global_position + Vector3(0, -1.2, 0)
	ok = await _wait_dialogue(2.0)
	_check(ok, "裂け目に触れると future_intro_rift")
	await _advance_dialogue(0.5)
	_check(tl.get("intro_done") == true, "intro_done = true")
	_check(tl.get("checkpoint") == "present_start" and int(tl.get("current_era")) == 2026, "続きは2026年 present_start から")
	# TimeTravel が2026年のシーンへ切り替えるのを待ってから片付ける
	await _frames(150)
	await _unload(era)
	if current_scene:
		current_scene.queue_free()
		current_scene = null
	await _frames(3)
	root.get_node("TimeTravel").set("busy", false)


# ================================================================ シーン：帰還〜ゴール

func _future_return_flow() -> void:
	print("-- Future_Canal return flow")
	tl.call("reset")
	for f in ["intro_done", "gate_repaired", "genbei_drawing_found", "drawing_confirmed"]:
		tl.set(f, true)
	var era: Node = _load_scene("future_return")
	_check((era.get("gate_switch") as Node).get("current") == "B", "絵図の記録確認後は空中回廊（variant B）")
	var ok := await _wait_dialogue(3.0)
	_check(ok, "帰還の会話（future_return）")
	await _advance_dialogue(1.0)
	var sora: Node3D = era.get("sora")
	_check(sora != null, "回廊の上にソラがいる")
	# 変化を見せる演出（3.2秒）の後、近づくと話しかける
	await _frames(220)
	var player: Node3D = era.get("player")
	player.global_position = sora.global_position + Vector3(1.5, 0.3, 0)
	ok = await _wait_dialogue(2.0)
	_check(ok, "ソラに近づくと sora_first が始まる")
	await _advance_dialogue(1.5)
	_check(tl.get("met_sora") == true and tl.get("checkpoint") == "future_return", "met_sora と checkpoint(future_return)")
	# 戦闘：盾をはがして2回攻撃 ×2体
	player.global_position = Vector3(12.0, 4.3, -16.0)
	await _frames(10)
	var robots: Array = era.get("robots")
	_check(robots.size() == 2, "警備ロボは2体")
	_check(era.call("_player_in_arena"), "闘技場の中を判定できる")
	var barrier_wall: Node = era.get("_barrier_wall")
	var bcs := barrier_wall.find_children("*", "CollisionShape3D", true, false)[0] as CollisionShape3D
	_check(not bcs.disabled, "戦闘前は東の封鎖壁が閉じている")
	for r in robots:
		var sh: Node3D = r.get("shield")
		r.call("on_shield_ripped", sh.global_transform)
		r.call("on_player_attack", player)
		r.call("on_player_attack", player)
		await _frames(5)
	_check(int(tl.get("robots_defeated")) == 2 and tl.call("is_robot_combat_cleared"), "2体停止で robots_defeated = 2")
	ok = await _wait_dialogue(3.0)
	_check(ok, "robots_cleared の会話")
	await _advance_dialogue(1.5)
	await _frames(5)
	_check(bcs.disabled, "戦闘後に封鎖壁が開く")
	# ゴール
	player.global_position = Vector3(26.0, 4.3, -21.0)
	ok = await _wait_until(func() -> bool: return tl.get("prologue_cleared") == true, 1.0)
	_check(ok, "光の地点に触れると prologue_cleared = true")
	ok = await _wait_until(func() -> bool: return hud.get("choice_panel").visible, 4.0)
	_check(ok, "序章クリアの画面（show_ending）が出る")
	var body: String = hud.get("choice_body").text
	_check(body.contains("第1章『仕掛け横丁の約束』へ つづく") and body.contains("プレイ時間"), "まとめに続きの章と記録が入る")
	await _unload(era)
	# 読み込み時の再現：停止済みのロボと開いた封鎖壁
	tl.set("robots_defeated", 2)
	tl.set("met_sora", true)
	var era2: Node = _load_scene("future_return")
	await _frames(10)
	var all_off := true
	for r in era2.get("robots"):
		all_off = all_off and r.call("is_disabled")
	_check(all_off, "停止済みのロボは停止した姿で置かれる")
	var bw2: Node = era2.get("_barrier_wall")
	await _frames(2)
	_check((bw2.find_children("*", "CollisionShape3D", true, false)[0] as CollisionShape3D).disabled, "読み込み時に封鎖壁は開いたまま")
	await _unload(era2)
