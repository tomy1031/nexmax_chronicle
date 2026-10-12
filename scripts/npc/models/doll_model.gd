extends "res://scripts/npc/models/chibi_base.gd"
## 茶運びからくり人形（1726・高さ約0.6m）。
## 木の体・丸い頭に描いた素朴な顔・おかっぱの黒髪に赤い帽子・紺の袴・両手でお盆と湯のみを運ぶ。
## 背中のぜんまいが回り、"walk" はちょこちょこ左右に揺れるからくり歩き。"wave"/"cheer"/"point" はおじぎ。

const WOOD := Color(0.82, 0.6, 0.36)
const WOOD_D := Color(0.6, 0.4, 0.22)
const FACE := Color(0.99, 0.95, 0.87)
const HAIR := Color(0.1, 0.08, 0.08)
const CAP := Color(0.88, 0.15, 0.15)
const HAKAMA := Color(0.24, 0.26, 0.42)
const COLLAR := Color(0.9, 0.2, 0.2)
const TRAY := Color(0.4, 0.1, 0.08)
const CUP := Color(0.97, 0.96, 0.92)
const TEA := Color(0.45, 0.65, 0.25)
const BRASS := Color(0.88, 0.66, 0.28)

var key_node: Node3D
var feet: Array[Node3D] = []
var tray_node: Node3D


func _build() -> void:
	model_key = "doll"
	body_root = _bone(self, Vector3.ZERO, "Body")
	torso = _bone(body_root, Vector3(0, 0.05, 0), "Torso")
	# 足（袴の下からちょこっと）
	for sx in [-1.0, 1.0]:
		var f := _bone(body_root, Vector3(0.045 * sx, 0.03, -0.02), "FootL" if sx < 0.0 else "FootR")
		_add(f, WOOD_D, [p_ell(Vector3(0.06, 0.05, 0.1), Vector3(0, 0, -0.02))])
		feet.append(f)
	# 袴と木の胴
	_add(torso, HAKAMA, [p_cyl(0.13, 0.095, 0.2, Vector3(0, 0.1, 0), Vector3.ZERO, Vector3(1, 1, 0.9))])
	_add(torso, WOOD, [
		p_ell(Vector3(0.19, 0.18, 0.16), Vector3(0, 0.25, 0)),
		p_cyl(0.035, 0.035, 0.05, Vector3(0, 0.34, 0)),
	])
	_add(torso, COLLAR, [
		p_box(Vector3(0.03, 0.12, 0.02), Vector3(-0.03, 0.27, -0.075), Vector3(20, 0, 25)),
		p_box(Vector3(0.03, 0.12, 0.02), Vector3(0.03, 0.27, -0.075), Vector3(20, 0, -25)),
		p_cyl(0.098, 0.098, 0.03, Vector3(0, 0.2, 0), Vector3.ZERO, Vector3(1, 1, 0.9)),
	])
	# 頭
	head = _bone(torso, Vector3(0, 0.36, 0), "Head")
	_set_head(Vector3(0, 0.1, 0), 0.12, Vector3(1.05, 1.0, 1.0))
	var hc := head_c
	_add(head, FACE, [p_sph(head_r, hc, head_s, Vector3.ZERO, 16)])
	_add(head, HAIR, [
		p_sph(0.125, hc + Vector3(0, 0.025, 0.02), Vector3(1.06, 1.0, 1.0)),
		p_ell(Vector3(0.2, 0.06, 0.08), hc + Vector3(0, 0.07, -0.07), Vector3(-15, 0, 0)),
	])
	_add(head, CAP, [
		p_cyl(0.07, 0.065, 0.06, hc + Vector3(0, 0.14, 0.01)),
		p_sph(0.025, hc + Vector3(0, 0.18, 0.01)),
	])
	_face({
		"eye_x": 0.042, "eye_y": -0.005, "eye_size": Vector3(0.022, 0.028, 0.012),
		"mouth_y": -0.055, "mouth_w": 0.018, "mouth_open": 0.7,
		"blush_x": 0.068, "blush_y": -0.035, "blush_col": Color(1.0, 0.5, 0.5),
	})
	# 腕とお盆
	arm_l = _bone(torso, Vector3(-0.1, 0.3, 0), "ArmL")
	arm_r = _bone(torso, Vector3(0.1, 0.3, 0), "ArmR")
	for a in [arm_l, arm_r]:
		_add(a, WOOD, [
			p_sph(0.035, Vector3.ZERO),
			p_cyl(0.03, 0.033, 0.12, Vector3(0, -0.06, 0)),
			p_sph(0.03, Vector3(0, -0.13, 0)),
		])
		a.rotation = Vector3(1.25, 0, 0)
	tray_node = _bone(torso, Vector3(0, 0.27, -0.15), "Tray")
	_add(tray_node, TRAY, [p_cyl(0.095, 0.09, 0.018, Vector3.ZERO, Vector3.ZERO, Vector3.ONE, 16)])
	_add(tray_node, CUP, [p_cyl(0.026, 0.033, 0.045, Vector3(0.0, 0.032, 0.0))])
	_add_flat(tray_node, TEA, [p_cyl(0.029, 0.029, 0.004, Vector3(0, 0.054, 0))])
	# 背中のぜんまい
	key_node = _bone(torso, Vector3(0, 0.25, 0.085), "Key")
	_add(key_node, BRASS, [
		p_cyl(0.012, 0.012, 0.06, Vector3(0, 0, 0.03), Vector3(90, 0, 0)),
		p_ell(Vector3(0.05, 0.035, 0.015), Vector3(-0.028, 0, 0.06)),
		p_ell(Vector3(0.05, 0.035, 0.015), Vector3(0.028, 0, 0.06)),
	])


func animate(delta: float, moving: bool, anim: String) -> void:
	if not _built:
		construct()
	_t += delta
	_measure_speed(delta)
	var a := "walk" if moving else anim
	if a != _anim:
		_anim = a
		_anim_t = 0.0
	_anim_t += delta
	var k := minf(1.0, delta * 12.0)
	var y := 0.0
	var roll := 0.0
	var bow := 0.0
	var head_tilt := 0.0
	var key_speed := 1.5
	var f0 := 0.0
	if a == "walk":
		var spd := _speed if _speed > 0.2 else 0.6
		_phase += delta * clampf(spd * 18.0, 7.0, 16.0)
		var s := sin(_phase)
		roll = s * 0.13
		y = absf(cos(_phase)) * 0.018
		f0 = s
		head_tilt = -s * 0.06
		key_speed = 6.0
	elif a == "wave" or a == "cheer" or a == "point":
		# からくりのおじぎ：ゆっくり下げて、少し止まって戻る
		var c := fmod(_anim_t, 2.4) / 2.4
		bow = smoothstep(0.0, 0.3, c) * (1.0 - smoothstep(0.6, 0.9, c)) * 0.5
		key_speed = 3.0
	else:
		# 待機：カチ、カチと首をかしげる
		var step := floorf(_t * 1.0)
		head_tilt = (0.06 if int(step) % 2 == 0 else -0.06)
		y = sin(_t * 2.0) * 0.003
	body_root.position.y = lerpf(body_root.position.y, y, k)
	body_root.rotation.z = lerpf(body_root.rotation.z, roll, k)
	torso.rotation.x = lerpf(torso.rotation.x, -bow, k)
	head.rotation.z = lerpf(head.rotation.z, head_tilt, minf(1.0, delta * 20.0))
	head.rotation.x = lerpf(head.rotation.x, -bow * 0.5, k)
	# お盆は水平を保とうとする
	tray_node.rotation.z = -body_root.rotation.z * 0.7
	tray_node.rotation.x = torso.rotation.x * -0.6
	feet[0].position.z = lerpf(feet[0].position.z, -0.02 - f0 * 0.035, k)
	feet[1].position.z = lerpf(feet[1].position.z, -0.02 + f0 * 0.035, k)
	key_node.rotation.z = wrapf(key_node.rotation.z + delta * key_speed, -PI, PI)
	_blink(delta)
	_sync_bones()
