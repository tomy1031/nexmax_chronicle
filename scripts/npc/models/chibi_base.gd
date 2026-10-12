extends Node3D
## ちびキャラ（人型）モデルの共通部分：骨組み・部品づくり・手続き的アニメーション。
## 各キャラのスクリプトはこれを継承し、_build() の中で _rig()（骨組み）と飾りを組み立てる。
## 原点は足元、前方は -Z。Npc から毎フレーム animate(delta, moving, anim) が呼ばれる。
## 描画負荷対策：骨組みのノードを Skeleton3D の骨に写し、体の形はすべて頂点カラー付きの
## 1枚のスキンメッシュ（輪郭線つき）にまとめる。陰影なしの細部（口・頬・柄など）も1枚。
## まばたきする目や持ち物など、別に動く・出し入れするものだけ独立したメッシュにする。
## できたメッシュは model_key ごとにキャッシュして同じキャラ全員で共有する。
##
## 対応アニメ: "idle" / "walk" / "wave" / "hammer" / "point" / "cheer" / "fan_wait" / "fan_go" / "sit" / "work"
## 知らない名前は idle になる。

const INK := Color(0.07, 0.06, 0.1)
const MOUTH_RED := Color(0.72, 0.2, 0.24)
const BLUSH := Color(1.0, 0.6, 0.62)

static var _meshes: Dictionary = {}
static var _vc_mats: Dictionary = {}

var model_key := "chibi"     # 焼き込みメッシュのキャッシュ名（キャラ・型ごとに変える）
var cfg: Dictionary = {}     # 骨組みの寸法

var body_root: Node3D
var torso: Node3D
var head: Node3D
var arm_l: Node3D
var arm_r: Node3D
var elbow_l: Node3D
var elbow_r: Node3D
var hand_l: Node3D
var hand_r: Node3D
var leg_l: Node3D
var leg_r: Node3D
var knee_l: Node3D
var knee_r: Node3D
var ankle_l: Node3D
var ankle_r: Node3D
var eyes: Array[Node3D] = []
var skeleton: Skeleton3D
var bones: Array[Node3D] = []   # 骨として Skeleton3D に写すノード（親が先）
var _groups: Dictionary = {}    # 形の集まり（ノード×種類）
var _group_order: Array = []

var head_c := Vector3.ZERO   # 頭の中心（head ノード基準）
var head_r := 0.25
var head_s := Vector3.ONE    # 頭の球のつぶし具合

var _built := false
var _t := 0.0
var _phase := 0.0
var _blink_t := 2.0
var _speed := 0.0
var _last_pos := Vector3.ZERO
var _has_last := false
var _anim := ""
var _anim_t := 0.0


## 形を組み立てる（CharacterBuilder.build から呼ぶ。二重には作らない）。
func construct() -> void:
	if _built:
		return
	_built = true
	_t = randf() * 10.0          # 何人いても動きがそろわないように
	_blink_t = randf_range(0.8, 3.5)
	_build()
	_finish()


func _ready() -> void:
	construct()


## 継承先で実装：_rig() と飾り。
func _build() -> void:
	pass


# ================================================================ アニメーション

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
	if body_root == null:
		return
	var p := _rest_pose()
	_pose(a, p, delta)
	_apply(p, delta)
	_blink(delta)
	_after(a, delta)
	_sync_bones()


## 継承先で上書き：アニメごとの小物の出し入れなど。
func _after(_a: String, _delta: float) -> void:
	pass


func _measure_speed(delta: float) -> void:
	if not is_inside_tree() or delta <= 0.0:
		return
	var gp := global_position
	if _has_last:
		var d := gp - _last_pos
		d.y = 0.0
		var s := d.length() / delta
		if s > 20.0:  # 瞬間移動は無視
			s = 0.0
		_speed = lerpf(_speed, s, minf(1.0, delta * 8.0))
	_last_pos = gp
	_has_last = true


func _rest_pose() -> Dictionary:
	var ao: float = cfg.get("arm_out", 0.2)
	return {
		"y": 0.0, "root": Vector3.ZERO, "torso": Vector3.ZERO, "head": Vector3.ZERO,
		"arm_l": Vector3(0, 0, -ao), "arm_r": Vector3(0, 0, ao),
		"elb_l": Vector3(0.2, 0, 0), "elb_r": Vector3(0.2, 0, 0),
		"hand_l": Vector3.ZERO, "hand_r": Vector3.ZERO,
		"leg_l": Vector3.ZERO, "leg_r": Vector3.ZERO,
		"knee_l": Vector3.ZERO, "knee_r": Vector3.ZERO,
		"ank_l": Vector3.ZERO, "ank_r": Vector3.ZERO,
		"rate": 12.0,
	}


func _pose(a: String, p: Dictionary, delta: float) -> void:
	match a:
		"walk":
			_p_walk(p, delta)
		"wave":
			_p_wave(p)
		"hammer":
			_p_hammer(p)
		"point":
			_p_point(p)
		"cheer":
			_p_cheer(p)
		"fan_wait":
			_p_fan_wait(p)
		"fan_go":
			_p_fan_go(p)
		"sit":
			_p_sit(p)
		"work":
			_p_work(p)
		_:
			_p_idle(p)


func _apply(p: Dictionary, delta: float) -> void:
	var rate: float = p["rate"]
	var k := 1.0 - exp(-rate * delta)
	body_root.position.y = lerpf(body_root.position.y, p["y"], k)
	body_root.rotation = body_root.rotation.lerp(p["root"], k)
	torso.rotation = torso.rotation.lerp(p["torso"], k)
	head.rotation = head.rotation.lerp(p["head"], k)
	arm_l.rotation = arm_l.rotation.lerp(p["arm_l"], k)
	arm_r.rotation = arm_r.rotation.lerp(p["arm_r"], k)
	elbow_l.rotation = elbow_l.rotation.lerp(p["elb_l"], k)
	elbow_r.rotation = elbow_r.rotation.lerp(p["elb_r"], k)
	hand_l.rotation = hand_l.rotation.lerp(p["hand_l"], k)
	hand_r.rotation = hand_r.rotation.lerp(p["hand_r"], k)
	leg_l.rotation = leg_l.rotation.lerp(p["leg_l"], k)
	leg_r.rotation = leg_r.rotation.lerp(p["leg_r"], k)
	knee_l.rotation = knee_l.rotation.lerp(p["knee_l"], k)
	knee_r.rotation = knee_r.rotation.lerp(p["knee_r"], k)
	ankle_l.rotation = ankle_l.rotation.lerp(p["ank_l"], k)
	ankle_r.rotation = ankle_r.rotation.lerp(p["ank_r"], k)


func _blink(delta: float) -> void:
	_blink_t -= delta
	var target := 1.0
	if _blink_t < 0.13:
		target = 0.1
	if _blink_t < 0.0:
		_blink_t = randf_range(2.0, 5.0)
	for e in eyes:
		e.scale.y = lerpf(e.scale.y, target, minf(1.0, delta * 30.0))


# ---------------------------------------------------------------- 姿勢

## 立ったまましゃがむ（足の位置は変えずに腰を落とす）。a は太ももの前傾角、splay は外への開き。
func _crouch(p: Dictionary, a: float, splay: float = 0.0) -> void:
	var L: float = float(cfg["thigh"]) + float(cfg["shin"])
	p["leg_l"] = Vector3(a, 0, -splay)
	p["leg_r"] = Vector3(a, 0, splay)
	p["knee_l"] = Vector3(-2.0 * a, 0, 0)
	p["knee_r"] = Vector3(-2.0 * a, 0, 0)
	p["ank_l"] = Vector3(a, 0, splay * 0.8)
	p["ank_r"] = Vector3(a, 0, -splay * 0.8)
	var ca := cos(a)
	var sa := sin(a)
	p["y"] = float(p["y"]) - L * (1.0 - ca * (cos(splay) * ca * ca + sa * sa))


func _p_idle(p: Dictionary) -> void:
	var b := sin(_t * 2.1)
	p["y"] = b * 0.006
	p["torso"] = Vector3(b * 0.018, 0, 0)
	p["head"] = Vector3(sin(_t * 1.1) * 0.03, sin(_t * 0.45) * 0.14, sin(_t * 0.7) * 0.03)
	var ao: float = cfg.get("arm_out", 0.2)
	p["arm_l"] = Vector3(sin(_t * 1.3) * 0.05, 0, -ao - b * 0.02)
	p["arm_r"] = Vector3(sin(_t * 1.3 + 1.0) * 0.05, 0, ao + b * 0.02)


func _p_walk(p: Dictionary, delta: float) -> void:
	var stride: float = float(cfg["thigh"]) + float(cfg["shin"])
	var amp: float = cfg.get("step", 0.55)
	var spd := _speed if _speed > 0.3 else float(cfg.get("walk_speed", 1.4))
	_phase += delta * clampf(TAU * spd / (4.0 * stride * sin(amp)), 4.0, 16.0)
	var s := sin(_phase)
	var c := cos(_phase)
	p["leg_l"] = Vector3(s * amp, 0, 0)
	p["leg_r"] = Vector3(-s * amp, 0, 0)
	var kl := -maxf(0.0, c) * amp * 1.4
	var kr := -maxf(0.0, -c) * amp * 1.4
	p["knee_l"] = Vector3(kl, 0, 0)
	p["knee_r"] = Vector3(kr, 0, 0)
	p["ank_l"] = Vector3(-(s * amp + kl) * 0.6, 0, 0)
	p["ank_r"] = Vector3(-(-s * amp + kr) * 0.6, 0, 0)
	p["y"] = absf(c) * stride * 0.09
	p["torso"] = Vector3(-0.06, s * 0.09, 0)
	p["head"] = Vector3(0.03, -s * 0.06, 0)
	var ao: float = cfg.get("arm_out", 0.2)
	var aa: float = cfg.get("arm_swing", 0.6)
	p["arm_l"] = Vector3(-s * aa, 0, -ao)
	p["arm_r"] = Vector3(s * aa, 0, ao)
	p["elb_l"] = Vector3(0.35 + maxf(0.0, -s) * 0.4, 0, 0)
	p["elb_r"] = Vector3(0.35 + maxf(0.0, s) * 0.4, 0, 0)
	p["rate"] = 18.0


func _p_wave(p: Dictionary) -> void:
	_p_idle(p)
	var w := sin(_anim_t * 9.0)
	p["arm_r"] = Vector3(0.25, 0, 2.55)
	p["elb_r"] = Vector3(0.1, 0, 0.35 + w * 0.5)
	p["hand_r"] = Vector3(0, 0, w * 0.2)
	p["torso"] = Vector3(0, 0, 0.06)
	p["head"] = Vector3(0.06, 0, sin(_anim_t * 4.5) * 0.08)
	p["y"] = absf(sin(_anim_t * 4.5)) * 0.015
	p["rate"] = 18.0


func _p_point(p: Dictionary) -> void:
	_p_idle(p)
	var pulse := sin(_anim_t * 5.0) * 0.04
	p["arm_r"] = Vector3(1.72 + pulse, -0.15, 0.08)
	p["elb_r"] = Vector3(0.05, 0, 0)
	p["hand_r"] = Vector3(-0.3, 0, 0)
	p["arm_l"] = Vector3(-0.2, 0, -0.75)
	p["elb_l"] = Vector3(0.2, 0, 1.9)
	p["torso"] = Vector3(-0.03, -0.18, 0)
	p["head"] = Vector3(0.05, 0.12, 0)


func _p_cheer(p: Dictionary) -> void:
	var h := absf(sin(_anim_t * 6.0))
	p["y"] = h * 0.13
	var pump := sin(_anim_t * 12.0) * 0.15
	p["arm_l"] = Vector3(0.25, 0, -2.55 - pump)
	p["arm_r"] = Vector3(0.25, 0, 2.55 + pump)
	p["elb_l"] = Vector3(0.25, 0, 0)
	p["elb_r"] = Vector3(0.25, 0, 0)
	p["leg_l"] = Vector3(h * 0.35, 0, -0.05)
	p["leg_r"] = Vector3(h * 0.35, 0, 0.05)
	p["knee_l"] = Vector3(-h * 0.7, 0, 0)
	p["knee_r"] = Vector3(-h * 0.7, 0, 0)
	p["torso"] = Vector3(0.06, 0, 0)
	p["head"] = Vector3(0.18, 0, sin(_anim_t * 6.0) * 0.06)
	p["rate"] = 20.0


## 叩く・調整する（しゃがんで前の仕掛けを打つ）。
func _p_hammer(p: Dictionary) -> void:
	var s := fmod(_anim_t / 0.95, 1.0)
	var up := 0.0
	if s < 0.62:
		up = smoothstep(0.0, 0.62, s)            # ゆっくり振り上げ
	elif s < 0.74:
		up = 1.0 - (s - 0.62) / 0.12              # すばやく振り下ろす
	_crouch(p, 0.85, 0.42)
	var hit := 1.0 - smoothstep(0.74, 0.9, s) if s >= 0.74 else 0.0
	p["torso"] = Vector3(-0.42 + up * 0.1 - hit * 0.05, 0.1, 0)
	p["head"] = Vector3(-0.2 + up * 0.15, -0.05, 0)
	p["arm_r"] = Vector3(0.75 + up * 1.75, 0, 0.2)
	p["elb_r"] = Vector3(0.25 + up * 0.9, 0, 0)
	p["hand_r"] = Vector3(-0.9 + up * 0.5, 0, 0)
	p["arm_l"] = Vector3(0.95, 0, -0.15)
	p["elb_l"] = Vector3(0.7, 0, 0.3)
	p["y"] = float(p["y"]) - hit * 0.015
	p["rate"] = 30.0


## 立ったまま手元で作業する。
func _p_work(p: Dictionary) -> void:
	_p_idle(p)
	var w := sin(_anim_t * 6.0)
	p["arm_l"] = Vector3(0.75 + w * 0.12, 0, -0.1)
	p["arm_r"] = Vector3(0.75 - w * 0.12, 0, 0.1)
	p["elb_l"] = Vector3(1.0, 0, 0.25)
	p["elb_r"] = Vector3(1.0, 0, -0.25)
	p["torso"] = Vector3(-0.12, sin(_anim_t * 1.3) * 0.08, 0)
	p["head"] = Vector3(-0.3, sin(_anim_t * 1.3) * 0.1, 0)


## 待て：手（団扇）を前に平らに突き出して止める。
func _p_fan_wait(p: Dictionary) -> void:
	_p_idle(p)
	p["arm_r"] = Vector3(1.5, 0, 0.12)
	p["elb_r"] = Vector3(0.08, 0, 0)
	p["hand_r"] = Vector3(0, 0, 0)
	p["arm_l"] = Vector3(0.2, 0, -0.6)
	p["elb_l"] = Vector3(0.2, 0, 1.8)
	p["torso"] = Vector3(0.05, -0.1, 0)
	p["head"] = Vector3(0.04, 0.05, 0)
	p["y"] = 0.0
	_crouch(p, 0.12)


## 進め：手（団扇）を高く上げて大きく振る。
func _p_fan_go(p: Dictionary) -> void:
	var w := sin(_anim_t * 8.0)
	var h := absf(sin(_anim_t * 4.0))
	p["y"] = h * 0.06
	# 腕は高く上げたまま、肘と手首で頭上を大きく左右に振る
	p["arm_r"] = Vector3(0.1, 0, 2.5 + w * 0.25)
	p["elb_r"] = Vector3(0.0, 0, 0.15 + w * 0.5)
	p["hand_r"] = Vector3(-1.5, 0, w * 0.5)
	p["arm_l"] = Vector3(0.5, 0, -0.5 - h * 0.4)
	p["elb_l"] = Vector3(1.2, 0, 0)
	p["torso"] = Vector3(0.05, 0, -w * 0.06)
	p["head"] = Vector3(0.15, 0, w * 0.06)
	p["leg_l"] = Vector3(h * 0.2, 0, 0)
	p["knee_l"] = Vector3(-h * 0.4, 0, 0)
	p["rate"] = 20.0


## あぐらで座る（舟の床に置いたときに自然に見える高さ）。
func _p_sit(p: Dictionary) -> void:
	var hip: float = cfg["hip"]
	var tr: float = cfg.get("thigh_r", 0.07)
	p["y"] = -(hip - tr * 1.25)
	p["leg_l"] = Vector3(1.3, 0, -0.8)
	p["leg_r"] = Vector3(1.3, 0, 0.8)
	p["knee_l"] = Vector3(0, 0, 2.25)
	p["knee_r"] = Vector3(0, 0, -2.25)
	p["ank_l"] = Vector3(0.6, 0, 0)
	p["ank_r"] = Vector3(0.6, 0, 0)
	var sway := sin(_t * 1.2)
	p["torso"] = Vector3(-0.06 + sin(_t * 2.0) * 0.012, 0, sway * 0.035)
	p["head"] = Vector3(sin(_t * 0.8) * 0.05, sin(_t * 0.37) * 0.2, -sway * 0.03)
	p["arm_l"] = Vector3(0.75, 0, -0.32)
	p["arm_r"] = Vector3(0.75, 0, 0.32)
	p["elb_l"] = Vector3(0.45, 0, 0.1)
	p["elb_r"] = Vector3(0.45, 0, -0.1)


# ================================================================ 骨組み

## 人型の骨組みを作る。寸法の例は各キャラの _build() を参照。
## 必須: thigh, shin, foot(Vector3 足の外形), leg_x, shoulder(Vector2), neck, upper, fore, upper_r(Vector2), fore_r(Vector2), hand_r
## 色: thigh_col / shin_col（null なら形なし）, foot_col, upper_col, fore_col, hand_col
func _rig(c: Dictionary) -> void:
	cfg = c
	var fs: Vector3 = c["foot"]
	if not c.has("hip"):
		c["hip"] = fs.y * 0.92 + float(c["thigh"]) + float(c["shin"])
	body_root = _bone(self, Vector3.ZERO, "Body")
	torso = _bone(body_root, Vector3(0, c["hip"], 0), "Torso")
	head = _bone(torso, Vector3(0, c["neck"], 0), "Head")
	leg_l = _make_leg(-1.0)
	leg_r = _make_leg(1.0)
	arm_l = _make_arm(-1.0)
	arm_r = _make_arm(1.0)


func _make_leg(sx: float) -> Node3D:
	var side := "L" if sx < 0.0 else "R"
	var hip := _bone(body_root, Vector3(float(cfg["leg_x"]) * sx, cfg["hip"], 0), "Leg" + side)
	var thigh: float = cfg["thigh"]
	var shin: float = cfg["shin"]
	if cfg.get("thigh_col") != null:
		var tr: float = cfg["thigh_r"]
		_add(hip, cfg["thigh_col"], [p_cap(tr, thigh + tr * 1.3, Vector3(0, -thigh * 0.5, 0))])
	var knee := _bone(hip, Vector3(0, -thigh, 0), "Knee" + side)
	if cfg.get("shin_col") != null:
		var sr: float = cfg["shin_r"]
		_add(knee, cfg["shin_col"], [p_cap(sr, shin + sr * 1.1, Vector3(0, -shin * 0.5, 0))])
	var ankle := _bone(knee, Vector3(0, -shin, 0), "Ankle" + side)
	var fs: Vector3 = cfg["foot"]
	_add(ankle, cfg["foot_col"], [p_ell(fs, Vector3(0, -fs.y * 0.5 + 0.004, -fs.z * 0.2))])
	if sx < 0.0:
		knee_l = knee
		ankle_l = ankle
	else:
		knee_r = knee
		ankle_r = ankle
	return hip


func _make_arm(sx: float) -> Node3D:
	var side := "L" if sx < 0.0 else "R"
	var sh: Vector2 = cfg["shoulder"]
	var pivot := _bone(torso, Vector3(sh.x * sx, sh.y, 0), "Arm" + side)
	var ul: float = cfg["upper"]
	var fl: float = cfg["fore"]
	var ur: Vector2 = cfg["upper_r"]
	var fr: Vector2 = cfg["fore_r"]
	var hr: float = cfg["hand_r"]
	_add(pivot, cfg["upper_col"], [
		p_sph(ur.x, Vector3.ZERO),
		p_cyl(ur.y, ur.x, ul, Vector3(0, -ul * 0.5, 0)),
	])
	var elbow := _bone(pivot, Vector3(0, -ul, 0), "Elbow" + side)
	_add(elbow, cfg["fore_col"], [
		p_sph(fr.x, Vector3.ZERO),
		p_cyl(fr.y, fr.x, fl, Vector3(0, -fl * 0.5, 0)),
	])
	var hand := _bone(elbow, Vector3(0, -fl - hr * 0.5, 0), "Hand" + side)
	_add(hand, cfg["hand_col"], [p_sph(hr, Vector3.ZERO, Vector3(0.9, 1.0, 1.0))])
	if sx < 0.0:
		elbow_l = elbow
		hand_l = hand
	else:
		elbow_r = elbow
		hand_r = hand
	return pivot


## 頭の球を置き、顔の位置計算用の値を覚える。
func _set_head(c: Vector3, r: float, s: Vector3 = Vector3.ONE) -> void:
	head_c = c
	head_r = r
	head_s = s


## 頭の表面上の点（頭の中心から x 右・y 上にずらした位置の正面側）。head ノード基準。
func _hs(x: float, y: float, out: float = 0.0) -> Vector3:
	var rx := head_r * head_s.x
	var ry := head_r * head_s.y
	var rz := head_r * head_s.z
	var q := 1.0 - (x / rx) * (x / rx) - (y / ry) * (y / ry)
	var z := -rz * sqrt(maxf(0.0, q))
	var n := Vector3(x / (rx * rx), y / (ry * ry), z / (rz * rz)).normalized()
	return head_c + Vector3(x, y, z) + n * out


## 頭の表面の向き（法線）に合わせる回転（度）。
func _hs_rot(x: float, y: float) -> Vector3:
	var p := _hs(x, y) - head_c
	var n := Vector3(p.x / (head_s.x * head_s.x), p.y / (head_s.y * head_s.y), p.z / (head_s.z * head_s.z)).normalized()
	# -Z を n に向ける
	var pitch := asin(clampf(n.y, -1.0, 1.0))
	var yaw := atan2(-n.x, -n.z)
	return Vector3(rad_to_deg(pitch), rad_to_deg(yaw), 0)


## 顔（目・ハイライト・口・頬）。o: eye_x, eye_y, eye_size(Vector3), eye_col, mouth_y, mouth_w, mouth_open, mouth_z, blush(bool), blush_x, blush_y, blush_col
func _face(o: Dictionary) -> void:
	var r := head_r
	var ex: float = o.get("eye_x", r * 0.34)
	var ey: float = o.get("eye_y", 0.0)
	var esz: Vector3 = o.get("eye_size", Vector3(r * 0.24, r * 0.34, 0.035))
	var ecol: Color = o.get("eye_col", INK)
	var eye_node := _node(head, Vector3(0, head_c.y + ey, 0), "Eyes")
	eyes.append(eye_node)
	var black := []
	var white := []
	for sx in [-1.0, 1.0]:
		var x: float = ex * sx
		var sp := _hs(x, ey, -esz.z * 0.12)
		var rot := _hs_rot(x, ey)
		var local := Vector3(sp.x, 0, sp.z)
		black.append(p_sph(0.5, local, esz, rot))
		var b := Basis.from_euler(rot * (PI / 180.0))
		white.append(p_sph(esz.x * 0.2, local + b * Vector3(esz.x * 0.2, esz.y * 0.2, -esz.z * 0.42)))
		white.append(p_sph(esz.x * 0.1, local + b * Vector3(-esz.x * 0.18, -esz.y * 0.22, -esz.z * 0.42)))
	_add_flat(eye_node, ecol, black)
	_add_flat(eye_node, Color.WHITE, white)
	# 口（にっこり。平らな面を上にした半球で半円の口に見せる）
	var my: float = o.get("mouth_y", -r * 0.42)
	var mw: float = o.get("mouth_w", r * 0.2)
	var mopen: float = o.get("mouth_open", 0.85)
	var mz: float = o.get("mouth_z", 999.0)
	var mp := _hs(0, my, -mw * 0.12)
	if mz < 900.0:
		mp.z = mz
	_add_flat(head, o.get("mouth_col", MOUTH_RED), [p_hemi(mw, mp, Vector3(180.0 + 15.0, 0, 0), Vector3(1.0, mopen, 0.45))])
	if o.get("blush", true):
		var bx: float = o.get("blush_x", r * 0.56)
		var by: float = o.get("blush_y", -r * 0.26)
		var bl := []
		for sx in [-1.0, 1.0]:
			var x: float = bx * sx
			bl.append(p_sph(0.5, _hs(x, by, -0.004), Vector3(r * 0.3, r * 0.14, 0.02), _hs_rot(x, by)))
		_add_flat(head, o.get("blush_col", BLUSH), bl)


# ================================================================ 形の登録とまとめ

## 骨になるノード（親は self か、すでに骨になっているノード）。
func _bone(parent: Node3D, pos: Vector3, n: String) -> Node3D:
	var nd := _node(parent, pos, n)
	bones.append(nd)
	return nd


## ふつうのノード（目・持ち物など、骨とは別に動かす・出し入れするもの）。
func _node(parent: Node3D, pos: Vector3, n: String = "") -> Node3D:
	var nd := Node3D.new()
	if n != "":
		nd.name = n
	nd.position = pos
	parent.add_child(nd)
	return nd


## 陰影＋輪郭線つきの形を node に付ける（node が骨ならスキンメッシュへ、そうでなければ node ごとに1枚へ）。
func _add(node: Node3D, color: Color, parts: Array) -> void:
	_queue(node, "shaded", color, parts)


## 陰影＋輪郭線つきだが影を落とさない形（笠など、顔に濃い影を落としたくないもの）。node ごとに独立した1枚になる。
func _add_noshadow(node: Node3D, color: Color, parts: Array) -> void:
	_queue(node, "noshadow", color, parts)


## 陰影なしの形（目・口・頬・柄など）。
func _add_flat(node: Node3D, color: Color, parts: Array) -> void:
	_queue(node, "flat", color, parts)


## 陰影あり・輪郭線なしの形（小さな柄など）。
func _add_soft(node: Node3D, color: Color, parts: Array) -> void:
	_queue(node, "soft", color, parts)


## 光る形（ジェットの炎など）。その場で独立したメッシュを作って返す。
func _add_glow(node: Node3D, key: String, color: Color, energy: float, parts: Array) -> MeshInstance3D:
	var full := model_key + "/glow/" + key
	var m: Mesh = _meshes.get(full)
	if m == null:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for pt in parts:
			st.append_from(pt[0], 0, pt[1])
		m = st.commit()
		_meshes[full] = m
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = LevelKit.glow(color, energy)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.add_child(mi)
	return mi


func _queue(node: Node3D, kind: String, color: Color, parts: Array) -> void:
	var gk := "%d|%s" % [node.get_instance_id(), kind]
	if not _groups.has(gk):
		_groups[gk] = {"node": node, "kind": kind, "parts": []}
		_group_order.append(gk)
	var list: Array = _groups[gk]["parts"]
	for pt in parts:
		list.append([pt[0], pt[1], color])


## 登録した形をメッシュにまとめる（construct の最後に呼ばれる）。
func _finish() -> void:
	var bone_idx := {}
	for i in bones.size():
		bone_idx[bones[i]] = i
	var skinned := {"shaded": [], "flat": [], "soft": []}
	for gk in _group_order:
		var g: Dictionary = _groups[gk]
		var node: Node3D = g["node"]
		var kind: String = g["kind"]
		if bone_idx.has(node) and kind != "noshadow":
			var bi: int = bone_idx[node]
			var rest := _rest_xf(node)
			for pt in g["parts"]:
				var xf: Transform3D = pt[1]
				skinned[kind].append([pt[0], rest * xf, pt[2], bi])
		else:
			# 骨でないノード：そのノードに1枚（ノード名でキャッシュ）
			var key: String = "%s/rigid/%s/%s" % [model_key, _path_name(node), kind]
			var m: Mesh = _meshes.get(key)
			if m == null:
				var plist := []
				for pt in g["parts"]:
					plist.append([pt[0], pt[1], pt[2], -1])
				m = _merge(plist, false)
				_meshes[key] = m
			var mi := MeshInstance3D.new()
			mi.mesh = m
			mi.material_override = _vc_mat("shaded" if kind == "noshadow" else kind)
			# 骨でない形（目・持ち物・笠など）は小物なので影を落とさない
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			node.add_child(mi)
	_groups.clear()
	_group_order.clear()
	if bones.is_empty():
		return
	skeleton = Skeleton3D.new()
	skeleton.name = "Skeleton"
	add_child(skeleton)
	for i in bones.size():
		var b := bones[i]
		skeleton.add_bone(String(b.name))
		var parent := b.get_parent()
		if bone_idx.has(parent):
			skeleton.set_bone_parent(i, bone_idx[parent])
		skeleton.set_bone_rest(i, b.transform)
		skeleton.set_bone_pose(i, b.transform)
	# バインド姿勢＝組み立て直後の各骨の位置（原点基準）の逆
	var skin := Skin.new()
	for i in bones.size():
		skin.add_bind(i, _rest_xf(bones[i]).affine_inverse())
	for kind in ["shaded", "soft", "flat"]:
		var plist: Array = skinned[kind]
		if plist.is_empty():
			continue
		var key: String = "%s/skin/%s" % [model_key, kind]
		var m: Mesh = _meshes.get(key)
		if m == null:
			m = _merge(plist, true)
			_meshes[key] = m
		var mi := MeshInstance3D.new()
		mi.name = "Mesh_" + kind
		mi.mesh = m
		mi.material_override = _vc_mat(kind)
		mi.extra_cull_margin = 0.5
		if kind != "shaded":
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.skin = skin
		skeleton.add_child(mi)
		mi.skeleton = NodePath("..")


## 骨ノードの動きを Skeleton3D に写す（毎フレーム）。
func _sync_bones() -> void:
	if skeleton == null:
		return
	for i in bones.size():
		var b := bones[i]
		skeleton.set_bone_pose_position(i, b.position)
		skeleton.set_bone_pose_rotation(i, b.quaternion)
		skeleton.set_bone_pose_scale(i, b.scale)


## 組み立て直後（静止姿勢）の node の位置をモデルの原点基準で求める。
func _rest_xf(node: Node3D) -> Transform3D:
	var t := node.transform
	var p := node.get_parent()
	while p != null and p != self:
		t = (p as Node3D).transform * t
		p = p.get_parent()
	return t


func _path_name(node: Node3D) -> String:
	var s := String(node.name)
	var p := node.get_parent()
	while p != null and p != self:
		s = String(p.name) + "." + s
		p = p.get_parent()
	return s


## [Mesh, Transform3D, Color, bone] の並びを頂点カラー付きの1枚のメッシュにする。
static func _merge(plist: Array, skinned: bool) -> ArrayMesh:
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var bns := PackedInt32Array()
	var wts := PackedFloat32Array()
	var idx := PackedInt32Array()
	for pt in plist:
		var mesh: Mesh = pt[0]
		var xf: Transform3D = pt[1]
		var col: Color = pt[2]
		var bone: int = pt[3]
		var arr := mesh.surface_get_arrays(0)
		var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var n: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
		var base := verts.size()
		var nb := xf.basis.inverse().transposed()
		verts.append_array(xf * v)
		for i in v.size():
			norms.append((nb * n[i]).normalized())
		var c0 := cols.size()
		cols.resize(c0 + v.size())
		for i in v.size():
			cols[c0 + i] = col
		if skinned:
			for i in v.size():
				bns.append(bone)
				bns.append(0)
				bns.append(0)
				bns.append(0)
				wts.append(1.0)
				wts.append(0.0)
				wts.append(0.0)
				wts.append(0.0)
		var ia = arr[Mesh.ARRAY_INDEX]
		if ia == null or (ia as PackedInt32Array).is_empty():
			for i in v.size():
				idx.append(base + i)
		else:
			var ii: PackedInt32Array = ia
			for i in ii.size():
				idx.append(base + ii[i])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_INDEX] = idx
	if skinned:
		arrays[Mesh.ARRAY_BONES] = bns
		arrays[Mesh.ARRAY_WEIGHTS] = wts
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return am


## 頂点カラーで色を付ける共有マテリアル。shaded=トゥーン＋縁の光＋輪郭線（LevelKit.char_mat と同じ見た目）、soft=輪郭線なし、flat=陰影なし。
static func _vc_mat(kind: String) -> Material:
	if _vc_mats.has(kind):
		return _vc_mats[kind]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color.WHITE
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	if kind == "flat":
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	else:
		m.roughness = 0.55
		m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
		m.specular_mode = BaseMaterial3D.SPECULAR_TOON
		m.rim_enabled = true
		m.rim = 0.35
		m.rim_tint = 0.6
		if kind == "shaded":
			m.next_pass = LevelKit.outline_mat()
	_vc_mats[kind] = m
	return m


# ================================================================ 部品の形

static func _xf(pos: Vector3, rot_deg: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE) -> Transform3D:
	return Transform3D(Basis.from_euler(rot_deg * (PI / 180.0)) * Basis.from_scale(scl), pos)


func p_sph(r: float, pos: Vector3, scl: Vector3 = Vector3.ONE, rot: Vector3 = Vector3.ZERO, seg: int = 12) -> Array:
	return [_sph_mesh(r, seg), _xf(pos, rot, scl)]


## 外形サイズ（直径）で指定する楕円体。
func p_ell(size: Vector3, pos: Vector3, rot: Vector3 = Vector3.ZERO, seg: int = 12) -> Array:
	return [_sph_mesh(0.5, seg), _xf(pos, rot, size)]


func p_hemi(r: float, pos: Vector3, rot: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE) -> Array:
	return [_hemi_mesh(r), _xf(pos, rot, scl)]


## 円柱（rb=下の半径, rt=上の半径）。軸は Y。
func p_cyl(rb: float, rt: float, h: float, pos: Vector3, rot: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE, seg: int = 12) -> Array:
	return [_cyl_mesh(rb, rt, h, seg), _xf(pos, rot, scl)]


func p_box(size: Vector3, pos: Vector3, rot: Vector3 = Vector3.ZERO) -> Array:
	return [_box_mesh(size), _xf(pos, rot)]


func p_cap(r: float, h: float, pos: Vector3, rot: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE) -> Array:
	return [_cap_mesh(r, maxf(h, r * 2.0)), _xf(pos, rot, scl)]


## 輪（内径・外径）。XZ 平面に寝ている。
func p_tor(inner: float, outer: float, pos: Vector3, rot: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE) -> Array:
	return [_tor_mesh(inner, outer), _xf(pos, rot, scl)]


## 平たい歯車の柄（XY 平面・両面）。
func p_gear(r: float, teeth: int, hole: float, pos: Vector3, rot: Vector3 = Vector3.ZERO) -> Array:
	return [_gear_mesh(r, teeth, hole), _xf(pos, rot)]


## 胴の丸みに沿って曲がった厚みのある板（前掛けなど）。楕円柱の一部。
## a0..a1: 正面(-Z)からの角度（ラジアン、キャラの右が +）、y0（下端）..y1（上端）、
## rx/rz: 上端の外側の半径、flare: 下端で半径に足す量、thick: 厚み。
func p_arc(rx: float, rz: float, a0: float, a1: float, y0: float, y1: float, thick: float, flare: float = 0.0, pos: Vector3 = Vector3.ZERO) -> Array:
	return [_arc_mesh(rx, rz, a0, a1, y0, y1, thick, flare), _xf(pos)]


static func _sph_mesh(r: float, seg: int = 14) -> Mesh:
	var key := "sph|%.4f|%d" % [r, seg]
	if not _meshes.has(key):
		var m := SphereMesh.new()
		m.radius = r
		m.height = r * 2.0
		m.radial_segments = seg
		m.rings = maxi(4, seg / 2)
		_meshes[key] = m
	return _meshes[key]


static func _hemi_mesh(r: float) -> Mesh:
	var key := "hemi|%.4f" % r
	if not _meshes.has(key):
		var m := SphereMesh.new()
		m.radius = r
		m.height = r
		m.is_hemisphere = true
		m.radial_segments = 16
		m.rings = 6
		_meshes[key] = m
	return _meshes[key]


static func _cyl_mesh(rb: float, rt: float, h: float, seg: int = 12) -> Mesh:
	var key := "cyl|%.4f|%.4f|%.4f|%d" % [rb, rt, h, seg]
	if not _meshes.has(key):
		var m := CylinderMesh.new()
		m.bottom_radius = rb
		m.top_radius = rt
		m.height = h
		m.radial_segments = seg
		m.rings = 1
		_meshes[key] = m
	return _meshes[key]


static func _box_mesh(size: Vector3) -> Mesh:
	var key := "box|%.4f|%.4f|%.4f" % [size.x, size.y, size.z]
	if not _meshes.has(key):
		var m := BoxMesh.new()
		m.size = size
		_meshes[key] = m
	return _meshes[key]


static func _cap_mesh(r: float, h: float) -> Mesh:
	var key := "cap|%.4f|%.4f" % [r, h]
	if not _meshes.has(key):
		var m := CapsuleMesh.new()
		m.radius = r
		m.height = h
		m.radial_segments = 12
		m.rings = 3
		_meshes[key] = m
	return _meshes[key]


static func _tor_mesh(inner: float, outer: float) -> Mesh:
	var key := "tor|%.4f|%.4f" % [inner, outer]
	if not _meshes.has(key):
		var m := TorusMesh.new()
		m.inner_radius = inner
		m.outer_radius = outer
		m.rings = 18
		m.ring_segments = 6
		_meshes[key] = m
	return _meshes[key]


static func _gear_mesh(r: float, teeth: int, hole: float) -> Mesh:
	var key := "gear|%.4f|%d|%.4f" % [r, teeth, hole]
	if _meshes.has(key):
		return _meshes[key]
	var outline := PackedVector2Array()
	var step := TAU / teeth
	var rr := r * 0.74
	for i in teeth:
		var a := step * i
		for f in [[-0.25, rr], [-0.14, r], [0.14, r], [0.25, rr], [0.5, rr]]:
			var ang: float = a + step * float(f[0])
			var rad: float = f[1]
			outline.append(Vector2(cos(ang), sin(ang)) * rad)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := outline.size()
	for i in n:
		var o0 := outline[i]
		var o1 := outline[(i + 1) % n]
		var h0 := o0.normalized() * hole
		var h1 := o1.normalized() * hole
		var a3 := Vector3(h0.x, h0.y, 0)
		var b3 := Vector3(o0.x, o0.y, 0)
		var c3 := Vector3(o1.x, o1.y, 0)
		var d3 := Vector3(h1.x, h1.y, 0)
		# 表（-Z 向き）と裏の両面
		_quad(st, a3, b3, c3, d3, Vector3(0, 0, -1))
		_quad(st, a3 + Vector3(0, 0, 0.001), b3 + Vector3(0, 0, 0.001), c3 + Vector3(0, 0, 0.001), d3 + Vector3(0, 0, 0.001), Vector3(0, 0, 1))
	var m := st.commit()
	_meshes[key] = m
	return m


static func _arc_mesh(rx: float, rz: float, a0: float, a1: float, y0: float, y1: float, thick: float, flare: float, seg: int = 10) -> Mesh:
	var key := "arc|%.4f|%.4f|%.4f|%.4f|%.4f|%.4f|%.4f|%.4f" % [rx, rz, a0, a1, y0, y1, thick, flare]
	if _meshes.has(key):
		return _meshes[key]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var cols := []  # 各列: [外下, 外上, 内下, 内上, 外向き法線]
	for i in seg + 1:
		var a := lerpf(a0, a1, float(i) / seg)
		var sa := sin(a)
		var ca := cos(a)
		var ob := Vector3(sa * (rx + flare), y0, -ca * (rz + flare))
		var ot := Vector3(sa * rx, y1, -ca * rz)
		var ib := Vector3(sa * (rx + flare - thick), y0, -ca * (rz + flare - thick))
		var it := Vector3(sa * (rx - thick), y1, -ca * (rz - thick))
		var nn := Vector3(sa / rx, 0, -ca / rz).normalized()
		cols.append([ob, ot, ib, it, nn])
	for i in seg:
		var c0: Array = cols[i]
		var c1: Array = cols[i + 1]
		var n0: Vector3 = c0[4]
		var n1: Vector3 = c1[4]
		var nm := (n0 + n1).normalized()
		_quad(st, c0[0], c1[0], c1[1], c0[1], nm)            # 外側
		_quad(st, c0[2], c1[2], c1[3], c0[3], -nm)           # 内側
		_quad(st, c0[1], c1[1], c1[3], c0[3], Vector3.UP)    # 上端
		_quad(st, c0[0], c1[0], c1[2], c0[2], Vector3.DOWN)  # 下端
	var first: Array = cols[0]
	var last: Array = cols[seg]
	var t0 := Vector3(-cos(a0), 0, -sin(a0))
	var t1 := Vector3(cos(a1), 0, sin(a1))
	_quad(st, first[0], first[1], first[3], first[2], t0)
	_quad(st, last[0], last[1], last[3], last[2], t1)
	var m := st.commit()
	_meshes[key] = m
	return m


## 四角形を三角形2枚で足す。法線 n の側から見て表になるよう向きをそろえる（Godot は時計回りが表）。
static func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3) -> void:
	_tri(st, a, b, c, n)
	_tri(st, a, c, d, n)


static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, n: Vector3) -> void:
	if (b - a).cross(c - a).dot(n) > 0.0:
		var tmp := b
		b = c
		c = tmp
	st.set_normal(n)
	st.add_vertex(a)
	st.set_normal(n)
	st.add_vertex(b)
	st.set_normal(n)
	st.add_vertex(c)
