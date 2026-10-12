class_name GuardRobot
extends CharacterBody3D
## 2086年の小型警備ロボット（仕様 §8）。イノシシ型で、鼻先が短い砲身。破壊ではなく機能停止が中心。
## 状態: PATROL → ALERT（闘技場内のプレイヤーを発見・向き直る「！」）→ WINDUP（約0.9秒の予備動作）
##       → CHARGE（直線の突進）→ RECOVER（約1秒）→ ALERT
## 正面の盾は ClawTarget（robot_shield.gd）。クローで引きはがすと STUNNED（4秒／長距離クローは3秒）。
## ひるみ中に基本攻撃2回で機能停止（OFF）。間に合わなければ盾が再生して ALERT に戻る。

signal shut_down
## 盾がある状態で攻撃された（仲間のヒント用）
signal shield_blocked
## 盾をはがされてひるんだ
signal stunned

enum State { PATROL, ALERT, WINDUP, CHARGE, RECOVER, STUNNED, OFF }

const SHIELD_SCRIPT := preload("res://scripts/enemy/robot_shield.gd")

const SIGHT_RANGE := 11.0
const LOSE_RANGE := 15.0
const PATROL_SPEED := 1.6
const APPROACH_SPEED := 1.8
const KEEP_DISTANCE := 6.0
const TURN_RATE := 6.0
const WINDUP_TIME := 0.9
const WINDUP_LOCK := 0.35      # 最後のこの時間は向きを固定する（見てから避けられる）
const CHARGE_SPEED := 9.0
const CHARGE_TIME := 1.2
const RECOVER_TIME := 1.0
const STUN_TIME := 4.0
const STUN_TIME_LONG := 3.0    # 長距離クロー：届くが、ひるみが短い（仕様 §11.1）
const HITS_TO_STOP := 2
const HIT_RADIUS := 1.1
const GRAVITY := 20.0

const C_IRON := Color(0.42, 0.28, 0.21)
const C_IRON_DARK := Color(0.3, 0.25, 0.25)
const C_BARREL := Color(0.2, 0.21, 0.24)
const C_ACCENT := Color(1.0, 0.55, 0.15)
const C_EYE := Color(1.0, 0.16, 0.1)
const C_EYE_HOT := Color(1.0, 0.85, 0.2)
const C_SHIELD := Color(0.3, 0.78, 1.0, 0.55)

## 同時に突進の予備動作に入れるのは1体だけ（初めての戦闘でも公平に）
static var _attacker: Node = null

## true を返す間だけプレイヤーを狙う（闘技場の外では反応しない）
var arena_check: Callable = func() -> bool: return true
var patrol: Array[Vector3] = []
## 行動範囲（XZ平面。x=X, y=Z）。size が 0 なら制限なし
var bounds := Rect2()

var state: State = State.PATROL
var hits := 0
var state_time := 0.0
var shield: Node3D

var _t := 0.0
var _phase := 0.0
var _patrol_i := 0
var _patrol_wait := 0.0
var _alert_wait := 0.8
var _charge_dir := Vector3.FORWARD
var _hit_done := false
var _wall_bonk := false
var _frozen := false
var _stun_time := STUN_TIME
var _block_cd := 0.0
var _flash_t := 0.0

var _body_root: Node3D
var _body_meshes: Array[MeshInstance3D] = []
var _eyes: Array[MeshInstance3D] = []
var _legs: Array[Node3D] = []
var _ears: Array[Node3D] = []
var _telegraph: Node3D
var _bubble: MeshInstance3D
var _stars: Node3D
var _sparks: CPUParticles3D
var _dust: CPUParticles3D
var _emote: Label3D
var _emote_t := 0.0


static func create(parent: Node, pos: Vector3, p_patrol: Array[Vector3] = []) -> GuardRobot:
	var r := GuardRobot.new()
	r.position = pos
	r.patrol = p_patrol
	parent.add_child(r)
	return r


func _ready() -> void:
	add_to_group("enemy")
	collision_layer = LevelKit.LAYER_ENEMY
	collision_mask = LevelKit.LAYER_WORLD | LevelKit.LAYER_BOUNDS   # 見えない柵でも止まる
	floor_snap_length = 0.3
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.42
	cap.height = 0.95
	cs.shape = cap
	cs.position = Vector3(0, 0.48, 0)
	add_child(cs)
	_build()
	_patrol_wait = randf_range(0.0, 1.0)


func is_disabled() -> bool:
	return state == State.OFF


func shield_up() -> bool:
	return state != State.OFF and state != State.STUNNED and shield != null and shield.visible


func state_name() -> String:
	return State.keys()[state]


# ================================================================ 毎フレーム

func _physics_process(delta: float) -> void:
	_t += delta
	state_time += delta
	_block_cd = maxf(0.0, _block_cd - delta)
	if is_on_floor():
		velocity.y = -0.5
	else:
		velocity.y = maxf(velocity.y - GRAVITY * delta, -25.0)

	var move := Vector3.ZERO
	match state:
		State.PATROL:
			move = _do_patrol(delta)
		State.ALERT:
			move = _do_alert(delta)
		State.WINDUP:
			_do_windup(delta)
		State.CHARGE:
			move = _do_charge(delta)
		State.RECOVER:
			var skid := maxf(0.0, 1.0 - state_time * 4.0)
			move = _charge_dir * CHARGE_SPEED * 0.35 * skid
			if state_time >= RECOVER_TIME:
				_enter(State.ALERT)
		State.STUNNED:
			if state_time >= _stun_time:
				_regen_shield()
				_enter(State.ALERT)
		State.OFF:
			pass
	if _frozen:
		move = Vector3.ZERO
	velocity.x = move.x
	velocity.z = move.z
	move_and_slide()
	_wall_bonk = is_on_wall()
	_wall_bonk = _clamp_to_bounds() or _wall_bonk
	_animate(delta, move.length())


func _process(delta: float) -> void:
	if _emote and _emote_t > 0.0:
		_emote_t -= delta
		_emote.position.y = 1.55 + sin(_emote_t * 9.0) * 0.05
		if _emote_t <= 0.0:
			_emote.visible = false
	if _flash_t > 0.0:
		_flash_t -= delta
		if _flash_t <= 0.0:
			_restore_body_mats()
	if _bubble and _bubble.visible:
		_bubble.scale = _bubble.scale.move_toward(Vector3(1.25, 1.0, 1.4), delta * 2.0)


# ================================================================ 状態

func _enter(s: State) -> void:
	var prev := state
	state = s
	state_time = 0.0
	if _telegraph:
		_telegraph.visible = s == State.WINDUP
	if _dust:
		_dust.emitting = s == State.CHARGE
	if _stars:
		_stars.visible = s == State.STUNNED
	if _sparks:
		_sparks.emitting = s == State.STUNNED
	match s:
		State.ALERT:
			_release_token()
			_alert_wait = randf_range(0.6, 1.2)
			if prev == State.PATROL:
				emote("！", 1.0)
				Sfx.play("lock", 0.6, -2.0)
				_alert_wait = 0.9
		State.WINDUP:
			_attacker = self
			Sfx.play("ratchet", 1.3, -3.0)
		State.CHARGE:
			_hit_done = false
			_charge_dir = _forward()
			Sfx.play("dash", 0.6)
		State.RECOVER:
			_release_token()
		State.PATROL:
			_release_token()
		State.STUNNED, State.OFF:
			_release_token()
	_set_eyes(C_EYE if s != State.OFF else Color.BLACK)


func _release_token() -> void:
	if is_instance_valid(_attacker) and _attacker == self:
		_attacker = null


func _token_free() -> bool:
	if not is_instance_valid(_attacker) or _attacker == self:
		return true
	var other := _attacker as GuardRobot
	return other == null or not other.is_inside_tree() or (other.state != State.WINDUP and other.state != State.CHARGE)


func _player() -> Node3D:
	var p := Game.player as Node3D
	if p and is_instance_valid(p) and p.is_inside_tree():
		return p
	return null


func _flat_to(target: Vector3) -> Vector3:
	var d := target - global_position
	d.y = 0.0
	return d


func _sees_player(rng: float) -> bool:
	var p := _player()
	if p == null:
		return false
	if not arena_check.is_valid() or not bool(arena_check.call()):
		return false
	return _flat_to(p.global_position).length() < rng and absf(p.global_position.y - global_position.y) < 3.0


func _do_patrol(delta: float) -> Vector3:
	if _sees_player(SIGHT_RANGE):
		_enter(State.ALERT)
		return Vector3.ZERO
	if patrol.is_empty():
		# その場で左右を見回す
		rotation.y += sin(_t * 0.7) * delta * 0.6
		return Vector3.ZERO
	if _patrol_wait > 0.0:
		_patrol_wait -= delta
		return Vector3.ZERO
	var target := patrol[_patrol_i % patrol.size()]
	var d := _flat_to(target)
	if d.length() < 0.3:
		_patrol_i += 1
		_patrol_wait = randf_range(0.6, 1.4)
		return Vector3.ZERO
	_turn_towards(d, delta, 4.0)
	return _forward() * PATROL_SPEED


func _do_alert(delta: float) -> Vector3:
	if not _sees_player(LOSE_RANGE):
		_enter(State.PATROL)
		return Vector3.ZERO
	var p := _player()
	var d := _flat_to(p.global_position)
	var facing := _turn_towards(d, delta, TURN_RATE)
	var move := Vector3.ZERO
	if d.length() > KEEP_DISTANCE and facing < 0.5:
		move = _forward() * APPROACH_SPEED
	if state_time >= _alert_wait and facing < 0.3 and d.length() < SIGHT_RANGE and _token_free():
		_enter(State.WINDUP)
	return move


func _do_windup(delta: float) -> void:
	var p := _player()
	if p and state_time < WINDUP_TIME - WINDUP_LOCK:
		_turn_towards(_flat_to(p.global_position), delta, TURN_RATE * 1.4)
	if state_time >= WINDUP_TIME:
		_enter(State.CHARGE)


func _do_charge(_delta: float) -> Vector3:
	var p := _player()
	if p and not _hit_done:
		var tip := global_position + _charge_dir * 0.35
		var d := p.global_position - tip
		var flat := Vector3(d.x, 0.0, d.z)
		if flat.length() < HIT_RADIUS and absf(d.y) < 1.4:
			var inv: Variant = p.get("invulnerable_t")
			if inv == null or float(inv) <= 0.0:
				_hit_done = true
				var push := (_charge_dir + flat.normalized() * 0.6).normalized()
				if p.has_method("take_damage"):
					p.call("take_damage", 1, push)
				_enter(State.RECOVER)
				return Vector3.ZERO
	if state_time >= CHARGE_TIME:
		_enter(State.RECOVER)
		return Vector3.ZERO
	if _wall_bonk and state_time > 0.08:
		# 壁や植え込みにぶつかって止まる
		Sfx.play("land", 0.6)
		_puff_sparks(6)
		_enter(State.RECOVER)
		return Vector3.ZERO
	return _charge_dir * CHARGE_SPEED


## 向きを d へ近づけ、残りの角度（ラジアン）を返す。前方は -Z。
func _turn_towards(d: Vector3, delta: float, rate: float) -> float:
	if d.length() < 0.05:
		return 0.0
	var want := atan2(-d.x, -d.z)
	rotation.y = lerp_angle(rotation.y, want, 1.0 - exp(-rate * delta))
	return absf(angle_difference(rotation.y, want))


func _forward() -> Vector3:
	var f := -global_transform.basis.z
	f.y = 0.0
	return f.normalized() if f.length() > 0.01 else Vector3.FORWARD


func _clamp_to_bounds() -> bool:
	if bounds.size == Vector2.ZERO:
		return false
	var p := global_position
	var cx := clampf(p.x, bounds.position.x, bounds.end.x)
	var cz := clampf(p.z, bounds.position.y, bounds.end.y)
	if not is_equal_approx(cx, p.x) or not is_equal_approx(cz, p.z):
		global_position = Vector3(cx, p.y, cz)
		return true
	return false


# ================================================================ 盾・攻撃

## 盾をつかまれた：引きはがされるまで足を止めてもがく。
func on_shield_grabbed() -> void:
	if state == State.OFF:
		return
	_frozen = true
	if state == State.WINDUP or state == State.CHARGE:
		_telegraph.visible = false
		_dust.emitting = false


func on_shield_grab_cancelled() -> void:
	_frozen = false
	if state == State.WINDUP or state == State.CHARGE:
		_enter(State.RECOVER)


## 盾をはがされた：残骸を落とし、しばらくひるむ。
func on_shield_ripped(at: Transform3D) -> void:
	_frozen = false
	if state == State.OFF:
		return
	shield.visible = false
	(shield as ClawTarget).grab_enabled = false
	_spawn_debris(at)
	Sfx.play("clang", 0.75)
	_stun_time = STUN_TIME_LONG if TimelineState.equipment == "claw_long" else STUN_TIME
	_enter(State.STUNNED)
	emote("ひるんだ！", 1.6)
	Hud.toast("ひるんだ！", "good", 1.2)
	_puff_sparks(10)
	stunned.emit()


func _regen_shield() -> void:
	shield.visible = true
	(shield as ClawTarget).grab_enabled = true
	shield.scale = Vector3(0.05, 0.05, 0.05)
	var tw := create_tween()
	tw.tween_property(shield, "scale", Vector3(1.15, 1.15, 1.15), 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(shield, "scale", Vector3.ONE, 0.12)
	Sfx.play("heal", 1.5, -4.0)
	emote("盾が再生した", 1.2)


## プレイヤーの基本攻撃（player_controller._attack から呼ばれる）。
func on_player_attack(player: Node) -> void:
	if state == State.OFF:
		return
	var p := player as Node3D
	var away := Vector3.ZERO
	if p:
		away = p.global_position - global_position
		away.y = 0.0
		away = away.normalized() if away.length() > 0.01 else -_forward()
	if state == State.STUNNED:
		hits += 1
		Sfx.play("hit", 0.9)
		_flash_body()
		_puff_sparks(8)
		# 少し後ろへ滑らせる
		var tw := create_tween()
		tw.tween_property(self, "global_position", global_position - away * 0.35, 0.12)
		if hits >= HITS_TO_STOP:
			power_down(false)
		else:
			emote("あと%d回！" % (HITS_TO_STOP - hits), 1.2)
		return
	# 盾（全身を覆う防御場）に弾かれる
	Sfx.play("clang")
	_show_bubble()
	if p:
		if "_knockback" in p:
			p.set("_knockback", away * 7.0)
		else:
			p.set("velocity", away * 7.0)
	if _block_cd <= 0.0:
		_block_cd = 2.5
		Hud.hint("盾がじゃま！ クローで引きはがそう（右クリックで構えて左クリック）", 3.5)
	shield_blocked.emit()


## 機能停止（仕様 §8.2：過激な破壊表現ではなく、目の光が消えて座り込む）。instant は読込時の再現用。
func power_down(instant: bool) -> void:
	if state == State.OFF:
		return
	_frozen = false
	_enter(State.OFF)
	remove_from_group("enemy")
	collision_layer = 0
	shield.visible = false
	(shield as ClawTarget).grab_enabled = false
	_set_eyes(Color.BLACK)
	var slump_pos := Vector3(0, -0.17, 0)
	var slump_rot := Vector3(0.12, 0.0, 0.22)
	if instant:
		_body_root.position = slump_pos
		_body_root.rotation = slump_rot
		for e in _ears:
			e.rotation.x = 0.6
		for l in _legs:
			l.rotation = Vector3(0, 0, 0.5 * signf(l.position.x))
		return
	Sfx.play("shutdown")
	emote("機能停止", 2.0)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_body_root, "position", slump_pos, 0.7).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	tw.tween_property(_body_root, "rotation", slump_rot, 0.7)
	for e in _ears:
		tw.tween_property(e, "rotation:x", 0.6, 0.5)
	for l in _legs:
		tw.tween_property(l, "rotation", Vector3(0, 0, 0.5 * signf(l.position.x)), 0.5)
	# 穏やかな火花を少しだけ
	_sparks.amount = 6
	_sparks.emitting = true
	get_tree().create_timer(2.2).timeout.connect(func() -> void:
		if is_instance_valid(_sparks):
			_sparks.emitting = false)
	shut_down.emit()


func emote(text: String, secs: float = 1.5) -> void:
	if _emote == null:
		return
	_emote.text = text
	_emote.visible = true
	_emote_t = secs


# ================================================================ 見た目

func _build() -> void:
	_body_root = Node3D.new()
	add_child(_body_root)
	var iron := LevelKit.char_mat(C_IRON)
	var dark := LevelKit.char_mat(C_IRON_DARK)
	# 胴体（丸いイノシシ型）
	_body_meshes.append(_part(_body_root, _sphere(0.42, 14), Vector3(0, 0.56, 0.05), iron, Vector3.ZERO, Vector3(1.0, 0.82, 1.3)))
	_body_meshes.append(_part(_body_root, _sphere(0.36, 12), Vector3(0, 0.44, 0.08), dark, Vector3.ZERO, Vector3(0.92, 0.62, 1.12)))
	# 動かない小部品は材質ごとに1つにまとめる（ドローコール削減）
	var fixed := Node3D.new()
	_body_root.add_child(fixed)
	# 背中の橙のライン（警備の印）と、たてがみ
	_part(fixed, _box(Vector3(0.12, 0.05, 0.86)), Vector3(0, 0.9, 0.06), LevelKit.char_mat(C_ACCENT), Vector3(-4, 0, 0))
	for i in 3:
		_part(fixed, _cone(0.06, 0.18), Vector3(0, 0.95, -0.2 + i * 0.24), dark, Vector3(35, 0, 0))
	# 鼻先＝短い砲身
	_body_meshes.append(_part(_body_root, _cyl(0.13, 0.34), Vector3(0, 0.5, -0.56), LevelKit.char_mat(C_BARREL), Vector3(90, 0, 0)))
	_part(fixed, _cyl(0.17, 0.08), Vector3(0, 0.5, -0.74), dark, Vector3(90, 0, 0))
	_part(fixed, _cyl(0.09, 0.02), Vector3(0, 0.5, -0.785), LevelKit.unshaded(Color(0.03, 0.03, 0.05)), Vector3(90, 0, 0))
	# 小さな牙
	for sx in [-1.0, 1.0]:
		_part(fixed, _cone(0.035, 0.15), Vector3(0.16 * sx, 0.4, -0.6), LevelKit.char_mat(Color(0.96, 0.94, 0.88)), Vector3(-55, 0, 0))
	# 耳
	for sx in [-1.0, 1.0]:
		var ear := Node3D.new()
		ear.position = Vector3(0.2 * sx, 0.86, -0.28)
		_body_root.add_child(ear)
		_part(ear, _cone(0.09, 0.22), Vector3(0, 0.08, 0), iron, Vector3(0, 0, -22 * sx))
		_ears.append(ear)
	# 赤く光る目
	for sx in [-1.0, 1.0]:
		var e := _part(_body_root, _sphere(0.06, 8), Vector3(0.15 * sx, 0.72, -0.43), LevelKit.glow(C_EYE, 3.0))
		_eyes.append(e)
	# 短い4本足
	for p in [Vector3(-0.25, 0.32, -0.3), Vector3(0.25, 0.32, -0.3), Vector3(-0.25, 0.32, 0.4), Vector3(0.25, 0.32, 0.4)]:
		var leg := Node3D.new()
		leg.position = p
		_body_root.add_child(leg)
		_part(leg, _cyl(0.075, 0.3), Vector3(0, -0.13, 0), dark)
		_part(leg, _cyl(0.1, 0.07), Vector3(0, -0.29, 0), LevelKit.char_mat(C_BARREL))
		_legs.append(leg)
	# しっぽ
	_part(fixed, _cone(0.04, 0.16), Vector3(0, 0.68, 0.64), dark, Vector3(60, 0, 0))
	# 盾を支える腕
	for sx in [-1.0, 1.0]:
		_part(fixed, _box(Vector3(0.06, 0.06, 0.3)), Vector3(0.36 * sx, 0.36, -0.74), dark)
	_merge_by_material(fixed)

	# 正面の盾（クロー対象）
	shield = SHIELD_SCRIPT.new()
	shield.position = Vector3(0, 0.37, -0.92)
	shield.set("robot", self)
	_body_root.add_child(shield)
	_build_shield_visual(shield)

	# 盾に弾かれた時の防御場
	_bubble = _part(self, _sphere(0.62, 12), Vector3(0, 0.52, -0.05), LevelKit.mat(Color(0.4, 0.85, 1.0, 0.3), 1.5))
	_bubble.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_bubble.visible = false

	# 突進の予告（地面の矢印）
	_telegraph = Node3D.new()
	add_child(_telegraph)
	var warn := LevelKit.unshaded(Color(1.0, 0.28, 0.05, 0.62))
	var strip := _part(_telegraph, _box(Vector3(0.85, 0.02, 4.6)), Vector3(0, 0.05, -3.2), warn)
	strip.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for i in 2:
		var chev := _part(_telegraph, _cyl(0.55, 0.02, 3), Vector3(0, 0.07, -2.0 - i * 2.0), LevelKit.unshaded(Color(1.0, 0.85, 0.1, 0.95)), Vector3(0, 180, 0), Vector3(1.0, 1.0, 0.6))
		chev.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_telegraph.visible = false

	# ひるみ中の星
	_stars = Node3D.new()
	_stars.position = Vector3(0, 1.15, 0)
	add_child(_stars)
	for i in 3:
		var a := TAU * i / 3.0
		var st := MeshInstance3D.new()
		st.mesh = LevelKit.diamond_mesh(0.08)
		st.material_override = LevelKit.mat(Color(1.0, 0.9, 0.3), 2.5, 0.4)
		st.position = Vector3(cos(a), 0, sin(a)) * 0.42
		st.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_stars.add_child(st)
	_stars.visible = false

	# 火花（ひるみ・機能停止）
	_sparks = CPUParticles3D.new()
	_sparks.position = Vector3(0, 0.85, 0)
	_sparks.emitting = false
	_sparks.amount = 10
	_sparks.lifetime = 0.55
	_sparks.explosiveness = 0.2
	var sm := BoxMesh.new()
	sm.size = Vector3(0.04, 0.04, 0.1)
	_sparks.mesh = sm
	_sparks.material_override = LevelKit.mat(Color(1.0, 0.85, 0.35), 3.0)
	_sparks.direction = Vector3.UP
	_sparks.spread = 70.0
	_sparks.gravity = Vector3(0, -9.0, 0)
	_sparks.initial_velocity_min = 1.5
	_sparks.initial_velocity_max = 3.0
	add_child(_sparks)

	# 突進の砂ぼこり
	_dust = CPUParticles3D.new()
	_dust.position = Vector3(0, 0.08, 0.3)
	_dust.emitting = false
	_dust.amount = 14
	_dust.lifetime = 0.45
	var dm := SphereMesh.new()
	dm.radius = 0.1
	dm.height = 0.2
	dm.radial_segments = 6
	dm.rings = 3
	_dust.mesh = dm
	_dust.material_override = LevelKit.mat(Color(0.95, 0.95, 0.95, 0.75))
	_dust.direction = Vector3(0, 1, 1)
	_dust.spread = 50.0
	_dust.initial_velocity_min = 0.8
	_dust.initial_velocity_max = 1.8
	_dust.gravity = Vector3(0, -1.5, 0)
	_dust.scale_amount_min = 0.6
	_dust.scale_amount_max = 1.3
	add_child(_dust)

	_emote = LevelKit.label(self, "", Vector3(0, 1.55, 0), 56, Color(1.0, 0.9, 0.3), true, Vector3.ZERO, Color(0, 0, 0, 0.85))
	_emote.pixel_size = 0.0065
	_emote.no_depth_test = true
	_emote.render_priority = 5
	_emote.visible = false


func _build_shield_visual(parent: Node3D) -> void:
	var frame := LevelKit.char_mat(Color(0.22, 0.26, 0.34))
	_part(parent, _box(Vector3(0.94, 0.5, 0.035)), Vector3.ZERO, LevelKit.mat(C_SHIELD, 1.6, 0.3))
	_part(parent, _box(Vector3(1.04, 0.07, 0.08)), Vector3(0, 0.28, 0), frame)
	_part(parent, _box(Vector3(1.04, 0.07, 0.08)), Vector3(0, -0.28, 0), frame)
	_part(parent, _box(Vector3(0.07, 0.62, 0.08)), Vector3(0.5, 0, 0), frame)
	_part(parent, _box(Vector3(0.07, 0.62, 0.08)), Vector3(-0.5, 0, 0), frame)
	# 盾の紋（橙の山形）
	_part(parent, _box(Vector3(0.36, 0.06, 0.05)), Vector3(-0.1, 0.0, -0.01), LevelKit.glow(C_ACCENT, 1.4), Vector3(0, 0, 35))
	_part(parent, _box(Vector3(0.36, 0.06, 0.05)), Vector3(0.1, 0.0, -0.01), LevelKit.glow(C_ACCENT, 1.4), Vector3(0, 0, -35))
	_merge_by_material(parent)


## はがした盾の残骸：弧を描いて落ち、小さくなって消える。
func _spawn_debris(at: Transform3D) -> void:
	var host := get_parent()
	if host == null:
		return
	var d := Node3D.new()
	host.add_child(d)
	d.global_transform = at
	_build_shield_visual(d)
	var start := at.origin
	var side := Vector3(randf_range(-1.0, 1.0), 0.0, randf_range(-1.0, 1.0)).normalized() * 0.9
	var floor_y := global_position.y + 0.1
	var end := Vector3(start.x + side.x, floor_y, start.z + side.z)
	var tw := d.create_tween()
	tw.tween_method(func(k: float) -> void:
		var pos := start.lerp(end, k)
		pos.y = lerpf(start.y, floor_y, k) + sin(k * PI) * 0.7
		d.global_position = pos
		d.rotation = Vector3(k * 2.5, k * 1.2, 0.0), 0.0, 1.0, 0.6)
	tw.tween_interval(0.6)
	tw.tween_property(d, "scale", Vector3(0.01, 0.01, 0.01), 0.35)
	tw.tween_callback(d.queue_free)


func _animate(delta: float, speed: float) -> void:
	if state == State.OFF:
		return
	var leg_amp := 0.0
	if speed > 0.1:
		_phase += delta * (6.0 + speed * 2.2)
		leg_amp = clampf(speed / 4.0, 0.25, 0.75)
	var bob := absf(sin(_phase)) * 0.03 * (1.0 if speed > 0.1 else 0.0)
	var pos := Vector3(0, bob, 0)
	var rot := Vector3.ZERO
	match state:
		State.WINDUP:
			# 震えて身構える（はっきりした予備動作）
			pos.x = sin(_t * 70.0) * 0.035
			rot.x = -0.14
			_phase += delta * 14.0
			leg_amp = 0.25
			var hot := fmod(state_time, 0.16) < 0.08
			_set_eyes(C_EYE_HOT if hot else C_EYE)
			var k := state_time / WINDUP_TIME
			_telegraph.scale = Vector3(1.0, 1.0, lerpf(0.4, 1.0, minf(1.0, k * 1.6)))
			_telegraph.visible = state_time < WINDUP_TIME - WINDUP_LOCK or fmod(state_time, 0.1) < 0.065
		State.CHARGE:
			rot.x = -0.08
		State.RECOVER:
			rot.z = sin(_t * 7.0) * 0.07
		State.STUNNED:
			rot.z = sin(_t * 9.0) * 0.16
			rot.x = 0.1
			_stars.rotation.y += delta * 4.0
			var blink := fmod(state_time, 0.5) < 0.25
			_set_eyes(C_EYE.darkened(0.6) if blink else C_EYE)
	if _frozen:
		pos.x = sin(_t * 80.0) * 0.05
	for i in _legs.size():
		var s := 1.0 if (i == 0 or i == 3) else -1.0
		_legs[i].rotation.x = sin(_phase) * leg_amp * s
	_body_root.position = _body_root.position.lerp(pos, 1.0 - exp(-25.0 * delta))
	_body_root.rotation = _body_root.rotation.lerp(rot, 1.0 - exp(-12.0 * delta))


func _set_eyes(c: Color) -> void:
	var m: Material = LevelKit.char_mat(Color(0.08, 0.08, 0.1)) if c == Color.BLACK else LevelKit.glow(c, 3.0)
	for e in _eyes:
		if e.material_override != m:
			e.material_override = m


func _flash_body() -> void:
	_flash_t = 0.1
	for m in _body_meshes:
		m.material_override = LevelKit.glow(Color(1.0, 0.95, 0.85), 2.0)


func _restore_body_mats() -> void:
	if _body_meshes.size() < 3:
		return
	_body_meshes[0].material_override = LevelKit.char_mat(C_IRON)
	_body_meshes[1].material_override = LevelKit.char_mat(C_IRON_DARK)
	_body_meshes[2].material_override = LevelKit.char_mat(C_BARREL)


func _show_bubble() -> void:
	_bubble.visible = true
	_bubble.scale = Vector3(1.0, 0.8, 1.15)
	get_tree().create_timer(0.22).timeout.connect(func() -> void:
		if is_instance_valid(_bubble):
			_bubble.visible = false)


func _puff_sparks(n: int) -> void:
	if _sparks == null:
		return
	if not _sparks.emitting:
		_sparks.amount = maxi(4, n)
		_sparks.one_shot = true
		_sparks.explosiveness = 0.9
		_sparks.restart()
		_sparks.emitting = true
		get_tree().create_timer(0.6).timeout.connect(func() -> void:
			if is_instance_valid(_sparks):
				_sparks.one_shot = false
				_sparks.explosiveness = 0.2
				_sparks.emitting = state == State.STUNNED)


# ---- 形状の小物

## 直下の MeshInstance3D を材質ごとに1つのメッシュへまとめる（子を持たない部品だけ）。
func _merge_by_material(node: Node3D) -> void:
	var groups := {}
	for c in node.get_children():
		var mi := c as MeshInstance3D
		if mi == null or mi.mesh == null or mi.material_override == null or mi.get_child_count() > 0:
			continue
		if not groups.has(mi.material_override):
			groups[mi.material_override] = []
		groups[mi.material_override].append(mi)
	for m in groups:
		var items: Array = groups[m]
		if items.size() < 2:
			continue
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for mi in items:
			st.append_from((mi as MeshInstance3D).mesh, 0, (mi as MeshInstance3D).transform)
			node.remove_child(mi)
			(mi as Node).queue_free()
		var out := MeshInstance3D.new()
		out.mesh = st.commit()
		out.material_override = m
		node.add_child(out)


func _part(parent: Node3D, m: Mesh, pos: Vector3, material: Material, rot_deg: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE) -> MeshInstance3D:
	return LevelKit.mesh(parent, m, pos, material, rot_deg, scl)


func _sphere(r: float, seg: int) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = seg
	s.rings = maxi(4, seg / 2)
	return s


func _cyl(r: float, h: float, seg: int = 10) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = r
	c.bottom_radius = r
	c.height = h
	c.radial_segments = seg
	c.rings = 1
	return c


func _cone(r: float, h: float) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = 0.0
	c.bottom_radius = r
	c.height = h
	c.radial_segments = 6
	c.rings = 1
	return c


func _box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b
