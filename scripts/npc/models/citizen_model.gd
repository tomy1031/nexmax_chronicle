extends "res://scripts/npc/models/chibi_base.gd"
## 通行人（2026・現代のふつうの服装）。
## 作るたびに服・髪の色や髪型・袖丈が順番に変わる（同じ並びなら毎回同じ見た目）。

const SKINS := [Color(1.0, 0.79, 0.65), Color(0.95, 0.72, 0.56), Color(1.0, 0.82, 0.7)]
const SHIRTS := [Color(0.95, 0.45, 0.4), Color(0.25, 0.65, 0.7), Color(0.95, 0.78, 0.3), Color(0.6, 0.5, 0.85), Color(0.4, 0.72, 0.4), Color(0.45, 0.62, 0.92)]
const PANTS := [Color(0.24, 0.34, 0.58), Color(0.78, 0.7, 0.55), Color(0.2, 0.2, 0.24)]
const HAIRS := [Color(0.1, 0.08, 0.08), Color(0.3, 0.18, 0.1), Color(0.48, 0.3, 0.16)]
const SHOES := Color(0.96, 0.96, 0.95)
const SOLE := Color(0.35, 0.36, 0.4)

static var _count := 0


func _build() -> void:
	var v := _count
	_count += 1
	var skin: Color = SKINS[v % SKINS.size()]
	var shirt: Color = SHIRTS[v % SHIRTS.size()]
	var pants: Color = PANTS[(v / 2) % PANTS.size()]
	var hair_c: Color = HAIRS[(v + 1) % HAIRS.size()]
	var long_sleeve := v % 2 == 1
	var bob := v % 3 == 2
	model_key = "citizen_%d" % (v % 6)  # 色は頂点カラーに焼き込むので型ごとにキャッシュ
	_rig({
		"leg_x": 0.09, "thigh": 0.21, "shin": 0.21, "thigh_r": 0.076, "shin_r": 0.064,
		"thigh_col": pants, "shin_col": pants, "foot_col": SHOES, "foot": Vector3(0.12, 0.09, 0.22),
		"shoulder": Vector2(0.2, 0.45), "neck": 0.55,
		"upper": 0.19, "fore": 0.17, "upper_r": Vector2(0.064, 0.062), "fore_r": Vector2(0.054, 0.05), "hand_r": 0.058,
		"upper_col": shirt, "fore_col": shirt if long_sleeve else skin, "hand_col": skin,
		"arm_out": 0.2, "step": 0.5, "walk_speed": 1.4,
	})
	for an in [ankle_l, ankle_r]:
		_add(an, SOLE, [p_box(Vector3(0.11, 0.025, 0.22), Vector3(0, -0.075, -0.045))])
	_add(torso, shirt, [
		p_ell(Vector3(0.42, 0.56, 0.32), Vector3(0, 0.27, 0)),
		p_cyl(0.19, 0.18, 0.1, Vector3(0, 0.03, 0), Vector3.ZERO, Vector3(1, 1, 0.85)),
	])
	if long_sleeve:
		# パーカーのフードと前ポケット
		_add(torso, shirt.darkened(0.12), [
			p_tor(0.06, 0.15, Vector3(0, 0.53, 0.02), Vector3(-15, 0, 0), Vector3(1.0, 1.6, 1.0)),
			p_box(Vector3(0.2, 0.09, 0.03), Vector3(0, 0.12, -0.165), Vector3(8, 0, 0)),
		])
	else:
		_add(torso, shirt.darkened(0.15), [p_cyl(0.075, 0.068, 0.035, Vector3(0, 0.545, 0))])
	_set_head(Vector3(0, 0.235, 0), 0.26, Vector3(1.02, 0.97, 0.98))
	var hc := head_c
	_add(head, skin, [
		p_sph(head_r, hc, head_s, Vector3.ZERO, 16),
		p_cyl(0.058, 0.058, 0.08, Vector3(0, 0.0, 0.0)),
		p_ell(Vector3(0.055, 0.09, 0.055), hc + Vector3(-0.262, -0.025, 0.01)),
		p_ell(Vector3(0.055, 0.09, 0.055), hc + Vector3(0.262, -0.025, 0.01)),
	])
	var hair := [p_sph(0.27, hc + Vector3(0, 0.065, 0.05), Vector3(1.02, 0.94, 1.0), Vector3.ZERO, 16)]
	if bob:
		hair.append(p_ell(Vector3(0.58, 0.32, 0.46), hc + Vector3(0, -0.04, 0.08)))
	hair.append(p_ell(Vector3(0.34, 0.1, 0.16), hc + Vector3(0.04, 0.12, -0.19), Vector3(-10, 0, -8)))
	_add(head, hair_c, hair)
	_add_flat(head, skin.darkened(0.13), [p_ell(Vector3(0.028, 0.02, 0.012), _hs(0, -0.05, -0.002), _hs_rot(0, -0.05))])
	_face({
		"eye_x": 0.09, "eye_y": -0.01, "eye_size": Vector3(0.048, 0.068, 0.028),
		"mouth_y": -0.115, "mouth_w": 0.05, "mouth_open": 0.75, "blush_x": 0.15, "blush_y": -0.07,
	})
