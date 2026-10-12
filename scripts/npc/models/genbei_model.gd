extends "res://scripts/npc/models/chibi_base.gd"
## 源兵衛（1726・からくり職人のおじいさん）。
## 白いもじゃもじゃの髪・大きな白ひげ・丸い顔・額に押し上げた真鍮のゴーグル・藍の着物・
## 歯車柄の白い前掛け・茶色の道具帯とポーチ。がっしりした体つき。"hammer" "work" では木槌を持つ。

const SKIN := Color(1.0, 0.76, 0.6)
const NOSE := Color(1.0, 0.68, 0.56)
const INDIGO := Color(0.22, 0.3, 0.56)
const INDIGO_D := Color(0.15, 0.2, 0.4)
const COLLAR := Color(0.78, 0.83, 0.92)
const APRON := Color(0.97, 0.95, 0.89)
const HAIR := Color(0.98, 0.98, 0.97)
const BEARD := Color(0.93, 0.92, 0.88)
const BELT := Color(0.46, 0.28, 0.15)
const POUCH := Color(0.66, 0.46, 0.25)
const BRASS := Color(0.88, 0.66, 0.28)
const LENS := Color(0.62, 0.9, 1.0)
const WOOD := Color(0.78, 0.58, 0.34)
const MALLET := Color(0.45, 0.28, 0.16)
const SANDAL := Color(0.36, 0.24, 0.15)

var hammer: Node3D       # 手に持つ木槌
var belt_hammer: Node3D  # 腰に差した木槌


func _build() -> void:
	model_key = "genbei"
	_rig({
		"leg_x": 0.115, "thigh": 0.19, "shin": 0.18, "thigh_r": 0.085, "shin_r": 0.075,
		"thigh_col": INDIGO, "shin_col": INDIGO_D, "foot_col": SANDAL, "foot": Vector3(0.15, 0.1, 0.25),
		"shoulder": Vector2(0.27, 0.45), "neck": 0.55,
		"upper": 0.17, "fore": 0.15, "upper_r": Vector2(0.075, 0.105), "fore_r": Vector2(0.056, 0.05), "hand_r": 0.07,
		"upper_col": INDIGO, "fore_col": SKIN, "hand_col": SKIN,
		"arm_out": 0.4, "step": 0.45, "arm_swing": 0.5, "walk_speed": 1.2,
	})
	for el in [elbow_l, elbow_r]:
		_add(el, INDIGO, [
			p_cyl(0.105, 0.098, 0.07, Vector3(0, -0.005, 0)),
			p_box(Vector3(0.05, 0.13, 0.11), Vector3(0, -0.06, 0.055)),
		])
	_build_body()
	_build_head()
	_build_hammer()


func _build_body() -> void:
	# 藍の着物（胴＋腰から下）
	_add(torso, INDIGO, [
		p_ell(Vector3(0.58, 0.62, 0.5), Vector3(0, 0.27, 0)),
		p_cyl(0.275, 0.25, 0.27, Vector3(0, -0.04, 0)),
	])
	# 襟（胸元のV字）
	var col := []
	for sx in [-1.0, 1.0]:
		col.append(p_box(Vector3(0.055, 0.21, 0.03), Vector3(0.06 * sx, 0.46, -0.215), Vector3(26, 0, -30.0 * sx)))
	_add(torso, COLLAR, col)
	# 白い前掛け（胴の丸みに沿って曲げた板）
	_add(torso, APRON, [p_arc(0.292, 0.256, -0.8, 0.8, -0.2, 0.38, 0.02, 0.036)])
	# 前掛けの歯車柄
	_add_flat(torso, INDIGO_D, [p_gear(0.072, 8, 0.027, Vector3(0, -0.07, -0.287), Vector3(3.5, 0, 0))])
	# 道具帯
	_add(torso, BELT, [
		p_cyl(0.315, 0.315, 0.075, Vector3(0, 0.1, 0), Vector3.ZERO, Vector3(1, 1, 0.92), 16),
		p_box(Vector3(0.07, 0.06, 0.03), Vector3(0, 0.1, -0.292)),
	])
	_add(torso, BRASS, [p_box(Vector3(0.05, 0.04, 0.02), Vector3(0, 0.1, -0.305))])
	# ポーチ
	var pouches := []
	for sx in [-1.0, 1.0]:
		pouches.append(p_box(Vector3(0.11, 0.12, 0.075), Vector3(0.215 * sx, 0.035, -0.19), Vector3(0, -46.0 * sx, 0)))
	pouches.append(p_box(Vector3(0.13, 0.11, 0.07), Vector3(-0.1, 0.035, 0.28), Vector3(0, 20, 0)))
	_add(torso, POUCH, pouches)
	# 腰に差した木槌
	belt_hammer = _node(torso, Vector3(0.3, 0.05, 0.07), "BeltHammer")
	belt_hammer.rotation_degrees = Vector3(0, 0, -12)
	_add(belt_hammer, WOOD, [p_cyl(0.017, 0.017, 0.22, Vector3(0, -0.03, 0))])
	_add(belt_hammer, MALLET, [p_cyl(0.045, 0.045, 0.12, Vector3(0, 0.1, 0), Vector3(90, 0, 0))])


func _build_head() -> void:
	_set_head(Vector3(0, 0.235, 0), 0.27, Vector3(1.04, 0.96, 0.97))
	var hc := head_c
	# 顔・耳・鼻
	_add(head, SKIN, [
		p_sph(head_r, hc, head_s, Vector3.ZERO, 16),
	])
	_add(head, NOSE, [p_sph(0.056, _hs(0, -0.035, -0.022))])
	# 白い髪（上は後ろへなでつけ、横はもじゃもじゃ）と眉
	var hair := [
		p_sph(0.25, hc + Vector3(0, 0.075, 0.08), Vector3(1.08, 0.8, 1.0)),
		p_sph(0.15, hc + Vector3(0, -0.06, 0.19), Vector3(1.3, 1.0, 0.85)),
	]
	for sx in [-1.0, 1.0]:
		hair.append(p_sph(0.11, hc + Vector3(0.255 * sx, -0.01, 0.07), Vector3(0.85, 1.15, 1.2)))
		hair.append(p_sph(0.1, hc + Vector3(0.21 * sx, 0.13, 0.11)))
		hair.append(p_sph(0.09, hc + Vector3(0.26 * sx, -0.11, 0.05), Vector3(0.9, 1.0, 1.1)))
		# 眉（太く、少し下がり気味でやさしく）
		hair.append(p_ell(Vector3(0.13, 0.055, 0.06), _hs(0.1 * sx, 0.09, -0.006), _hs_rot(0.1 * sx, 0.09) + Vector3(0, 0, -12.0 * sx)))
	_add(head, HAIR, hair)
	# あごひげ（顔の下をぐるりと縁どる。少しクリームがかった白）
	var beard := [p_ell(Vector3(0.33, 0.22, 0.24), hc + Vector3(0, -0.2, -0.115))]
	for sx in [-1.0, 1.0]:
		beard.append(p_ell(Vector3(0.1, 0.2, 0.14), hc + Vector3(0.205 * sx, -0.12, -0.04), Vector3(0, 0, -12.0 * sx)))
	_add(head, BEARD, beard)
	# 口ひげ（大きく、先がくるんと上がる）
	var mus := []
	for sx in [-1.0, 1.0]:
		mus.append(p_ell(Vector3(0.16, 0.075, 0.085), _hs(0.07 * sx, -0.078, 0.005), _hs_rot(0.07 * sx, -0.078) + Vector3(0, 0, 14.0 * sx)))
		mus.append(p_sph(0.03, _hs(0.145 * sx, -0.05, 0.0)))
	_add(head, HAIR, mus)
	_face({
		"eye_x": 0.097, "eye_y": 0.018, "eye_size": Vector3(0.052, 0.074, 0.03),
		"mouth_y": -0.128, "mouth_w": 0.058, "mouth_open": 0.85, "mouth_z": -0.262, "mouth_col": Color(0.55, 0.12, 0.16),
		"blush_x": 0.155, "blush_y": -0.04,
	})
	# 額に押し上げたゴーグル
	_add(head, BELT, [p_tor(0.262, 0.292, hc + Vector3(0, 0.13, 0.04), Vector3(10, 0, 0), Vector3(1.02, 1, 1.0))])
	var rims := []
	var glass := []
	for sx in [-1.0, 1.0]:
		var x: float = 0.087 * sx
		var y := 0.15
		var rot := _hs_rot(x, y) + Vector3(-90, 0, 0)
		var b := Basis.from_euler(rot * (PI / 180.0))
		var base := _hs(x, y, 0.012)
		rims.append(p_cyl(0.066, 0.066, 0.05, base + b * Vector3(0, 0.012, 0), rot))
		glass.append(p_cyl(0.05, 0.05, 0.02, base + b * Vector3(0, 0.03, 0), rot))
	rims.append(p_box(Vector3(0.05, 0.022, 0.03), _hs(0, 0.152, 0.018), _hs_rot(0, 0.152)))
	_add(head, BRASS, rims)
	_add_flat(head, LENS, glass)


func _build_hammer() -> void:
	# 柄は手から腕の延長方向（-Y）へ、頭は前後（Z 軸）に打つ面を向ける
	hammer = _node(hand_r, Vector3.ZERO, "Hammer")
	_add(hammer, WOOD, [p_cyl(0.018, 0.018, 0.24, Vector3(0, -0.08, 0))])
	_add(hammer, MALLET, [p_cyl(0.05, 0.05, 0.14, Vector3(0, -0.2, 0), Vector3(90, 0, 0))])
	hammer.visible = false


func _p_idle(p: Dictionary) -> void:
	super._p_idle(p)
	# お腹の前で手を軽く組むようにゆったり
	var b := sin(_t * 2.1)
	p["torso"] = Vector3(0.03 + b * 0.02, 0, 0)


func _p_work(p: Dictionary) -> void:
	super._p_work(p)
	# 立ったまま木槌でこつこつ調整
	var s := fmod(_anim_t / 0.5, 1.0)
	var tap := sin(s * PI)
	p["arm_r"] = Vector3(1.0 + tap * 0.45, 0, 0.25)
	p["elb_r"] = Vector3(0.7 + tap * 0.3, 0, 0)
	p["hand_r"] = Vector3(-0.8, 0, 0)
	p["arm_l"] = Vector3(0.9, 0, -0.05)
	p["elb_l"] = Vector3(0.9, 0, 0.3)
	p["rate"] = 24.0


func _after(a: String, _delta: float) -> void:
	var tool := a == "hammer" or a == "work"
	hammer.visible = tool
	belt_hammer.visible = not tool
