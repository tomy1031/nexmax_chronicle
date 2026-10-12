class_name ClawController
extends Node3D
## NMClaw の操作（仕様 §5.2 / §5.3）。
## 右クリック長押し（Q）で構え、近くの対象を自動で補助照準。構え中の左クリック（E）でつかむ。
## 保持中は構えを離しても保持を続け、左クリックで離す（意図しない解除を防ぐ）。

signal state_changed(state: int)

const RANGE_STANDARD := 5.0
const RANGE_LONG := 7.5
const AIM_CONE_DEG := 55.0
const BEAM_COLOR := Color(0.35, 0.9, 1.0)

var sm := ClawStateMachine.new()
var player: Node3D
var range_m := RANGE_STANDARD
var aimed: ClawTarget = null
var held: ClawTarget = null

var _beam_pivot: Node3D
var _beam: MeshInstance3D
var _head: Node3D
var _prongs: Array[Node3D] = []
var _beam_len := 0.0
var _last_state := -1
var _misfire_t := 0.0
var _grab_point := Vector3.ZERO


func setup(p: Node3D) -> void:
	player = p
	top_level = true
	_build_visuals()


func state() -> int:
	return sm.state


func state_name() -> String:
	return ClawStateMachine.state_name(sm.state)


func is_aiming() -> bool:
	return sm.state == ClawStateMachine.State.AIMING


func is_holding() -> bool:
	return sm.state == ClawStateMachine.State.HOLDING or sm.state == ClawStateMachine.State.GRABBING


func _physics_process(delta: float) -> void:
	if player == null:
		return
	range_m = RANGE_LONG if TimelineState.equipment == "claw_long" else RANGE_STANDARD
	var can_act: bool = not Game.input_locked and player.call("can_act")
	var aim_held := Input.is_action_pressed("claw_aim") and can_act

	if sm.state == ClawStateMachine.State.IDLE and aim_held:
		sm.begin_aim()
		Sfx.play("aim", 1.0, -6.0)
	elif sm.state == ClawStateMachine.State.AIMING and not aim_held:
		sm.end_aim()
		aimed = null

	if sm.state == ClawStateMachine.State.AIMING:
		var t := find_target()
		if t != aimed:
			aimed = t
			if t:
				Sfx.play("lock", 1.0, -4.0)

	var ev := sm.tick(delta, aim_held)
	if ev == ClawStateMachine.Event.HOLD_STARTED and held:
		held.on_hold_start(self)
		TimelineState.add_metric("claw_grabs")

	if sm.state == ClawStateMachine.State.HOLDING:
		if held == null or not is_instance_valid(held) or not held.can_keep_holding():
			force_release()
		else:
			held.hold_process(delta, self)

	if _misfire_t > 0.0:
		_misfire_t -= delta
	_update_visuals(delta)
	_update_hud()
	if sm.state != _last_state:
		_last_state = sm.state
		state_changed.emit(sm.state)
		Hud.set_claw_state(sm.state)


## 左クリック（E）。クローが使ったら true。false なら基本攻撃へ回す。
func handle_primary() -> bool:
	match sm.state:
		ClawStateMachine.State.AIMING:
			if aimed and aimed.can_grab():
				sm.try_grab(true)
				held = aimed
				aimed = null
				_grab_point = held.claw_point()
				held.on_grab(self)
				Sfx.play("grab")
			else:
				Sfx.play("misfire")
				_misfire_t = 0.3
				TimelineState.add_metric("claw_misgrabs")
				Hud.hint("つかめる対象がない（約%dm以内の光る物をねらおう）" % int(range_m), 2.5)
			return true
		ClawStateMachine.State.HOLDING:
			release()
			return true
		ClawStateMachine.State.GRABBING, ClawStateMachine.State.RELEASING:
			return true
	return false


func release() -> void:
	if held == null:
		return
	var t := held
	held = null
	sm.release()
	Sfx.play("release")
	t.on_release(self)


## 対象の側から解除する（盾をはがし終えた時など）。
func force_release(silent: bool = false) -> void:
	if held == null:
		if sm.state == ClawStateMachine.State.HOLDING or sm.state == ClawStateMachine.State.GRABBING:
			sm.release()
		return
	var t := held
	held = null
	sm.release()
	if not silent:
		Sfx.play("release", 0.9)
	if is_instance_valid(t):
		t.on_release(self)


func cancel() -> void:
	if held:
		force_release(true)
	sm.reset()
	aimed = null


## 運ぶ物を浮かせる位置（カメラの向きの前方）。
func hold_point(height: float = 1.4) -> Vector3:
	var fwd: Vector3 = player.call("camera_forward_flat")
	return player.global_position + fwd * 2.1 + Vector3.UP * height


func find_target() -> ClawTarget:
	var cam: Camera3D = player.get("camera")
	var fwd := -cam.global_transform.basis.z
	fwd.y = 0.0
	fwd = fwd.normalized()
	var origin := player.global_position + Vector3.UP * 0.8
	var best: ClawTarget = null
	var best_score := INF
	for n in get_tree().get_nodes_in_group("claw_target"):
		var t := n as ClawTarget
		if t == null or not t.can_grab():
			continue
		var to := t.claw_point() - origin
		var d := to.length()
		if d > range_m + t.extra_range:
			continue
		var flat := Vector3(to.x, 0.0, to.z)
		var ang := 0.0 if flat.length() < 0.3 else fwd.angle_to(flat.normalized())
		if ang > deg_to_rad(AIM_CONE_DEG):
			continue
		var score := ang * 2.0 + d / range_m
		if score < best_score:
			best_score = score
			best = t
	return best


func _target_point() -> Vector3:
	if held and is_instance_valid(held):
		return held.claw_point()
	return _grab_point


func _update_visuals(delta: float) -> void:
	var model: Node = player.get("model")
	if model == null:
		return
	var hand: Vector3 = model.call("hand_global")
	var want := 0.0
	var end := hand
	match sm.state:
		ClawStateMachine.State.GRABBING:
			end = _target_point()
			want = hand.distance_to(end) * (1.0 - sm.timer / ClawStateMachine.GRAB_TIME)
		ClawStateMachine.State.HOLDING:
			end = _target_point()
			want = hand.distance_to(end)
		ClawStateMachine.State.RELEASING:
			end = _grab_point
			want = 0.0
	if held and is_instance_valid(held):
		_grab_point = held.claw_point()
	_beam_len = want if sm.state != ClawStateMachine.State.RELEASING else move_toward(_beam_len, 0.0, delta * 40.0)
	var show := _beam_len > 0.05
	_beam_pivot.visible = show
	if show:
		var dir := (end - hand)
		if dir.length() < 0.01:
			dir = Vector3.FORWARD
		_beam_pivot.global_position = hand
		_beam_pivot.look_at(hand + dir.normalized(), Vector3.UP if absf(dir.normalized().y) < 0.98 else Vector3.RIGHT)
		_beam.scale = Vector3(1.0, _beam_len, 1.0)
		_beam.position = Vector3(0, 0, -_beam_len * 0.5)
		_head.position = Vector3(0, 0, -_beam_len)
		var closed := sm.state == ClawStateMachine.State.HOLDING
		for i in _prongs.size():
			var p := _prongs[i]
			p.rotation.x = lerpf(p.rotation.x, -0.15 if closed else -0.75, delta * 18.0)
		_head.rotation.z += delta * (2.0 if closed else 8.0)


func _update_hud() -> void:
	var cam: Camera3D = player.get("camera")
	match sm.state:
		ClawStateMachine.State.AIMING:
			if aimed and not cam.is_position_behind(aimed.claw_point()):
				Hud.set_reticle(2, cam.unproject_position(aimed.claw_point()))
			else:
				Hud.set_reticle(1, Vector2.ZERO)
		ClawStateMachine.State.GRABBING, ClawStateMachine.State.HOLDING:
			var p := _target_point()
			if not cam.is_position_behind(p):
				Hud.set_reticle(3, cam.unproject_position(p))
			else:
				Hud.set_reticle(0, Vector2.ZERO)
		_:
			Hud.set_reticle(0, Vector2.ZERO)


func _build_visuals() -> void:
	_beam_pivot = Node3D.new()
	add_child(_beam_pivot)
	_beam = MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.045
	cm.bottom_radius = 0.045
	cm.height = 1.0
	cm.radial_segments = 8
	_beam.mesh = cm
	_beam.rotation_degrees = Vector3(90, 0, 0)
	_beam.material_override = LevelKit.mat(BEAM_COLOR, 2.4, 0.4)
	_beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_beam_pivot.add_child(_beam)
	_head = Node3D.new()
	_beam_pivot.add_child(_head)
	var ring := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.1
	tm.outer_radius = 0.16
	tm.rings = 12
	tm.ring_segments = 6
	ring.mesh = tm
	ring.rotation_degrees = Vector3(90, 0, 0)
	ring.material_override = LevelKit.mat(BEAM_COLOR, 2.0, 0.4)
	_head.add_child(ring)
	var pm := BoxMesh.new()
	pm.size = Vector3(0.05, 0.05, 0.26)
	for i in 3:
		var arm := Node3D.new()
		arm.rotation.z = TAU * i / 3.0
		_head.add_child(arm)
		var hinge := Node3D.new()
		hinge.position = Vector3(0, 0.13, 0)
		arm.add_child(hinge)
		var prong := MeshInstance3D.new()
		prong.mesh = pm
		prong.position = Vector3(0, 0, -0.12)
		prong.material_override = LevelKit.mat(Color(0.85, 0.95, 1.0), 1.2, 0.4)
		hinge.add_child(prong)
		_prongs.append(hinge)
	_beam_pivot.visible = false
