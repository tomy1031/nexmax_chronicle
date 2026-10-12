extends "res://scripts/npc/models/chibi_base.gd"
## ソラ（2086・元気な女の子）。
## 茶色の高いポニーテールに赤橙のリボン・白とオレンジのスーツ・黒のショートパンツ・
## オレンジのブーツ・背中に小型ジェット（2つの噴射口がほんのり光る）。

const SKIN := Color(1.0, 0.8, 0.67)
const HAIR := Color(0.36, 0.19, 0.1)
const RIBBON := Color(0.92, 0.18, 0.12)
const SUIT := Color(0.97, 0.97, 1.0)
const ORANGE := Color(1.0, 0.44, 0.1)
const DARK := Color(0.22, 0.23, 0.3)
const GLOVE := Color(0.3, 0.32, 0.4)
const PACK := Color(0.82, 0.85, 0.9)
const NOZZLE := Color(0.35, 0.37, 0.45)
const JET := Color(1.0, 0.62, 0.25)
const CORE := Color(0.35, 0.9, 1.0)

var ponytail: Node3D
var jets: Node3D


func _build() -> void:
	model_key = "sora"
	_rig({
		"leg_x": 0.075, "thigh": 0.13, "shin": 0.13, "thigh_r": 0.056, "shin_r": 0.05,
		"thigh_col": DARK, "shin_col": SUIT, "foot_col": ORANGE, "foot": Vector3(0.11, 0.1, 0.17),
		"shoulder": Vector2(0.155, 0.31), "neck": 0.37,
		"upper": 0.12, "fore": 0.11, "upper_r": Vector2(0.048, 0.045), "fore_r": Vector2(0.045, 0.05), "hand_r": 0.047,
		"upper_col": SUIT, "fore_col": SUIT, "hand_col": GLOVE,
		"arm_out": 0.2, "step": 0.55, "arm_swing": 0.7, "walk_speed": 1.5,
	})
	# ブーツの上のオレンジの縁・ひざ当て
	for kn in [knee_l, knee_r]:
		_add(kn, ORANGE, [
			p_ell(Vector3(0.085, 0.07, 0.07), Vector3(0, -0.005, -0.025)),
			p_cyl(0.058, 0.058, 0.03, Vector3(0, -0.11, 0)),
		])
	for el in [elbow_l, elbow_r]:
		_add(el, ORANGE, [p_cyl(0.054, 0.054, 0.03, Vector3(0, -0.1, 0))])
	_build_body()
	_build_head()


func _build_body() -> void:
	_add(torso, SUIT, [p_ell(Vector3(0.3, 0.38, 0.26), Vector3(0, 0.19, 0))])
	_add(torso, DARK, [p_cyl(0.148, 0.14, 0.12, Vector3(0, 0.02, 0), Vector3.ZERO, Vector3(1, 1, 0.88))])
	var org := [
		p_ell(Vector3(0.17, 0.12, 0.06), Vector3(0, 0.25, -0.112), Vector3(-15, 0, 0)),
		p_cyl(0.157, 0.157, 0.035, Vector3(0, 0.085, 0), Vector3.ZERO, Vector3(1, 1, 0.9)),
		p_cyl(0.07, 0.062, 0.04, Vector3(0, 0.375, 0)),
	]
	for sx in [-1.0, 1.0]:
		org.append(p_ell(Vector3(0.12, 0.08, 0.13), Vector3(0.14 * sx, 0.33, 0)))
	_add(torso, ORANGE, org)
	_add_flat(torso, CORE, [p_sph(0.025, Vector3(0, 0.25, -0.145))])
	# 背中のジェット
	_add(torso, PACK, [
		p_ell(Vector3(0.22, 0.25, 0.11), Vector3(0, 0.22, 0.155)),
		p_box(Vector3(0.2, 0.03, 0.03), Vector3(0, 0.31, 0.06)),
	])
	_add(torso, NOZZLE, [
		p_cyl(0.048, 0.035, 0.12, Vector3(-0.075, 0.09, 0.19)),
		p_cyl(0.048, 0.035, 0.12, Vector3(0.075, 0.09, 0.19)),
	])
	_add(torso, ORANGE, [p_box(Vector3(0.05, 0.16, 0.03), Vector3(0, 0.24, 0.215))])
	jets = _node(torso, Vector3(0, 0.03, 0.19), "Jets")
	_add_glow(jets, "jet", JET, 3.0, [
		p_cyl(0.0, 0.034, 0.07, Vector3(-0.075, -0.015, 0)),
		p_cyl(0.0, 0.034, 0.07, Vector3(0.075, -0.015, 0)),
	])


func _build_head() -> void:
	_set_head(Vector3(0, 0.215, 0), 0.235, Vector3(1.03, 0.97, 0.98))
	var hc := head_c
	_add(head, SKIN, [p_sph(head_r, hc, head_s, Vector3.ZERO, 16)])
	var hair := [p_sph(0.25, hc + Vector3(0, 0.035, 0.04), Vector3(1.03, 1.0, 1.0), Vector3.ZERO, 16)]
	# 横に流した前髪
	var bang := [[-0.11, 0.1, 20.0], [-0.035, 0.115, 28.0], [0.04, 0.12, 32.0], [0.115, 0.095, 38.0]]
	for b in bang:
		var x: float = b[0]
		var y: float = b[1]
		hair.append(p_ell(Vector3(0.1, 0.13, 0.07), _hs(x, y, -0.012), _hs_rot(x, y) + Vector3(0, 0, float(b[2]))))
	for sx in [-1.0, 1.0]:
		hair.append(p_ell(Vector3(0.05, 0.19, 0.07), hc + Vector3(0.2 * sx, -0.07, -0.06), Vector3(0, 0, 6.0 * sx)))
	_add(head, HAIR, hair)
	# 高いポニーテール（揺れる）
	ponytail = _bone(head, hc + Vector3(0, 0.215, 0.12), "Ponytail")
	_add(ponytail, HAIR, [
		p_ell(Vector3(0.12, 0.11, 0.12), Vector3(0, 0.0, 0.0)),
		p_ell(Vector3(0.14, 0.14, 0.16), Vector3(0, 0.05, 0.09), Vector3(60, 0, 0)),
		p_ell(Vector3(0.13, 0.22, 0.12), Vector3(0, -0.06, 0.2), Vector3(30, 0, 0)),
		p_ell(Vector3(0.1, 0.2, 0.09), Vector3(0, -0.22, 0.24), Vector3(5, 0, 0)),
		p_ell(Vector3(0.07, 0.13, 0.07), Vector3(0, -0.36, 0.21), Vector3(-15, 0, 0)),
	])
	_add(head, RIBBON, [
		p_ell(Vector3(0.13, 0.085, 0.04), hc + Vector3(-0.08, 0.25, 0.1), Vector3(-30, 0, 25)),
		p_ell(Vector3(0.13, 0.085, 0.04), hc + Vector3(0.08, 0.25, 0.1), Vector3(-30, 0, -25)),
		p_sph(0.035, hc + Vector3(0, 0.24, 0.11)),
	])
	_face({
		"eye_x": 0.085, "eye_y": -0.02, "eye_size": Vector3(0.062, 0.09, 0.03), "eye_col": Color(0.2, 0.1, 0.06),
		"mouth_y": -0.105, "mouth_w": 0.045, "mouth_open": 1.1,
		"blush_x": 0.135, "blush_y": -0.07,
	})


## 待機：つま先で弾むように元気に。片手は腰。
func _p_idle(p: Dictionary) -> void:
	super._p_idle(p)
	var h := absf(sin(_t * 3.2))
	p["y"] = h * 0.018
	p["arm_l"] = Vector3(-0.15, 0, -0.7)
	p["elb_l"] = Vector3(0.2, 0, 1.8)
	p["head"] = Vector3(0.05, sin(_t * 0.6) * 0.18, sin(_t * 1.6) * 0.06)


func _after(a: String, delta: float) -> void:
	# ポニーテールは体の動きに少し遅れて揺れる
	var sway := 0.85 + sin(_t * 3.0) * 0.1   # 少し横へ流す
	if a == "walk" or a == "cheer" or a == "fan_go":
		sway = 0.7 + sin(_t * 9.0) * 0.3
	ponytail.rotation.z = lerpf(ponytail.rotation.z, sway, minf(1.0, delta * 8.0))
	ponytail.rotation.x = lerpf(ponytail.rotation.x, 0.25 if a == "walk" else 0.0, minf(1.0, delta * 5.0))
	# ジェットの炎のゆらぎ（歓声のときは強く噴く）
	var power := 1.6 if a == "cheer" else 1.0
	var f := power * (0.85 + 0.15 * sin(_t * 37.0) + 0.1 * sin(_t * 23.0))
	jets.scale = Vector3(1.0, f, 1.0)
