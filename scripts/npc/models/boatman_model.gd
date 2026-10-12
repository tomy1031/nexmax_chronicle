extends "res://scripts/npc/models/chibi_base.gd"
## 船頭（1726）。
## 平たい菅笠・紺の短いはっぴ（白い襟・背中に丸紋）・首に手ぬぐい・紺の股引・黒い足袋。日焼けした肌。
## "sit" は舟の床（原点の高さ）にあぐらで座る。立ち姿でも使える。

const SKIN := Color(0.92, 0.68, 0.5)
const HAPPI := Color(0.18, 0.3, 0.55)
const TRIM := Color(0.96, 0.95, 0.9)
const INNER := Color(0.12, 0.15, 0.26)
const PANTS := Color(0.15, 0.18, 0.3)
const TABI := Color(0.12, 0.12, 0.15)
const OBI := Color(0.6, 0.42, 0.25)
const HAIR := Color(0.12, 0.1, 0.09)
const STRAW := Color(0.9, 0.77, 0.48)
const STRAW_D := Color(0.7, 0.55, 0.3)


func _build() -> void:
	model_key = "boatman"
	_rig({
		"leg_x": 0.1, "thigh": 0.18, "shin": 0.18, "thigh_r": 0.075, "shin_r": 0.062,
		"thigh_col": PANTS, "shin_col": PANTS, "foot_col": TABI, "foot": Vector3(0.12, 0.08, 0.21),
		"shoulder": Vector2(0.22, 0.43), "neck": 0.53,
		"upper": 0.17, "fore": 0.16, "upper_r": Vector2(0.068, 0.092), "fore_r": Vector2(0.052, 0.047), "hand_r": 0.06,
		"upper_col": HAPPI, "fore_col": SKIN, "hand_col": SKIN,
		"arm_out": 0.28, "step": 0.5, "walk_speed": 1.3,
	})
	_add(torso, HAPPI, [
		p_ell(Vector3(0.45, 0.56, 0.37), Vector3(0, 0.26, 0)),
		p_cyl(0.235, 0.215, 0.14, Vector3(0, 0.02, 0)),
	])
	# はっぴの襟（前に縦に2本）と裾の白線・背中の丸紋
	var trim := [p_cyl(0.24, 0.237, 0.03, Vector3(0, -0.035, 0))]
	for sx in [-1.0, 1.0]:
		# 襟は胸の丸みに沿って上下2枚で（上は首の後ろへ向かって寝かせる）
		trim.append(p_box(Vector3(0.05, 0.22, 0.03), Vector3(0.07 * sx, 0.41, -0.165), Vector3(28, 0, -14.0 * sx)))
		trim.append(p_box(Vector3(0.05, 0.3, 0.03), Vector3(0.045 * sx, 0.16, -0.205), Vector3(-6, 0, -4.0 * sx)))
	_add(torso, TRIM, trim)
	_add(torso, OBI, [p_cyl(0.222, 0.222, 0.05, Vector3(0, 0.1, 0), Vector3.ZERO, Vector3(1, 1, 0.9))])
	_add_flat(torso, TRIM, [p_gear(0.075, 10, 0.0, Vector3(0, 0.3, 0.192), Vector3(-10, 180, 0))])
	_set_head(Vector3(0, 0.23, 0), 0.25, Vector3(1.03, 0.97, 0.98))
	var hc := head_c
	_add(head, SKIN, [
		p_sph(head_r, hc, head_s, Vector3.ZERO, 16),
		p_ell(Vector3(0.055, 0.09, 0.055), hc + Vector3(-0.252, -0.02, 0.01)),
		p_ell(Vector3(0.055, 0.09, 0.055), hc + Vector3(0.252, -0.02, 0.01)),
	])
	_add(head, HAIR, [
		p_sph(0.255, hc + Vector3(0, 0.06, 0.06), Vector3(1.0, 0.92, 1.0), Vector3.ZERO, 16),
	])
	# 首の手ぬぐい
	_add(head, TRIM, [p_tor(0.05, 0.1, Vector3(0, 0.0, 0.0), Vector3(-8, 0, 0))])
	_face({
		"eye_x": 0.09, "eye_y": -0.01, "eye_size": Vector3(0.045, 0.06, 0.028),
		"mouth_y": -0.11, "mouth_w": 0.055, "mouth_open": 0.85, "blush": false,
	})
	_add_flat(head, SKIN.darkened(0.14), [p_ell(Vector3(0.03, 0.02, 0.012), _hs(0, -0.045, -0.002), _hs_rot(0, -0.045))])
	var br := []
	for sx in [-1.0, 1.0]:
		br.append(p_ell(Vector3(0.075, 0.025, 0.025), _hs(0.09 * sx, 0.065, -0.003), _hs_rot(0.09 * sx, 0.065) + Vector3(0, 0, -6.0 * sx)))
	_add_flat(head, HAIR, br)
	# 平たい菅笠（顔に濃い影を落とさないよう影なし）
	_add_noshadow(head, STRAW, [
		p_cyl(0.43, 0.0, 0.16, hc + Vector3(0, 0.235, 0.01), Vector3(-4, 0, 0), Vector3.ONE, 16),
	])
	_add_noshadow(head, STRAW_D, [p_tor(0.39, 0.43, hc + Vector3(0, 0.16, 0.015), Vector3(-4, 0, 0))])
