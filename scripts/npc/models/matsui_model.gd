extends "res://scripts/npc/models/chibi_base.gd"
## マツイ社長（2026・会社の社長。ご本人の了承を得た似顔の簡易表現）。
## 前髪がまっすぐおでこにかかる黒髪のマッシュ風ショート・丸顔・笑顔・眼鏡なし・
## 黒（チャコール）のテーラードジャケットに白いクルーネックTシャツ・濃い色のズボン・黒い靴。中肉中背。

const SKIN := Color(1.0, 0.79, 0.65)
const HAIR := Color(0.08, 0.08, 0.1)
const JACKET := Color(0.2, 0.2, 0.24)
const LAPEL := Color(0.15, 0.15, 0.18)
const SHIRT := Color(0.98, 0.98, 0.97)
const PANTS := Color(0.17, 0.17, 0.21)
const SHOES := Color(0.08, 0.08, 0.09)


func _build() -> void:
	model_key = "matsui"
	_rig({
		"leg_x": 0.092, "thigh": 0.22, "shin": 0.22, "thigh_r": 0.078, "shin_r": 0.066,
		"thigh_col": PANTS, "shin_col": PANTS, "foot_col": SHOES, "foot": Vector3(0.12, 0.09, 0.23),
		"shoulder": Vector2(0.225, 0.47), "neck": 0.57,
		"upper": 0.2, "fore": 0.18, "upper_r": Vector2(0.066, 0.062), "fore_r": Vector2(0.058, 0.054), "hand_r": 0.06,
		"upper_col": JACKET, "fore_col": JACKET, "hand_col": SKIN,
		"arm_out": 0.2, "step": 0.5, "arm_swing": 0.55, "walk_speed": 1.4,
	})
	# 袖口から少しだけ白いシャツ…ではなくTシャツなので手首はそのまま
	_build_body()
	_build_head()


func _build_body() -> void:
	# ジャケット（胴・裾・肩）。前は開けて着る（参考写真：黒のジャケットに白のクルーネックT）
	var jk := [
		p_ell(Vector3(0.42, 0.66, 0.33), Vector3(0, 0.25, 0)),
		p_cyl(0.2, 0.205, 0.12, Vector3(0, 0.0, 0), Vector3.ZERO, Vector3(1, 1, 0.8)),
	]
	for sx in [-1.0, 1.0]:
		jk.append(p_ell(Vector3(0.15, 0.12, 0.2), Vector3(0.185 * sx, 0.46, 0)))
	_add(torso, JACKET, jk)
	# 白いTシャツ：首元まで白く見せ、丸首（クルーネック）にする
	_add(torso, SHIRT, [
		p_ell(Vector3(0.2, 0.38, 0.1), Vector3(0, 0.39, -0.124), Vector3(-6, 0, 0)),
		p_cyl(0.092, 0.088, 0.06, Vector3(0, 0.55, -0.01)),
	])
	# 襟（ラペル）：開きの左右に沿わせ、首の前では重ねない
	var lp := []
	for sx in [-1.0, 1.0]:
		lp.append(p_box(Vector3(0.055, 0.25, 0.03), Vector3(0.095 * sx, 0.355, -0.152), Vector3(16, 0, -21.0 * sx)))
	_add(torso, LAPEL, lp)


func _build_head() -> void:
	_set_head(Vector3(0, 0.235, 0), 0.265, Vector3(1.03, 0.98, 0.98))
	var hc := head_c
	_add(head, SKIN, [
		p_sph(head_r, hc, head_s, Vector3.ZERO, 16),
		p_cyl(0.062, 0.062, 0.1, Vector3(0, 0.0, 0.0)),
		p_ell(Vector3(0.06, 0.1, 0.06), hc + Vector3(-0.268, -0.03, 0.01)),
		p_ell(Vector3(0.06, 0.1, 0.06), hc + Vector3(0.268, -0.03, 0.01)),
	])
	# 黒髪のマッシュ：大きめの丸い髪の下から顔がのぞき、前髪はまっすぐ眉の上で切りそろえる
	_add(head, HAIR, [
		p_sph(0.278, hc + Vector3(0, 0.05, 0.03), Vector3(1.05, 0.86, 1.03), Vector3.ZERO, 16),
		p_sph(0.2, hc + Vector3(0, -0.07, 0.12), Vector3(1.25, 1.0, 1.0)),
		p_ell(Vector3(0.44, 0.12, 0.16), hc + Vector3(0, 0.082, -0.16), Vector3(-4, 0, 0)),
		p_ell(Vector3(0.12, 0.2, 0.2), hc + Vector3(-0.235, 0.0, -0.04)),
		p_ell(Vector3(0.12, 0.2, 0.2), hc + Vector3(0.235, 0.0, -0.04)),
	])
	_face({
		"eye_x": 0.092, "eye_y": -0.008, "eye_size": Vector3(0.052, 0.07, 0.03),
		"mouth_y": -0.118, "mouth_w": 0.065, "mouth_open": 0.95,
		"blush": true, "blush_x": 0.15, "blush_y": -0.07, "blush_col": Color(1.0, 0.72, 0.68),
	})
	_add_flat(head, SKIN.darkened(0.12), [p_ell(Vector3(0.03, 0.02, 0.012), _hs(0, -0.055, -0.002), _hs_rot(0, -0.055))])
	# 眉（前髪のすぐ下・やわらかい弧）
	var br := []
	for sx in [-1.0, 1.0]:
		br.append(p_ell(Vector3(0.07, 0.016, 0.02), _hs(0.093 * sx, 0.058, -0.002), _hs_rot(0.093 * sx, 0.058) + Vector3(0, 0, 6.0 * sx)))
	_add_flat(head, HAIR, br)
