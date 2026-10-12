extends "res://scripts/npc/models/chibi_base.gd"
## おはる（1726・源兵衛の孫娘で助手）。
## 桃色の花柄の着物・赤い帯・黒髪のお団子に赤いリボン・右手に丸い団扇（白地に赤い丸）。元気で明るい。
## "fan_wait"（団扇を前に突き出して止める＝待て）と "fan_go"（頭上で大きく振る＝進め）は形と動きで見分けられる。

const SKIN := Color(1.0, 0.8, 0.67)
const PINK := Color(0.98, 0.58, 0.7)
const PINK_L := Color(1.0, 0.88, 0.92)
const OBI := Color(0.86, 0.2, 0.3)
const CORD := Color(1.0, 0.82, 0.3)
const HAIR := Color(0.2, 0.12, 0.09)
const RIBBON := Color(0.92, 0.14, 0.2)
const FLOWER := Color(1.0, 0.94, 0.96)
const TABI := Color(0.98, 0.98, 0.97)
const ZORI := Color(0.85, 0.25, 0.3)
const FAN := Color(0.99, 0.97, 0.9)
const FAN_MARK := Color(0.9, 0.12, 0.15)
const BAMBOO := Color(0.82, 0.68, 0.4)

var fan: Node3D


func _build() -> void:
	model_key = "oharu"
	_rig({
		"leg_x": 0.07, "thigh": 0.13, "shin": 0.14, "shin_r": 0.045,
		"thigh_col": null, "shin_col": PINK_L, "foot_col": TABI, "foot": Vector3(0.085, 0.07, 0.14),
		"shoulder": Vector2(0.15, 0.31), "neck": 0.37,
		"upper": 0.12, "fore": 0.11, "upper_r": Vector2(0.05, 0.058), "fore_r": Vector2(0.05, 0.062), "hand_r": 0.046,
		"upper_col": PINK, "fore_col": PINK, "hand_col": SKIN,
		"arm_out": 0.22, "step": 0.42, "arm_swing": 0.45, "walk_speed": 1.2,
	})
	# 草履（足袋の下）
	for an in [ankle_l, ankle_r]:
		_add(an, ZORI, [p_box(Vector3(0.085, 0.02, 0.15), Vector3(0, -0.062, -0.03))])
	# 袖のたもと（腕を下ろすと幅広の袖に見える）
	for el in [elbow_l, elbow_r]:
		_add(el, PINK, [p_box(Vector3(0.04, 0.14, 0.1), Vector3(0, -0.07, 0.045))])
	_build_body()
	_build_head()
	_build_fan()


func _build_body() -> void:
	_add(torso, PINK, [
		p_ell(Vector3(0.3, 0.38, 0.26), Vector3(0, 0.19, 0)),
		p_cyl(0.18, 0.14, 0.34, Vector3(0, -0.08, 0)),
	])
	# 襟・裾の明るい縁取り
	var light := [p_cyl(0.186, 0.181, 0.035, Vector3(0, -0.235, 0))]
	for sx in [-1.0, 1.0]:
		light.append(p_box(Vector3(0.04, 0.15, 0.025), Vector3(0.045 * sx, 0.3, -0.115), Vector3(28, 0, -30.0 * sx)))
	light.append(p_box(Vector3(0.03, 0.3, 0.02), Vector3(0.05, -0.08, -0.158), Vector3(-6.5, 0, 0)))
	_add(torso, PINK_L, light)
	# 帯と後ろの結び
	_add(torso, OBI, [
		p_cyl(0.158, 0.158, 0.1, Vector3(0, 0.1, 0), Vector3.ZERO, Vector3(1, 1, 0.92)),
		p_ell(Vector3(0.13, 0.1, 0.07), Vector3(-0.07, 0.13, 0.165), Vector3(0, 0, -15)),
		p_ell(Vector3(0.13, 0.1, 0.07), Vector3(0.07, 0.13, 0.165), Vector3(0, 0, 15)),
		p_sph(0.04, Vector3(0, 0.12, 0.165)),
	])
	_add(torso, CORD, [p_cyl(0.161, 0.161, 0.018, Vector3(0, 0.1, 0), Vector3.ZERO, Vector3(1, 1, 0.93))])
	# 花柄（小さな5枚花びら）。[正面からの角度(度), 高さ]
	var fl := []
	var spots := [[-35.0, -0.05], [40.0, -0.16], [-10.0, -0.2], [75.0, -0.02], [-80.0, -0.15], [30.0, 0.22], [-38.0, 0.28], [150.0, -0.1], [-140.0, 0.0]]
	for sp in spots:
		var th := deg_to_rad(float(sp[0]))
		var y: float = sp[1]
		var center: Vector3
		if y < 0.08:
			var r := 0.14 + (0.09 - y) / 0.34 * 0.04 + 0.003
			center = Vector3(sin(th) * r, y, -cos(th) * r)
		else:
			var ry := (y - 0.19) / 0.19
			var k := sqrt(maxf(0.0, 1.0 - ry * ry)) + 0.02
			center = Vector3(sin(th) * 0.15 * k, y, -cos(th) * 0.13 * k)
		var rot := Vector3(0, rad_to_deg(-th), 0)
		var b := Basis.from_euler(rot * (PI / 180.0))
		for i in 5:
			var a := TAU * i / 5.0 + 0.3
			fl.append(p_ell(Vector3(0.022, 0.022, 0.008), center + b * Vector3(cos(a) * 0.016, sin(a) * 0.016, 0), rot, 6))
	_add_soft(torso, FLOWER, fl)


func _build_head() -> void:
	_set_head(Vector3(0, 0.215, 0), 0.235, Vector3(1.03, 0.97, 0.98))
	var hc := head_c
	_add(head, SKIN, [p_sph(head_r, hc, head_s, Vector3.ZERO, 16)])
	# 黒髪：後ろの髪・前髪・横の髪・お団子
	var hair := [
		p_sph(0.25, hc + Vector3(0, 0.035, 0.04), Vector3(1.02, 1.0, 1.0), Vector3.ZERO, 16),
		p_sph(0.1, hc + Vector3(0, 0.26, 0.05)),
	]
	# 前髪（ぱっつん気味に、ゆるく3つの房）
	hair.append(p_ell(Vector3(0.3, 0.1, 0.12), _hs(0, 0.115, -0.03), _hs_rot(0, 0.115)))
	for sx in [-1.0, 1.0]:
		hair.append(p_ell(Vector3(0.12, 0.13, 0.07), _hs(0.1 * sx, 0.09, -0.012), _hs_rot(0.1 * sx, 0.09) + Vector3(0, 0, -14.0 * sx)))
	for sx in [-1.0, 1.0]:
		hair.append(p_ell(Vector3(0.06, 0.2, 0.08), hc + Vector3(0.2 * sx, -0.05, -0.03), Vector3(0, 0, 6.0 * sx)))
	_add(head, HAIR, hair)
	# 赤いリボン（お団子の根元に大きく結ぶ）
	_add(head, RIBBON, [
		p_ell(Vector3(0.14, 0.09, 0.045), hc + Vector3(-0.09, 0.24, 0.02), Vector3(10, 10, 22)),
		p_ell(Vector3(0.14, 0.09, 0.045), hc + Vector3(0.09, 0.24, 0.02), Vector3(10, -10, -22)),
		p_sph(0.035, hc + Vector3(0, 0.225, 0.0)),
		p_ell(Vector3(0.04, 0.12, 0.025), hc + Vector3(-0.04, 0.16, 0.08), Vector3(-30, 0, -14)),
		p_ell(Vector3(0.04, 0.12, 0.025), hc + Vector3(0.04, 0.16, 0.08), Vector3(-30, 0, 14)),
	])
	_face({
		"eye_x": 0.085, "eye_y": -0.02, "eye_size": Vector3(0.062, 0.088, 0.03),
		"mouth_y": -0.105, "mouth_w": 0.04, "mouth_open": 1.0,
		"blush_x": 0.135, "blush_y": -0.07,
	})


func _build_fan() -> void:
	# 柄は手の親指側（-Z）へ、扇面は柄の先で手の Y 軸を法線にする
	fan = _node(hand_r, Vector3.ZERO, "Fan")
	_add(fan, BAMBOO, [p_cyl(0.011, 0.011, 0.14, Vector3(0, 0, -0.07), Vector3(90, 0, 0), Vector3.ONE, 6)])
	_add(fan, FAN, [p_cyl(0.1, 0.1, 0.014, Vector3(0, 0, -0.2), Vector3.ZERO, Vector3(1, 1, 1.08), 16)])
	_add_flat(fan, FAN_MARK, [p_cyl(0.055, 0.055, 0.018, Vector3(0, 0, -0.205), Vector3.ZERO, Vector3.ONE, 14)])


## 待機：胸の前で両手を合わせ、団扇を立てて持つ。
func _p_idle(p: Dictionary) -> void:
	super._p_idle(p)
	var b := sin(_t * 2.1)
	p["arm_l"] = Vector3(0.45 + b * 0.02, 0.0, 0.1)
	p["arm_r"] = Vector3(0.45 + b * 0.02, 0.0, -0.1)
	p["elb_l"] = Vector3(1.25, 0.55, 0)
	p["elb_r"] = Vector3(1.25, -0.55, 0)
	p["hand_r"] = Vector3(-0.15, 0, 0)
	p["head"] = Vector3(0.04 + sin(_t * 1.1) * 0.03, sin(_t * 0.45) * 0.14, 0.08 + sin(_t * 0.9) * 0.05)


func _p_walk(p: Dictionary, delta: float) -> void:
	super._p_walk(p, delta)
	p["hand_r"] = Vector3(1.3, 0, 0)  # 団扇は立てたまま


func _p_wave(p: Dictionary) -> void:
	super._p_wave(p)
	p["hand_r"] = Vector3(-1.5, 0, 0)


func _p_cheer(p: Dictionary) -> void:
	super._p_cheer(p)
	p["hand_r"] = Vector3(-1.5, 0, 0)


func _p_point(p: Dictionary) -> void:
	super._p_point(p)
	p["arm_l"] = Vector3(0.6, 0, 0.1)
	p["elb_l"] = Vector3(1.3, 0.5, 0)
	p["hand_r"] = Vector3(0.0, 0, 0)
	# 団扇で指し示すので右は団扇を持ったまま前へ


## 待て：団扇を前へまっすぐ突き出し、面を相手に見せてぴたりと止める（左手も手のひらを前に）。
func _p_fan_wait(p: Dictionary) -> void:
	super._p_fan_wait(p)
	p["arm_r"] = Vector3(1.3, 0, 0.55)
	p["elb_r"] = Vector3(0.05, 0, 0)
	p["hand_r"] = Vector3(0.25, 0, -0.5)
	p["arm_l"] = Vector3(-0.2, 0, -0.75)
	p["elb_l"] = Vector3(0.2, 0, 1.9)
	p["head"] = Vector3(0.0, 0.0, 0.0)
	p["torso"] = Vector3(0.08, 0, 0)
	p["rate"] = 16.0
