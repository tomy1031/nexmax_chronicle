class_name Player
extends CharacterBody3D
## 三人称の移動・ジャンプ・ダッシュ・カメラ（P0 相当）と、調べる／攻撃／被弾／落下復帰。
## カメラ方向基準の WASD 移動、着地直前のジャンプ入力受付、短距離ダッシュ。

signal died

const WALK_SPEED := 6.2
const ACCEL := 40.0
const AIR_ACCEL := 18.0
const GRAVITY := 24.0
const JUMP_VELOCITY := 9.4
const COYOTE_TIME := 0.12
const JUMP_BUFFER := 0.14
const DASH_SPEED := 16.0
const DASH_TIME := 0.18
const DASH_COST := 0.28
const DASH_COOLDOWN := 0.3
const ENERGY_REGEN := 0.32
const MAX_HP := 5
const CAM_DISTANCE := 4.6
const CAM_AIM_DISTANCE := 3.2

var model: NexmaxModel
var claw: ClawController
var cam_pivot: Node3D
var spring: SpringArm3D
var camera: Camera3D

var yaw := 0.0
var pitch := -0.32
var hp := MAX_HP
var energy := 1.0
var last_safe_position := Vector3.ZERO
var invulnerable_t := 0.0

var _coyote := 0.0
var _jump_buffer := 0.0
var _dash_t := 0.0
var _dash_cd := 0.0
var _dash_dir := Vector3.ZERO
var _attack_cd := 0.0
var _was_on_floor := true
var _safe_timer := 0.0
var _knockback := Vector3.ZERO
var _focus: Interactable = null
var _dust: CPUParticles3D
var _respawning := false
var _cam_override: Camera3D = null


func _ready() -> void:
	add_to_group("player")
	Game.player = self
	collision_layer = LevelKit.LAYER_PLAYER
	collision_mask = LevelKit.LAYER_WORLD | LevelKit.LAYER_BOUNDS
	floor_snap_length = 0.3
	floor_max_angle = deg_to_rad(50)
	if get_node_or_null("CollisionShape3D") == null:
		var cs := CollisionShape3D.new()
		cs.name = "CollisionShape3D"
		var cap := CapsuleShape3D.new()
		cap.radius = 0.36
		cap.height = 1.25
		cs.shape = cap
		cs.position = Vector3(0, 0.63, 0)
		add_child(cs)

	model = NexmaxModel.new()
	add_child(model)

	cam_pivot = Node3D.new()
	cam_pivot.top_level = true
	add_child(cam_pivot)
	spring = SpringArm3D.new()
	spring.spring_length = CAM_DISTANCE
	spring.margin = 0.25
	spring.collision_mask = LevelKit.LAYER_WORLD
	var probe := SphereShape3D.new()
	probe.radius = 0.25
	spring.shape = probe
	cam_pivot.add_child(spring)
	camera = Camera3D.new()
	camera.fov = 68.0
	camera.near = 0.08
	camera.far = 600.0
	spring.add_child(camera)
	camera.current = true

	claw = ClawController.new()
	add_child(claw)
	claw.setup(self)

	_dust = CPUParticles3D.new()
	_dust.emitting = false
	_dust.amount = 16
	_dust.lifetime = 0.5
	_dust.one_shot = true
	_dust.explosiveness = 0.9
	var dm := SphereMesh.new()
	dm.radius = 0.12
	dm.height = 0.24
	dm.radial_segments = 6
	dm.rings = 3
	_dust.mesh = dm
	_dust.material_override = LevelKit.mat(Color(0.95, 0.95, 0.95, 0.8))
	_dust.direction = Vector3.UP
	_dust.spread = 80.0
	_dust.initial_velocity_min = 1.0
	_dust.initial_velocity_max = 2.5
	_dust.gravity = Vector3(0, -2, 0)
	_dust.scale_amount_min = 0.5
	_dust.scale_amount_max = 1.2
	add_child(_dust)

	last_safe_position = global_position
	_sync_hud()


## プレイヤーをある位置・向きに置き直す（スポーン・リスポーン）。
func place_at(pos: Vector3, yaw_deg: float) -> void:
	global_position = pos
	velocity = Vector3.ZERO
	yaw = deg_to_rad(yaw_deg)
	pitch = -0.3
	model.rotation.y = yaw
	last_safe_position = pos
	_update_camera(1.0)
	if spring:
		spring.spring_length = CAM_DISTANCE


func can_act() -> bool:
	return not Game.input_locked and not _respawning and not get_tree().paused


func camera_forward_flat() -> Vector3:
	var f := -cam_pivot.global_transform.basis.z
	f.y = 0.0
	return f.normalized() if f.length() > 0.01 else Vector3.FORWARD


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var m := event as InputEventMouseMotion
		yaw -= m.relative.x * Game.mouse_sensitivity
		pitch -= m.relative.y * Game.mouse_sensitivity * (-1.0 if Game.invert_y else 1.0)
		pitch = clampf(pitch, -1.2, 0.55)
	elif event is InputEventMouseButton and event.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and Game.in_gameplay and not Game.input_locked:
			Game.capture_mouse()
			get_viewport().set_input_as_handled()
			return
	if not can_act():
		return
	if event.is_action_pressed("primary"):
		if not claw.handle_primary():
			_attack()
	elif event.is_action_pressed("interact"):
		if _focus and is_instance_valid(_focus) and _focus.enabled:
			Sfx.play("ui")
			_focus.interact()


func _physics_process(delta: float) -> void:
	if invulnerable_t > 0.0:
		invulnerable_t -= delta
	_dash_cd = maxf(0.0, _dash_cd - delta)
	_attack_cd = maxf(0.0, _attack_cd - delta)
	energy = minf(1.0, energy + ENERGY_REGEN * delta * (0.4 if _dash_t > 0.0 else 1.0))

	var input_vec := Vector2.ZERO
	var acting := can_act()
	if acting:
		input_vec = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var basis_flat := Basis(Vector3.UP, yaw)
	var dir := (basis_flat.x * input_vec.x + basis_flat.z * input_vec.y)
	if dir.length() > 1.0:
		dir = dir.normalized()

	# 保持中は動きを遅くし、その場で支える対象からは離れられない
	var speed := WALK_SPEED
	var holding := claw.is_holding()
	if holding and claw.held:
		speed *= claw.held.move_factor
	elif claw.is_aiming():
		speed *= 0.75

	# 重力・ジャンプ（コヨーテタイムと先行入力）
	var on_floor := is_on_floor()
	if on_floor:
		_coyote = COYOTE_TIME
	else:
		_coyote -= delta
		velocity.y -= GRAVITY * delta
		velocity.y = maxf(velocity.y, -30.0)
	if acting and Input.is_action_just_pressed("jump"):
		_jump_buffer = JUMP_BUFFER
	else:
		_jump_buffer -= delta
	if _jump_buffer > 0.0 and _coyote > 0.0 and not holding:
		velocity.y = JUMP_VELOCITY
		_jump_buffer = 0.0
		_coyote = 0.0
		model.squash(Vector3(0.85, 1.2, 0.85))
		Sfx.play("jump")
	if acting and Input.is_action_just_released("jump") and velocity.y > 3.0:
		velocity.y *= 0.55

	# ダッシュ
	if acting and Input.is_action_just_pressed("dash") and _dash_cd <= 0.0 and not holding:
		if energy >= DASH_COST * 0.5:
			energy = maxf(0.0, energy - DASH_COST)
			_dash_t = DASH_TIME
			_dash_cd = DASH_COOLDOWN
			_dash_dir = dir if dir.length() > 0.1 else -model.global_transform.basis.z
			_dash_dir.y = 0.0
			_dash_dir = _dash_dir.normalized()
			invulnerable_t = maxf(invulnerable_t, DASH_TIME + 0.05)
			model.squash(Vector3(0.8, 0.85, 1.35))
			Sfx.play("dash")
			_puff()
		else:
			Hud.hint("エネルギーが足りない", 1.2)

	var h_vel := Vector3(velocity.x, 0.0, velocity.z)
	if _dash_t > 0.0:
		_dash_t -= delta
		h_vel = _dash_dir * DASH_SPEED
		if not on_floor:
			velocity.y = maxf(velocity.y, 0.0)
	else:
		var accel := ACCEL if on_floor else AIR_ACCEL
		h_vel = h_vel.move_toward(dir * speed, accel * delta)
	h_vel += _knockback
	_knockback = _knockback.move_toward(Vector3.ZERO, 30.0 * delta)
	velocity.x = h_vel.x
	velocity.z = h_vel.z

	move_and_slide()

	# 保持対象への距離制限
	if holding and claw.held and claw.held.leash > 0.0:
		var anchor := claw.held.claw_point()
		var off := global_position - anchor
		off.y = 0.0
		if off.length() > claw.held.leash:
			var fixed := anchor + off.normalized() * claw.held.leash
			global_position = Vector3(fixed.x, global_position.y, fixed.z)

	# 着地
	var now_floor := is_on_floor()
	if now_floor and not _was_on_floor:
		model.squash(Vector3(1.2, 0.8, 1.2))
		Sfx.play("land", 1.0, -6.0)
		_puff()
	_was_on_floor = now_floor

	# 向き
	var face_dir := Vector3(velocity.x, 0.0, velocity.z)
	if claw.is_aiming() or holding:
		var tgt := claw.aimed.claw_point() if claw.aimed else (claw.held.claw_point() if claw.held else global_position + camera_forward_flat())
		face_dir = tgt - global_position
		face_dir.y = 0.0
	if face_dir.length() > 0.2:
		var want := atan2(-face_dir.x, -face_dir.z)
		model.rotation.y = lerp_angle(model.rotation.y, want, 1.0 - exp(-14.0 * delta))

	model.animate(delta, Vector2(velocity.x, velocity.z).length(), now_floor, velocity.y, claw.is_aiming(), holding)

	_track_safe_ground(delta, now_floor)
	_check_hazards()
	_update_camera(delta)
	_update_focus()
	_sync_hud()


func _update_camera(delta: float) -> void:
	var target := global_position + Vector3(0, 1.25, 0)
	if cam_pivot.global_position.distance_to(target) > 6.0 or delta >= 1.0:
		cam_pivot.global_position = target
	else:
		cam_pivot.global_position = cam_pivot.global_position.lerp(target, 1.0 - exp(-18.0 * delta))
	cam_pivot.rotation = Vector3(pitch, yaw, 0.0)
	var aim := claw.is_aiming() or claw.is_holding()
	var want_len := CAM_AIM_DISTANCE if aim else CAM_DISTANCE
	spring.spring_length = lerpf(spring.spring_length, want_len, 1.0 - exp(-8.0 * delta))
	var want_off := Vector3(0.55 if aim else 0.0, 0.0, 0.0)
	spring.position = want_off if delta >= 1.0 else spring.position.lerp(want_off, 1.0 - exp(-8.0 * delta))


func _update_focus() -> void:
	var best: Interactable = null
	var best_d := INF
	if can_act() and not claw.is_holding():
		for n in get_tree().get_nodes_in_group("interactable"):
			var it := n as Interactable
			if it == null or not it.enabled or not it.is_visible_in_tree():
				continue
			var d := it.global_position.distance_to(global_position)
			if d < it.radius and d < best_d and absf(it.global_position.y - global_position.y) < 2.5:
				best = it
				best_d = d
	_focus = best
	if best:
		var p := best.global_position + best.label_offset
		var sp: Variant = null
		if not camera.is_position_behind(p):
			sp = camera.unproject_position(p)
		Hud.prompt(best.prompt_text, "F", sp)
	else:
		Hud.prompt("")


func _track_safe_ground(delta: float, on_floor: bool) -> void:
	_safe_timer -= delta
	if not on_floor or _safe_timer > 0.0:
		return
	_safe_timer = 0.25
	var era := Game.era_scene
	var water := -INF
	if era and era.has_method("water_level_at"):
		water = era.call("water_level_at", global_position)
	var floor_ok := true
	if era and era.has_method("is_safe_ground"):
		floor_ok = era.call("is_safe_ground", global_position)
	if global_position.y > water + 0.3 and floor_ok:
		last_safe_position = global_position


func _check_hazards() -> void:
	if _respawning:
		return
	var era := Game.era_scene
	var kill_y := -14.0
	var water := -INF
	if era:
		var k: Variant = era.get("kill_y")
		if k != null:
			kill_y = k
		if era.has_method("water_level_at"):
			water = era.call("water_level_at", global_position)
	if global_position.y < water - 0.35:
		Sfx.play("splash")
		_fall_recover("水に流されそうになった！")
	elif global_position.y < kill_y:
		_fall_recover("落下した！")


## 落下復帰：直前の安全な地点へ戻す（P0 合格条件）。
func _fall_recover(msg: String) -> void:
	_respawning = true
	TimelineState.add_metric("falls")
	claw.cancel()
	var era := Game.era_scene
	if era and era.has_method("on_player_fell"):
		era.call("on_player_fell")
	await Hud.fade_out(0.25)
	var pos := last_safe_position
	if era and era.has_method("fall_respawn_position"):
		var alt: Variant = era.call("fall_respawn_position")
		if alt is Vector3:
			pos = alt
	global_position = pos + Vector3(0, 0.2, 0)
	velocity = Vector3.ZERO
	_knockback = Vector3.ZERO
	_update_camera(1.0)
	Hud.hint(msg + " 直前の場所へ戻った", 2.0)
	await Hud.fade_in(0.3)
	_respawning = false


func take_damage(amount: int, from_dir: Vector3 = Vector3.ZERO) -> void:
	if invulnerable_t > 0.0 or _respawning or hp <= 0:
		return
	hp = maxi(0, hp - amount)
	invulnerable_t = 1.0
	model.play_hurt()
	Sfx.play("hurt")
	Hud.flash(Color(1, 0.2, 0.2, 0.35), 0.3)
	var kb := from_dir
	kb.y = 0.0
	if kb.length() > 0.01:
		_knockback = kb.normalized() * 9.0
		velocity.y = 5.0
	if hp <= 0:
		_on_died()


func heal_full() -> void:
	hp = MAX_HP
	energy = 1.0
	_sync_hud()


func add_energy(v: float) -> void:
	energy = minf(1.0, energy + v)


func _on_died() -> void:
	_respawning = true
	TimelineState.add_metric("deaths")
	claw.cancel()
	Hud.toast("機能停止……チェックポイントから再起動", "bad", 2.0)
	died.emit()
	await get_tree().create_timer(0.8).timeout
	await Hud.fade_out(0.4)
	var era := Game.era_scene
	if era and era.has_method("respawn_player"):
		era.call("respawn_player")
	hp = MAX_HP
	energy = 1.0
	await Hud.fade_in(0.4)
	_respawning = false


func _attack() -> void:
	if _attack_cd > 0.0:
		return
	_attack_cd = 0.38
	model.play_attack()
	Sfx.play("dash", 1.6, -8.0)
	var fwd := -model.global_transform.basis.z
	var center := global_position + Vector3.UP * 0.7 + fwd * 0.9
	for n in get_tree().get_nodes_in_group("enemy"):
		var e := n as Node3D
		if e and e.global_position.distance_to(center) < 1.6 and e.has_method("on_player_attack"):
			e.call("on_player_attack", self)


func _puff() -> void:
	_dust.restart()
	_dust.emitting = true


func _sync_hud() -> void:
	Hud.set_status(hp, MAX_HP, energy)
