class_name NexmaxModel
extends Node3D
## ネクマックスの見た目。簡易形状を組み合わせ、手続き的に動かす。
## 青く丸い頭・白い顔・横の耳・2本のアンテナ・大きな靴（プレイイメージ準拠）。
## 原点は足元。前方は -Z。

const BLUE := Color(0.15, 0.46, 0.93)
const BLUE_DARK := Color(0.12, 0.36, 0.75)
const WHITE := Color(0.98, 0.98, 1.0)
const GREY := Color(0.42, 0.46, 0.55)
const INK := Color(0.05, 0.07, 0.14)

var body_root: Node3D
var head: Node3D
var arm_l: Node3D
var arm_r: Node3D
var leg_l: Node3D
var leg_r: Node3D
var hand_r: Node3D
var eyes: Array[Node3D] = []

var _phase := 0.0
var _t := 0.0
var _blink_t := 2.5
var _squash := Vector3.ONE
var _attack_t := 0.0
var _hurt_t := 0.0


func _ready() -> void:
	_build()


func _build() -> void:
	body_root = Node3D.new()
	add_child(body_root)

	# 胴体
	_part(body_root, _sphere(0.21), Vector3(0, 0.36, 0), BLUE, Vector3(1.0, 1.05, 0.92))
	var belt := _part(body_root, _cyl(0.2, 0.06), Vector3(0, 0.26, 0), GREY)
	belt.scale = Vector3(1.0, 1.0, 0.9)
	# 胸のマーク
	var mark := LevelKit.label(body_root, "NEXMAX", Vector3(0, 0.4, -0.2), 18, WHITE)
	mark.pixel_size = 0.004
	mark.rotation_degrees = Vector3(-8, 0, 0)

	# 頭
	head = Node3D.new()
	head.position = Vector3(0, 0.82, 0)
	body_root.add_child(head)
	_part(head, _sphere(0.42), Vector3.ZERO, BLUE, Vector3(1.0, 0.94, 0.96))
	_part(head, _sphere(0.33), Vector3(0, -0.02, -0.24), WHITE, Vector3(1.0, 1.08, 0.58))
	for sx in [-1.0, 1.0]:
		# 目（縦長の楕円）
		var eye := Node3D.new()
		eye.position = Vector3(0.095 * sx, 0.05, -0.415)
		head.add_child(eye)
		var em := MeshInstance3D.new()
		em.mesh = _sphere(0.04)
		em.scale = Vector3(0.85, 1.9, 0.6)
		em.material_override = LevelKit.unshaded(INK)
		eye.add_child(em)
		var shine := MeshInstance3D.new()
		shine.mesh = _sphere(0.012)
		shine.position = Vector3(0.012, 0.03, -0.02)
		shine.material_override = LevelKit.unshaded(Color.WHITE)
		eye.add_child(shine)
		eyes.append(eye)
		# 耳（横の筒）
		var ear := _part(head, _cyl(0.13, 0.12), Vector3(0.41 * sx, 0.0, 0.02), BLUE)
		ear.rotation_degrees = Vector3(0, 0, 90)
		var hole := MeshInstance3D.new()
		hole.mesh = _cyl(0.08, 0.02)
		hole.material_override = LevelKit.unshaded(BLUE_DARK.darkened(0.4))
		hole.position = Vector3(0.475 * sx, 0.0, 0.02)
		hole.rotation_degrees = Vector3(0, 0, 90)
		head.add_child(hole)
		# アンテナ
		var ant := Node3D.new()
		ant.position = Vector3(0.06 * sx, 0.36, -0.06)
		ant.rotation_degrees = Vector3(-20, 0, -28 * sx)
		head.add_child(ant)
		var stem := MeshInstance3D.new()
		stem.mesh = _cyl(0.012, 0.22)
		stem.position = Vector3(0, 0.11, 0)
		stem.material_override = LevelKit.unshaded(INK)
		ant.add_child(stem)
		var tip := MeshInstance3D.new()
		tip.mesh = _sphere(0.028)
		tip.position = Vector3(0, 0.23, 0)
		tip.material_override = LevelKit.unshaded(INK)
		ant.add_child(tip)
	# 口（にっこり）
	var mouth := MeshInstance3D.new()
	var mm := SphereMesh.new()
	mm.radius = 0.088
	mm.height = 0.088
	mm.is_hemisphere = true
	mm.radial_segments = 16
	mm.rings = 4
	mouth.mesh = mm
	mouth.position = Vector3(0.0, -0.07, -0.41)
	mouth.rotation_degrees = Vector3(180 + 15, 0, 0)  # 平らな面を上に：正面から半円の口に見える
	mouth.scale = Vector3(1.15, 1.0, 0.42)
	mouth.material_override = LevelKit.unshaded(Color(0.78, 0.18, 0.24))
	head.add_child(mouth)

	# 腕（肩を支点に振る）
	arm_l = _make_arm(-1.0)
	arm_r = _make_arm(1.0)
	hand_r = arm_r.get_node("Hand")

	# 脚と大きな靴
	leg_l = _make_leg(-1.0)
	leg_r = _make_leg(1.0)

	# 同じ色の部品をピボットごとにまとめて描画を軽くする
	LevelKit.merge_children_recursive(self)


func _make_arm(sx: float) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = Vector3(0.24 * sx, 0.46, 0)
	pivot.rotation.z = 0.25 * sx
	body_root.add_child(pivot)
	_part(pivot, _sphere(0.06), Vector3.ZERO, GREY)
	_part(pivot, _cyl(0.045, 0.12), Vector3(0, -0.08, 0), GREY)
	_part(pivot, _cyl(0.07, 0.13, 0.06), Vector3(0, -0.19, 0), BLUE)
	var hand := Node3D.new()
	hand.name = "Hand"
	hand.position = Vector3(0, -0.3, 0)
	pivot.add_child(hand)
	_part(hand, _sphere(0.085), Vector3.ZERO, WHITE)
	return pivot


func _make_leg(sx: float) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = Vector3(0.11 * sx, 0.2, 0)
	body_root.add_child(pivot)
	_part(pivot, _cyl(0.05, 0.12), Vector3(0, -0.05, 0), GREY)
	_part(pivot, _sphere(0.14), Vector3(0, -0.12, -0.04), BLUE, Vector3(0.95, 0.62, 1.35))
	return pivot


func hand_global() -> Vector3:
	return hand_r.global_position


func play_attack() -> void:
	_attack_t = 0.28


func play_hurt() -> void:
	_hurt_t = 0.4


func squash(s: Vector3) -> void:
	_squash = s


## 毎フレーム呼ぶ手続き的アニメーション。
func animate(delta: float, h_speed: float, on_floor: bool, vel_y: float, aiming: bool, holding: bool) -> void:
	_t += delta
	var run := clampf(h_speed / 6.0, 0.0, 1.6)
	_phase += delta * (4.0 + h_speed * 1.6)
	var swing := sin(_phase) * minf(run, 1.0)

	if on_floor:
		leg_l.rotation.x = swing * 0.9
		leg_r.rotation.x = -swing * 0.9
		body_root.position.y = absf(sin(_phase)) * 0.07 * minf(run, 1.0) + sin(_t * 2.2) * 0.012
	else:
		leg_l.rotation.x = lerpf(leg_l.rotation.x, -0.6 if vel_y > 0.0 else 0.3, delta * 10.0)
		leg_r.rotation.x = lerpf(leg_r.rotation.x, 0.4 if vel_y > 0.0 else -0.2, delta * 10.0)
		body_root.position.y = lerpf(body_root.position.y, 0.0, delta * 8.0)

	# 腕：歩きで振る。クロー構え中は右腕を前へ伸ばす
	var arm_swing := -swing * 0.9 if on_floor else -1.2
	arm_l.rotation.x = lerpf(arm_l.rotation.x, arm_swing, delta * 14.0)
	var target_r := swing * 0.9 if on_floor else -1.2
	if aiming or holding:
		target_r = PI * 0.5
	if _attack_t > 0.0:
		_attack_t -= delta
		target_r = PI * 0.55
		arm_l.rotation.x = -PI * 0.3
	arm_r.rotation.x = lerpf(arm_r.rotation.x, target_r, delta * 16.0)
	arm_r.rotation.z = lerpf(arm_r.rotation.z, 0.05 if (aiming or holding) else 0.25, delta * 10.0)

	# 前傾・ひねり
	body_root.rotation.x = lerpf(body_root.rotation.x, -0.12 * minf(run, 1.2), delta * 8.0)
	head.rotation.z = sin(_phase * 0.5) * 0.04 * minf(run, 1.0)
	if _attack_t > 0.0:
		body_root.rotation.y = sin((0.28 - _attack_t) / 0.28 * PI) * -0.6
	else:
		body_root.rotation.y = lerpf(body_root.rotation.y, 0.0, delta * 10.0)

	# 伸び縮み
	_squash = _squash.lerp(Vector3.ONE, delta * 9.0)
	body_root.scale = _squash

	# まばたき
	_blink_t -= delta
	var blink := 1.0
	if _blink_t < 0.12:
		blink = 0.15
	if _blink_t < 0.0:
		_blink_t = randf_range(2.0, 4.5)
	for e in eyes:
		e.scale.y = lerpf(e.scale.y, blink, delta * 30.0)

	# 被弾の点滅（終わった瞬間だけ表示に戻す。外からの非表示を上書きしない）
	if _hurt_t > 0.0:
		_hurt_t -= delta
		visible = int(_hurt_t * 20.0) % 2 == 0
		if _hurt_t <= 0.0:
			visible = true


# ---------------------------------------------------------------- 部品

func _part(parent: Node3D, m: Mesh, pos: Vector3, color: Color, scl: Vector3 = Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.position = pos
	mi.scale = scl
	mi.material_override = LevelKit.char_mat(color)
	parent.add_child(mi)
	return mi


func _sphere(r: float) -> SphereMesh:
	var sm := SphereMesh.new()
	sm.radius = r
	sm.height = r * 2.0
	sm.radial_segments = 20
	sm.rings = 10
	return sm


func _cyl(r: float, h: float, top: float = -1.0) -> CylinderMesh:
	var cm := CylinderMesh.new()
	cm.bottom_radius = r if top < 0.0 else top
	cm.top_radius = r
	cm.height = h
	cm.radial_segments = 14
	cm.rings = 1
	return cm
