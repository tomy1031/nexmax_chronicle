extends "res://scripts/npc/models/chibi_base.gd"
## 整備ボット（異次元拠点の手伝い・高さ約0.6m）。
## 白く丸い小型ロボ・黒いバイザーに水色に光る目・小さなアンテナ・オレンジの耳・宙に浮いてふわふわ揺れる。

const WHITE := Color(0.96, 0.97, 1.0)
const GREY := Color(0.55, 0.6, 0.68)
const VISOR := Color(0.07, 0.09, 0.15)
const EYE := Color(0.35, 0.95, 1.0)
const ACCENT := Color(1.0, 0.68, 0.22)

var antenna_tip: MeshInstance3D
var thruster: Node3D


func _build() -> void:
	model_key = "helper_bot"
	body_root = _bone(self, Vector3(0, 0.0, 0), "Body")
	torso = _bone(body_root, Vector3(0, 0.19, 0), "Torso")
	_add(torso, WHITE, [p_ell(Vector3(0.27, 0.23, 0.25), Vector3(0, 0, 0))])
	_add(torso, GREY, [
		p_cyl(0.118, 0.118, 0.035, Vector3(0, -0.02, 0), Vector3.ZERO, Vector3(1.0, 1, 0.94), 16),
		p_cyl(0.06, 0.08, 0.045, Vector3(0, -0.115, 0)),
	])
	_add(torso, ACCENT, [p_ell(Vector3(0.08, 0.05, 0.03), Vector3(0, 0.03, -0.117), Vector3(-10, 0, 0))])
	# 下の噴射の光
	thruster = _node(torso, Vector3(0, -0.15, 0), "Thruster")
	_add_glow(thruster, "thruster", EYE, 2.5, [p_cyl(0.0, 0.05, 0.07, Vector3(0, -0.025, 0))])
	# 頭
	head = _bone(torso, Vector3(0, 0.09, 0), "Head")
	_set_head(Vector3(0, 0.13, 0), 0.15, Vector3(1.12, 0.95, 1.0))
	var hc := head_c
	_add(head, WHITE, [p_sph(head_r, hc, head_s, Vector3.ZERO, 16)])
	_add(head, VISOR, [p_ell(Vector3(0.26, 0.155, 0.11), _hs(0, -0.005, -0.045))])
	_add(head, ACCENT, [
		p_cyl(0.045, 0.045, 0.045, hc + Vector3(-0.165, 0, 0), Vector3(0, 0, 90)),
		p_cyl(0.045, 0.045, 0.045, hc + Vector3(0.165, 0, 0), Vector3(0, 0, 90)),
	])
	_add(head, GREY, [p_cyl(0.008, 0.008, 0.08, hc + Vector3(0, 0.175, 0.0))])
	antenna_tip = _add_glow(head, "tip", ACCENT, 2.0, [p_sph(0.02, Vector3.ZERO)])
	antenna_tip.position = hc + Vector3(0, 0.225, 0.0)
	# 光る目（まばたきする）
	var eye_node := _node(head, hc, "Eyes")
	eyes.append(eye_node)
	var ez := _hs(0.05, 0.0).z - head_c.z - 0.03
	_add_glow(eye_node, "eyes", EYE, 2.5, [
		p_ell(Vector3(0.037, 0.055, 0.02), Vector3(-0.05, 0, ez)),
		p_ell(Vector3(0.037, 0.055, 0.02), Vector3(0.05, 0, ez)),
	])
	# 小さな腕
	arm_l = _bone(torso, Vector3(-0.135, 0.03, 0), "ArmL")
	arm_r = _bone(torso, Vector3(0.135, 0.03, 0), "ArmR")
	for a in [arm_l, arm_r]:
		_add(a, GREY, [p_cyl(0.02, 0.02, 0.075, Vector3(0, -0.037, 0))])
		_add(a, WHITE, [p_sph(0.037, Vector3(0, -0.085, 0))])


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
	var k := minf(1.0, delta * 10.0)
	var hover := 0.1 + sin(_t * 2.4) * 0.025
	var lean := 0.0
	var spin := 0.0
	var al := Vector3(0.1, 0, -0.35)
	var ar := Vector3(0.1, 0, 0.35)
	var head_rot := Vector3(sin(_t * 0.7) * 0.05, sin(_t * 0.5) * 0.25, sin(_t * 1.1) * 0.05)
	match a:
		"walk":
			lean = -0.25
			hover = 0.14 + sin(_t * 6.0) * 0.02
			al = Vector3(-0.5, 0, -0.5)
			ar = Vector3(-0.5, 0, 0.5)
		"wave":
			ar = Vector3(0.2, 0, 2.6 + sin(_anim_t * 10.0) * 0.4)
			head_rot = Vector3(0.1, 0, sin(_anim_t * 5.0) * 0.12)
		"cheer":
			hover = 0.14 + absf(sin(_anim_t * 6.0)) * 0.12
			spin = _anim_t * 5.0
			al = Vector3(0.2, 0, -2.6)
			ar = Vector3(0.2, 0, 2.6)
			head_rot = Vector3(0.2, 0, 0)
		"work", "hammer":
			var w := sin(_anim_t * (12.0 if a == "hammer" else 7.0))
			al = Vector3(1.3 + w * 0.3, 0, -0.1)
			ar = Vector3(1.3 - w * 0.3, 0, 0.1)
			lean = -0.15
			head_rot = Vector3(-0.3, sin(_anim_t * 1.5) * 0.2, 0)
		"point", "fan_wait":
			ar = Vector3(1.6, 0, 0.05)
			head_rot = Vector3(0.0, 0.1, 0)
		"fan_go":
			ar = Vector3(0.2, 0, 2.7 + sin(_anim_t * 8.0) * 0.4)
		"sit":
			hover = 0.02 + sin(_t * 1.5) * 0.004
	body_root.position.y = lerpf(body_root.position.y, hover, k)
	body_root.rotation.x = lerpf(body_root.rotation.x, lean, k)
	if spin != 0.0:
		body_root.rotation.y = spin
	else:
		body_root.rotation.y = lerp_angle(body_root.rotation.y, 0.0, k)
	body_root.rotation.z = sin(_t * 1.7) * 0.04
	head.rotation = head.rotation.lerp(head_rot, k)
	arm_l.rotation = arm_l.rotation.lerp(al, minf(1.0, delta * 14.0))
	arm_r.rotation = arm_r.rotation.lerp(ar, minf(1.0, delta * 14.0))
	thruster.scale = Vector3(1, (0.85 + 0.2 * sin(_t * 31.0)) * (0.3 if a == "sit" else 1.0), 1)
	antenna_tip.scale = Vector3.ONE * (1.0 + 0.15 * sin(_t * 4.0))
	_blink(delta)
	_sync_bones()
