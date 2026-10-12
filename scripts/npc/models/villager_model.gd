extends "res://scripts/npc/models/chibi_base.gd"
## 町人（1726・町の人）。
## 茶（黄土色）のひざ丈の着物・こげ茶の帯・紺の脚絆・わらじ・とんがった菅笠。

const SKIN := Color(1.0, 0.76, 0.6)
const KIMONO := Color(0.7, 0.46, 0.22)
const KIMONO_D := Color(0.6, 0.4, 0.2)
const OBI := Color(0.33, 0.21, 0.13)
const UNDER := Color(0.94, 0.9, 0.8)
const LEGGING := Color(0.28, 0.3, 0.4)
const WARAJI := Color(0.86, 0.74, 0.48)
const HAIR := Color(0.14, 0.11, 0.1)
const STRAW := Color(0.9, 0.77, 0.48)
const STRAW_D := Color(0.7, 0.55, 0.3)


func _build() -> void:
	model_key = "villager"
	_rig({
		"leg_x": 0.1, "thigh": 0.18, "shin": 0.18, "thigh_r": 0.075, "shin_r": 0.062,
		"thigh_col": KIMONO_D, "shin_col": LEGGING, "foot_col": WARAJI, "foot": Vector3(0.12, 0.08, 0.21),
		"shoulder": Vector2(0.215, 0.43), "neck": 0.53,
		"upper": 0.17, "fore": 0.16, "upper_r": Vector2(0.065, 0.09), "fore_r": Vector2(0.05, 0.046), "hand_r": 0.058,
		"upper_col": KIMONO, "fore_col": SKIN, "hand_col": SKIN,
		"arm_out": 0.26, "step": 0.5, "walk_speed": 1.3,
	})
	_add(torso, KIMONO, [
		p_ell(Vector3(0.44, 0.56, 0.37), Vector3(0, 0.26, 0)),
		p_cyl(0.23, 0.2, 0.26, Vector3(0, -0.04, 0)),
	])
	var col := []
	for sx in [-1.0, 1.0]:
		col.append(p_box(Vector3(0.05, 0.2, 0.03), Vector3(0.05 * sx, 0.43, -0.16), Vector3(26, 0, -30.0 * sx)))
	_add(torso, UNDER, col)
	_add(torso, OBI, [
		p_cyl(0.218, 0.218, 0.075, Vector3(0, 0.1, 0), Vector3.ZERO, Vector3(1, 1, 0.9)),
		p_box(Vector3(0.12, 0.05, 0.04), Vector3(0, 0.1, 0.2)),
	])
	_set_head(Vector3(0, 0.23, 0), 0.25, Vector3(1.02, 0.97, 0.98))
	var hc := head_c
	_add(head, SKIN, [
		p_sph(head_r, hc, head_s, Vector3.ZERO, 16),
		p_ell(Vector3(0.055, 0.09, 0.055), hc + Vector3(-0.25, -0.02, 0.01)),
		p_ell(Vector3(0.055, 0.09, 0.055), hc + Vector3(0.25, -0.02, 0.01)),
	])
	_add(head, HAIR, [
		p_sph(0.255, hc + Vector3(0, 0.06, 0.06), Vector3(1.0, 0.92, 1.0), Vector3.ZERO, 16),
		p_ell(Vector3(0.1, 0.06, 0.16), hc + Vector3(0, 0.26, 0.04)),
	])
	_face({
		"eye_x": 0.09, "eye_y": -0.01, "eye_size": Vector3(0.045, 0.065, 0.028),
		"mouth_y": -0.11, "mouth_w": 0.05, "mouth_open": 0.8, "blush_x": 0.145, "blush_y": -0.07,
	})
	_add_flat(head, SKIN.darkened(0.14), [p_ell(Vector3(0.028, 0.02, 0.012), _hs(0, -0.045, -0.002), _hs_rot(0, -0.045))])
	var br := []
	for sx in [-1.0, 1.0]:
		br.append(p_ell(Vector3(0.065, 0.018, 0.02), _hs(0.09 * sx, 0.065, -0.003), _hs_rot(0.09 * sx, 0.065) + Vector3(0, 0, 8.0 * sx)))
	_add_flat(head, HAIR, br)
	# 菅笠（顔に濃い影を落とさないよう影なし）
	_add_noshadow(head, STRAW, [
		p_cyl(0.4, 0.0, 0.2, hc + Vector3(0, 0.25, 0.01), Vector3(-6, 0, 0), Vector3.ONE, 16),
	])
	_add_noshadow(head, STRAW_D, [p_tor(0.36, 0.4, hc + Vector3(0, 0.155, 0.02), Vector3(-6, 0, 0))])
