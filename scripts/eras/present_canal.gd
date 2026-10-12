extends EraBase
## 2026年・なんば（仕様 §9 の 2〜9分・21〜25分 / §4.2 canal_01 段階C）。
## マツイ社長の構想図 → 水路沿いの IDO マーカーをスキャン → 1726年へ。
## 帰還後は旧水門跡（anchor canal_01_present）が「保存水門＋保守通路」に変わり、展示で記録を確かめる
## → マツイ社長の構想メモ更新 → 異次元拠点への光の扉。
## 状態はすべて TimelineState のフラグから再現する（ロード時に再計算しない／仕様 §4.3）。

const Art := preload("res://scripts/eras/present/present_art.gd")

const WATER_Y := -1.4
const CANAL_HALF := 4.0
const S_FRONT := 16.0       # 南側の店の正面（z）
const N_FRONT := -14.0      # 北側の店の正面（z）
const BRIDGE_X := -14.0
const IDO_POS := Vector3(12.0, 0.0, 5.2)
const MATSUI_DESK_POS := Vector3(-19.4, 0.0, 9.7)
const MATSUI_EXHIBIT_POS := Vector3(6.1, 0.0, 8.8)
const EXHIBIT_POS := Vector3(7.4, 0.0, 6.7)
const PORTAL_POS := Vector3(2.6, 1.6, 9.8)
const GEAR_POS := Vector3(10.2, 1.85, 5.05)
const PAWL_BASE := -50.8

const C_STONE := Color(0.7, 0.68, 0.64)
const C_RAIL := Color(0.77, 0.75, 0.71)
const C_WOOD_OLD := Color(0.42, 0.28, 0.17)
const C_STEEL := Color(0.4, 0.48, 0.56)
const C_COPPER := Color(0.8, 0.5, 0.26)
const C_NAVY := Color(0.1, 0.17, 0.38)
const C_WARM := Color(1.0, 0.86, 0.58)
const C_CONCRETE := Color(0.7, 0.68, 0.64)

## このプレイ中に一度だけ見せた演出（到着・帰還）。フラグに残さない一時的な記録。
static var _seen := {}

var matsui: Npc
var vs: VariantSwitch
var ido_root: Node3D
var ido_qr: MeshInstance3D
var ido_ring_mat: ShaderMaterial
var qr_mat: StandardMaterial3D
var exhibit: Node3D
var portal: Portal
var gate_gear: Node3D
var _pawl: Node3D
var _busy := false
var _gear_t := 0.0
var _ring_s := 0.0
var _matsui_noticed := false

# 一括描画（MultiMesh）。地物の大半はここへ積んで最後にまとめて出す
var _bx: Art.Batch      # 色つきの箱（陰影あり）
var _glow: Art.Batch    # 看板・明かり（陰影なし）
var _bld: Art.Batch     # ビルの外壁（窓つき）
var _far: Art.Batch     # 遠景のビル（影なし）
var _lant: Art.Batch    # 提灯・街灯の灯り
var _pole: Art.Batch    # 柱・ポール


func _init() -> void:
	era = TimelineState.ERA_PRESENT
	music_theme = "present"


## 水路の中（|z| < 4）だけ水面がある。落ちたら直前の安全地点へ戻る。
func water_level_at(pos: Vector3) -> float:
	if absf(pos.z) < CANAL_HALF:
		return WATER_Y
	return -INF


# ================================================================ ワールド

func _build_world() -> void:
	sun = LevelKit.environment(self, Color(0.2, 0.46, 0.95), Color(0.7, 0.85, 1.0), Color(0.36, 0.34, 0.32),
			Color(1.0, 0.96, 0.88), 1.3, Vector3(-60, 45, 0), 0.7, Color(0.74, 0.85, 1.0, 1.0))
	_tune_environment()
	_bx = Art.Batch.new(self, Art.unit_box(), Art.vc_mat())
	_glow = Art.Batch.new(self, Art.unit_box(), Art.vc_mat(true), false)
	_bld = Art.Batch.new(self, Art.unit_box(), Art.building_mat())
	_far = Art.Batch.new(self, Art.unit_box(), Art.building_mat(), false)
	_lant = Art.Batch.new(self, Art.unit_sphere(8), Art.vc_mat(true), false)
	_pole = Art.Batch.new(self, Art.unit_cyl(8), Art.vc_mat())

	_build_ground()
	_build_bridge()
	_build_rows()
	_build_street_props()
	_build_matsui_corner()
	_build_ido()
	_build_canal_01()
	_build_backdrop()
	_build_bounds()
	_build_crystals()
	for b in [_bx, _glow, _bld, _far, _lant, _pole]:
		(b as Art.Batch).flush()

	add_spawn("present_start", Vector3(-30, 0, 7), -90.0)
	add_spawn("default", Vector3(-30, 0, 7), -90.0)
	add_spawn("present_ido", Vector3(12, 0, 8.5), 0.0)
	add_spawn("present_portal", Vector3(5.0, 0, 11.6), -90.0)

	_build_npcs()
	_setup_story_state()
	# 動かない装飾を材質ごとに1つのメッシュへまとめる（Web版の描画負荷対策）
	LevelKit.merge_static(self)
	if Game.debug_args.has("stats"):
		_print_stats.call_deferred()


## 地面・護岸・水面・欄干。
func _build_ground() -> void:
	var pave := Art.tri_mat("paving", Art.paving_tex(), 2.0, Color(0.84, 0.8, 0.76))
	var masonry := Art.tri_mat("masonry", Art.masonry_tex(), 2.0)
	_tbox(self, Vector3(0, -0.5, 19.3), Vector3(170, 1.0, 29.4), pave)
	_tbox(self, Vector3(0, -0.5, -19.3), Vector3(170, 1.0, 29.4), pave)
	for sz in [-1.0, 1.0]:
		_tbox(self, Vector3(0, -1.5, 4.3 * sz), Vector3(170, 3.0, 0.6), masonry)
	# 水路の底（落ちても水面判定で戻る）
	LevelKit.box(self, Vector3(0, -3.1, 0), Vector3(170, 0.2, 8.0), Color(0.14, 0.22, 0.24))
	LevelKit.water(self, Vector3(0, WATER_Y, 0), Vector2(170, 8.0), Color(0.02, 0.17, 0.27), Color(0.08, 0.4, 0.48), Vector2(0.06, 0.0))
	# 欄干（橋と旧水門跡 canal_01 の区間は2状態の側で作る）
	for seg in [[-38.0, -16.8], [-11.2, 7.5], [31.0, 34.0]]:
		_railing(_bx, seg[0], seg[1], 4.3)
	for seg in [[-38.0, -16.8], [-11.2, 11.0], [13.0, 34.0]]:
		_railing(_bx, seg[0], seg[1], -4.3)
	# 点字ブロックの帯（日本の歩道らしさ）
	_bx.add(Vector3(-2, 0.008, 9.0), Vector3(72, 0.016, 0.3), Color(0.95, 0.78, 0.15))
	_bx.add(Vector3(-2, 0.008, -9.4), Vector3(72, 0.016, 0.3), Color(0.95, 0.78, 0.15))


## 石の欄干：太い親柱と笠石（参考：プレイイメージ02）。
func _railing(b: Art.Batch, x0: float, x1: float, z: float) -> void:
	var n := maxi(1, int(ceil((x1 - x0) / 2.1)))
	for i in n + 1:
		var x := lerpf(x0, x1, float(i) / n)
		b.add(Vector3(x, 0.52, z), Vector3(0.32, 1.04, 0.32), C_STONE)
	b.add(Vector3((x0 + x1) * 0.5, 1.1, z), Vector3(x1 - x0 + 0.34, 0.16, 0.38), C_RAIL)
	b.add(Vector3((x0 + x1) * 0.5, 0.36, z), Vector3(x1 - x0, 0.1, 0.18), C_STONE.darkened(0.12))
	b.collider(Vector3((x0 + x1) * 0.5, 0.62, z), Vector3(x1 - x0 + 0.34, 1.24, 0.38))


## x=-14 の石のアーチ橋（北岸へ渡れる）。
func _build_bridge() -> void:
	var bx := BRIDGE_X
	var masonry := Art.tri_mat("masonry_ds", Art.masonry_tex(), 2.0, Color(0.95, 0.93, 0.9), true)
	var arch := MeshInstance3D.new()
	arch.mesh = Art.arch_bridge_mesh(4.9, 6.2, 2.4, 0.55, 0.3, CANAL_HALF - 0.05, -1.55, -0.02)
	arch.material_override = masonry
	arch.position = Vector3(bx, 0, 0)
	add_child(arch)
	var pave := Color(0.74, 0.7, 0.64)
	var th := rad_to_deg(atan2(0.55, 3.8))
	var ramp_len := sqrt(3.8 * 3.8 + 0.55 * 0.55)
	var cy := 0.275 - 0.15 * cos(deg_to_rad(th))
	var cz := 4.3 - 0.15 * sin(deg_to_rad(th))
	# 路面（中央・南北の坂）
	_bx.add(Vector3(bx, 0.4, 0), Vector3(5.3, 0.3, 4.8), pave, Vector3.ZERO, true)
	_bx.add(Vector3(bx, cy, cz), Vector3(5.3, 0.3, ramp_len), pave, Vector3(th, 0, 0), true)
	_bx.add(Vector3(bx, cy, -cz), Vector3(5.3, 0.3, ramp_len), pave, Vector3(-th, 0, 0), true)
	# 高欄（坂に合わせて3つに分ける）
	for sx in [-1.0, 1.0]:
		var x: float = bx + 2.5 * sx
		_bx.add(Vector3(x, 0.55 + 0.45, 0), Vector3(0.34, 0.9, 4.8), C_STONE, Vector3.ZERO, true)
		var py := 0.275 + 0.45 * cos(deg_to_rad(th))
		var pz := 4.3 + 0.45 * sin(deg_to_rad(th))
		_bx.add(Vector3(x, py, pz), Vector3(0.34, 0.9, ramp_len), C_STONE, Vector3(th, 0, 0), true)
		_bx.add(Vector3(x, py, -pz), Vector3(0.34, 0.9, ramp_len), C_STONE, Vector3(-th, 0, 0), true)
		_bx.add(Vector3(x, 1.5, 0), Vector3(0.4, 0.08, 4.85), C_RAIL)
		for z in [-6.1, -2.4, 2.4, 6.1]:
			var top := 0.55 if absf(z) < 3.0 else 0.0
			_bx.add(Vector3(x, top + 0.6, z), Vector3(0.48, 1.2, 0.48), C_RAIL)
	_text("あさひばし", Vector3(bx - 2.5, 0.7, 6.36), 0.16, Color(0.2, 0.18, 0.15), Vector3.ZERO)
	_text("あさひばし", Vector3(bx + 2.5, 0.7, -6.36), 0.16, Color(0.2, 0.18, 0.15), Vector3(0, 180, 0))
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			_lamp(Vector3(bx + 3.05 * sx, 0, 6.6 * sz), 3.2)


# ---------------------------------------------------------------- 街並み

## 南北の店並み。看板は商標を使わず一般的な言葉だけ（たこ焼・串カツ・うどん・大阪 など）。
func _build_rows() -> void:
	var south := [
		[-44.0, -36.0, 12.0, Color(0.94, 0.87, 0.72), {"shop": "喫茶", "sc": Color(0.42, 0.24, 0.14), "v": "珈琲", "vc": Color(0.97, 0.94, 0.86), "vt": Color(0.4, 0.2, 0.1), "vx": 1}],
		[-36.0, -29.0, 15.0, Color(0.8, 0.4, 0.33), {"shop": "うどん", "sc": Color(0.12, 0.22, 0.5), "lant": true, "v": "手打ち", "vc": Color(0.97, 0.95, 0.9), "vt": Color(0.12, 0.2, 0.5)}],
		[-29.0, -22.0, 10.0, Color(0.95, 0.93, 0.88), {"shop": "おみやげ", "sc": Color(0.95, 0.5, 0.1), "b": "OSAKA", "bc": Color(1.0, 0.8, 0.12), "bt": Color(0.1, 0.16, 0.4), "by": 7.2, "bh": 2.4}],
		[-22.0, -14.0, 19.0, Color(0.38, 0.56, 0.74), {"shop": "串カツ", "sc": Color(0.85, 0.12, 0.1), "lant": true, "v": "串カツ", "vc": Color(1.0, 0.84, 0.15), "vt": Color(0.75, 0.08, 0.05), "b": "大阪名物", "bc": Color(0.9, 0.15, 0.12), "by": 13.5, "bh": 3.0}],
		[-14.0, -6.0, 12.0, Color(0.98, 0.82, 0.5), {"shop": "甘味処", "sc": Color(0.24, 0.5, 0.28), "lant": true, "v": "ぜんざい", "vc": Color(0.95, 0.4, 0.55), "vt": Color.WHITE, "vx": 1}],
		[-6.0, 2.0, 21.0, Color(0.84, 0.86, 0.9), {"shop": "雑貨", "sc": Color(0.55, 0.2, 0.6), "screen": "NAMBA", "by": 13.0, "bh": 6.0}],
		[2.0, 9.0, 13.0, Color(0.55, 0.76, 0.62), {"shop": "ラーメン", "sc": Color(0.95, 0.55, 0.08), "v": "ラーメン", "vc": Color(0.88, 0.1, 0.1), "vt": Color.WHITE}],
		[9.0, 16.0, 10.0, Color(0.93, 0.68, 0.55), {"shop": "お好み焼", "sc": Color(0.18, 0.18, 0.22), "st": Color(1.0, 0.82, 0.25), "lant": true}],
		[16.0, 24.0, 16.0, Color(0.54, 0.47, 0.7), {"shop": "焼肉", "sc": Color(0.14, 0.12, 0.14), "st": Color(1.0, 0.75, 0.2), "v": "なにわ", "vc": Color(0.96, 0.3, 0.55), "vt": Color.WHITE, "vx": 1}],
		[24.0, 34.0, 12.0, Color(0.96, 0.91, 0.8), {"shop": "寿司", "sc": Color(0.1, 0.3, 0.52), "lant": true, "b": "うまいもん横丁", "bc": Color(0.92, 0.25, 0.18), "by": 8.2, "bh": 2.2}],
		[34.0, 42.0, 17.0, Color(0.7, 0.73, 0.8), {"v": "大阪", "vc": Color(0.9, 0.12, 0.1), "vt": Color.WHITE}],
	]
	var north := [
		[-44.0, -34.0, 16.0, Color(0.93, 0.92, 0.89), {"bv": "大阪", "bc": Color(0.88, 0.1, 0.1), "bt": Color.WHITE, "by": 9.5, "bh": 8.0}],
		[-34.0, -26.0, 12.0, Color(0.82, 0.42, 0.36), {"shop": "酒場", "sc": Color(0.15, 0.15, 0.18), "st": Color(1.0, 0.85, 0.3), "lant": true, "b": "串カツ", "bc": Color(1.0, 0.85, 0.18), "bt": Color(0.75, 0.1, 0.05), "by": 7.6, "bh": 2.6}],
		[-26.0, -18.0, 23.0, Color(0.3, 0.45, 0.72), {"shop": "案内所", "sc": Color(0.1, 0.4, 0.75), "b": "なんば", "bsub": "NAMBA", "bc": Color(0.1, 0.28, 0.72), "bt": Color.WHITE, "by": 15.0, "bh": 5.0}],
		[-18.0, -10.0, 14.0, Color(0.96, 0.85, 0.62), {"shop": "おみやげ", "sc": Color(0.8, 0.2, 0.15), "v": "たこ焼", "vc": Color(0.9, 0.12, 0.1), "vt": Color.WHITE, "vx": 1}],
		[-10.0, -2.0, 18.0, Color(0.86, 0.88, 0.92), {"shop": "食堂", "sc": Color(0.2, 0.45, 0.25), "lant": true, "b": "お好み焼", "bc": Color(0.98, 0.55, 0.12), "bt": Color.WHITE, "by": 11.0, "bh": 3.6}],
		[-2.0, 6.0, 11.0, Color(0.74, 0.57, 0.42), {"shop": "うどん", "sc": Color(0.95, 0.92, 0.85), "st": Color(0.15, 0.2, 0.45), "lant": true, "v": "天ぷら", "vc": Color(0.12, 0.22, 0.5), "vt": Color.WHITE}],
		[6.0, 14.0, 25.0, Color(0.92, 0.92, 0.95), {"shop": "劇場", "sc": Color(0.6, 0.1, 0.15), "screen": "OSAKA", "by": 15.5, "bh": 7.0, "v": "演芸場", "vc": Color(0.98, 0.85, 0.2), "vt": Color(0.6, 0.08, 0.1), "vx": 1, "vy": 7.6}],
		[14.0, 22.0, 13.0, Color(0.98, 0.72, 0.34), {"shop": "たこ焼", "sc": Color(0.85, 0.12, 0.1), "lant": true, "b": "たこ焼", "bc": Color(0.95, 0.16, 0.12), "bt": Color(1.0, 0.92, 0.3), "by": 8.4, "bh": 2.6, "octo": true}],
		[22.0, 34.0, 17.0, Color(0.46, 0.63, 0.57), {"shop": "喫茶", "sc": Color(0.42, 0.24, 0.14), "bv": "水の都", "bc": Color(0.1, 0.45, 0.82), "bt": Color.WHITE, "by": 10.5, "bh": 7.0}],
		[34.0, 44.0, 14.0, Color(0.9, 0.86, 0.8), {"v": "なんば", "vc": Color(0.15, 0.35, 0.8), "vt": Color.WHITE}],
	]
	for r in south:
		_building(r[0], r[1], r[2], r[3], false, r[4])
	for r in north:
		_building(r[0], r[1], r[2], r[3], true, r[4])


## 1棟ぶん：外壁・1階の店先・日よけ・店の看板・提灯・壁面の大看板・突き出しの縦看板。
func _building(x0: float, x1: float, h: float, wall: Color, north: bool, d: Dictionary) -> void:
	var w := x1 - x0
	var cx := (x0 + x1) * 0.5
	var fz := N_FRONT if north else S_FRONT
	var s := 1.0 if north else -1.0       # 正面（水路側）の向き
	var face := Vector3(0, 0 if north else 180, 0)
	_bld.add(Vector3(cx, h * 0.5, fz - s * 6.0), Vector3(w, h, 12.0), wall, Vector3.ZERO, true)
	# 屋上の設備で輪郭に変化をつける
	if int(absf(x0)) % 3 != 1:
		_bx.add(Vector3(cx + w * 0.18, h + 0.6, fz - s * 7.0), Vector3(w * 0.35, 1.2, 3.0), wall.darkened(0.25))
	# 1階：店先（暗い枠・ガラス越しの店内の明かり・格子・入口）
	_bx.add(Vector3(cx, 1.6, fz + s * 0.06), Vector3(w - 0.5, 3.2, 0.12), Color(0.2, 0.17, 0.15))
	_glow.add(Vector3(cx, 1.3, fz + s * 0.13), Vector3(w - 1.5, 2.0, 0.02), Color(0.86, 0.62, 0.36))
	_glow.add(Vector3(cx, 2.05, fz + s * 0.14), Vector3(w - 1.5, 0.5, 0.02), Color(1.0, 0.88, 0.62))
	var nm := maxi(2, int((w - 1.5) / 1.4))
	for i in nm + 1:
		var mx := cx - (w - 1.5) * 0.5 + (w - 1.5) * float(i) / nm
		_bx.add(Vector3(mx, 1.3, fz + s * 0.16), Vector3(0.08, 2.0, 0.04), Color(0.16, 0.13, 0.11))
	_bx.add(Vector3(cx, 0.15, fz + s * 0.16), Vector3(w - 1.4, 0.3, 0.05), Color(0.3, 0.26, 0.22))
	_bx.add(Vector3(cx + w * 0.22, 1.05, fz + s * 0.17), Vector3(1.0, 2.1, 0.04), Color(0.26, 0.2, 0.16))
	if d.has("shop"):
		var sc: Color = d.get("sc", Color(0.8, 0.2, 0.15))
		var st: Color = d.get("st", Color.WHITE)
		_bx.add(Vector3(cx, 3.15, fz + s * 0.75), Vector3(w - 0.6, 0.1, 1.5), sc.lightened(0.1), Vector3(12.0 * s, 0, 0))
		var sw := minf(w - 1.2, 5.6)
		_bx.add(Vector3(cx, 4.05, fz + s * 0.06), Vector3(sw + 0.2, 1.25, 0.12), Color(0.12, 0.1, 0.1))
		_glow.add(Vector3(cx, 4.05, fz + s * 0.15), Vector3(sw, 1.05, 0.12), sc)
		_text(str(d["shop"]), Vector3(cx, 4.05, fz + s * 0.23), 0.72, st, face)
	if d.get("lant", false):
		var n := int((w - 1.4) / 0.85)
		for i in n + 1:
			var x := x0 + 0.7 + (w - 1.4) * float(i) / maxf(1.0, n)
			var red := i % 2 == 0
			_lant.add(Vector3(x, 2.6, fz + s * 1.35), Vector3(0.36, 0.48, 0.36), Color(0.96, 0.22, 0.14) if red else Color(1.0, 0.95, 0.84))
	# 壁面の大看板（横）
	if d.has("b"):
		var bc: Color = d.get("bc", Color.RED)
		var bt: Color = d.get("bt", Color.WHITE)
		var by: float = d.get("by", h * 0.6)
		var bh: float = d.get("bh", 3.0)
		var bw := w * 0.82
		_bx.add(Vector3(cx, by, fz + s * 0.1), Vector3(bw + 0.3, bh + 0.3, 0.16), Color(0.15, 0.13, 0.12))
		_glow.add(Vector3(cx, by, fz + s * 0.2), Vector3(bw, bh, 0.12), bc)
		var txt := str(d["b"])
		var th := minf(bh * 0.62, bw / maxf(2.0, txt.length() * 0.95))
		if d.has("bsub"):
			_text(txt, Vector3(cx, by + bh * 0.12, fz + s * 0.28), th * 0.85, bt, face)
			_text(str(d["bsub"]), Vector3(cx, by - bh * 0.3, fz + s * 0.28), th * 0.32, bt, face)
		else:
			_text(txt, Vector3(cx, by, fz + s * 0.28), th, bt, face)
		if d.get("octo", false):
			_octopus(Vector3(x1 - 1.2, by + bh * 0.5 + 0.9, fz + s * 0.9), 0.9)
	# 壁面の大看板（縦）
	if d.has("bv"):
		var bc2: Color = d.get("bc", Color.RED)
		var bt2: Color = d.get("bt", Color.WHITE)
		var by2: float = d.get("by", h * 0.6)
		var bh2: float = d.get("bh", 6.0)
		var txt2 := str(d["bv"])
		var bw2 := 2.6
		var bx2 := x0 + 1.9
		_bx.add(Vector3(bx2, by2, fz + s * 0.1), Vector3(bw2 + 0.3, bh2 + 0.3, 0.16), Color(0.95, 0.95, 0.93))
		_glow.add(Vector3(bx2, by2, fz + s * 0.2), Vector3(bw2, bh2, 0.12), bc2)
		_vtext(txt2, Vector3(bx2, by2, fz + s * 0.28), minf(1.9, bh2 / (txt2.length() + 0.6)), bt2, face)
	# 大型ビジョン
	if d.has("screen"):
		var by3: float = d.get("by", h * 0.6)
		var bh3: float = d.get("bh", 5.0)
		var sw3 := w * 0.8
		_bx.add(Vector3(cx, by3, fz + s * 0.12), Vector3(sw3 + 0.4, bh3 + 0.4, 0.2), Color(0.12, 0.12, 0.14))
		var qm := QuadMesh.new()
		qm.size = Vector2(sw3, bh3)
		var scr := LevelKit.mesh(self, qm, Vector3(cx, by3, fz + s * 0.24), Art.screen_mat(), face)
		scr.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var stxt := str(d["screen"])
		_text(stxt, Vector3(cx, by3, fz + s * 0.28), minf(bh3 * 0.34, sw3 / (stxt.length() * 0.78)), Color.WHITE, face)
	# 突き出しの縦看板：通りを西からも東からも読めるよう両面に文字
	if d.has("v"):
		var vc: Color = d.get("vc", Color.RED)
		var vt: Color = d.get("vt", Color.WHITE)
		var txt3 := str(d["v"])
		var vh := txt3.length() * 0.95 + 0.7
		var vx := (x1 - 0.8) if int(d.get("vx", 0)) == 1 else (x0 + 0.8)
		var vy := maxf(minf(h * 0.55, h - vh * 0.5 - 0.6), 5.0 + vh * 0.5)
		if d.has("vy"):
			vy = float(d["vy"])
		var vz := fz + s * 1.0
		_bx.add(Vector3(vx, vy, vz), Vector3(0.18, vh + 0.24, 1.42), Color(0.14, 0.12, 0.12))
		_glow.add(Vector3(vx, vy, vz), Vector3(0.26, vh, 1.28), vc)
		_bx.add(Vector3(vx, vy, fz + s * 0.15), Vector3(0.12, vh * 0.8, 0.3), Color(0.3, 0.3, 0.32))
		_vtext(txt3, Vector3(vx + 0.14, vy, vz), 0.8, vt, Vector3(0, 90, 0))
		_vtext(txt3, Vector3(vx - 0.14, vy, vz), 0.8, vt, Vector3(0, -90, 0))


## たこ焼屋の看板のタコ（簡易形状）。
func _octopus(p: Vector3, s: float) -> void:
	var red := Color(0.95, 0.3, 0.25)
	LevelKit.sphere(self, p, 0.75 * s, red, Vector3(1.0, 1.1, 0.95), 12)
	for sx in [-1.0, 1.0]:
		LevelKit.sphere(self, p + Vector3(0.26 * sx, -0.05, 0.62) * s, 0.2 * s, Color.WHITE, Vector3.ONE, 8)
		LevelKit.sphere(self, p + Vector3(0.26 * sx, -0.05, 0.78) * s, 0.09 * s, Color(0.08, 0.06, 0.06), Vector3.ONE, 6)
	LevelKit.sphere(self, p + Vector3(0, -0.36, 0.66) * s, 0.13 * s, red.darkened(0.2), Vector3(1.0, 0.8, 1.2), 8)
	var band := LevelKit.cyl(self, p + Vector3(0, 0.22, 0) * s, 0.78 * s, 0.16 * s, Color.WHITE, false, Vector3.ZERO, 14)
	band.scale = Vector3(1.0, 1.0, 0.98)
	for i in 4:
		var a := -0.9 + i * 0.6
		LevelKit.sphere(self, p + Vector3(sin(a) * 0.6, -0.75, cos(a) * 0.45) * s, 0.22 * s, red, Vector3(1.0, 0.7, 1.3), 8)


## 歩道の小物：街灯・植え込み・ベンチ・たこ焼の屋台・自販機・木箱・のぼり旗。
func _build_street_props() -> void:
	for x in [-34.0, -26.0, -20.0, -6.0, 2.0, 20.0, 26.0]:
		_lamp(Vector3(x, 0, 5.4))
	for x in [-34.0, -26.0, -6.0, 2.0, 8.0, 20.0, 28.0]:
		_lamp(Vector3(x, 0, -5.4))
	# 植え込みと木
	for p in [Vector3(-26.5, 0, 12.4), Vector3(-1.5, 0, 12.6), Vector3(21.0, 0, 12.2), Vector3(-29.0, 0, -10.0), Vector3(-4.0, 0, -10.2), Vector3(19.5, 0, -10.0)]:
		var pos: Vector3 = p
		_bx.add(pos + Vector3(0, 0.28, 0), Vector3(1.7, 0.56, 1.7), Color(0.62, 0.6, 0.56), Vector3.ZERO, true)
		_bx.add(pos + Vector3(0, 0.58, 0), Vector3(1.5, 0.06, 1.5), Color(0.32, 0.24, 0.16))
		for i in 5:
			var a := TAU * i / 5.0
			_lant.add(pos + Vector3(cos(a) * 0.5, 0.66, sin(a) * 0.5), Vector3(0.26, 0.2, 0.26), [Color(1.0, 0.4, 0.55), Color(1.0, 0.85, 0.25), Color(0.95, 0.95, 1.0)][i % 3])
		LevelKit.tree(self, pos + Vector3(0, 0.5, 0), 1.15)
	# ベンチ（水路を向く）
	for b in [[Vector3(-9.0, 0, 6.6), 1.0], [Vector3(24.0, 0, 7.0), 1.0], [Vector3(-21.0, 0, -6.6), -1.0], [Vector3(3.0, 0, -6.6), -1.0]]:
		var bp: Vector3 = b[0]
		var bs: float = b[1]
		_bx.add(bp + Vector3(0, 0.45, 0), Vector3(1.9, 0.08, 0.5), Color(0.62, 0.42, 0.26), Vector3.ZERO, false)
		_bx.add(bp + Vector3(0, 0.78, 0.24 * bs), Vector3(1.9, 0.4, 0.06), Color(0.62, 0.42, 0.26))
		for sx in [-0.8, 0.8]:
			_bx.add(bp + Vector3(sx, 0.22, 0), Vector3(0.08, 0.44, 0.46), Color(0.25, 0.27, 0.3))
		_bx.collider(bp + Vector3(0, 0.45, 0), Vector3(1.9, 0.9, 0.6))
	# たこ焼の屋台
	var tk := Vector3(-6.0, 0, 13.3)
	_bx.add(tk + Vector3(0, 1.1, 0.75), Vector3(2.8, 2.2, 0.12), Color(0.55, 0.36, 0.22))
	_bx.add(tk + Vector3(0, 0.5, -0.45), Vector3(2.8, 1.0, 0.6), Color(0.62, 0.42, 0.26), Vector3.ZERO, true)
	_bx.add(tk + Vector3(0, 1.03, -0.45), Vector3(2.9, 0.06, 0.7), Color(0.9, 0.88, 0.84))
	for sx in [-1.35, 1.35]:
		_bx.add(tk + Vector3(sx, 1.25, 0.15), Vector3(0.1, 2.5, 0.1), Color(0.5, 0.33, 0.2))
	_bx.add(tk + Vector3(0, 2.55, -0.1), Vector3(3.2, 0.12, 2.0), Color(0.92, 0.18, 0.14), Vector3(-10, 0, 0))
	_glow.add(tk + Vector3(0, 2.95, -0.9), Vector3(2.4, 0.7, 0.1), Color(1.0, 0.92, 0.3))
	_text("たこ焼き", tk + Vector3(0, 2.95, -0.96), 0.5, Color(0.8, 0.1, 0.05), Vector3(0, 180, 0))
	for i in 5:
		_lant.add(tk + Vector3(-1.2 + i * 0.6, 2.2, -1.05), Vector3(0.3, 0.4, 0.3), Color(0.96, 0.22, 0.14))
	_octopus(tk + Vector3(0.9, 3.8, -0.5), 0.55)
	# 自販機
	_bx.add(Vector3(-12.0, 0.9, 15.4), Vector3(0.9, 1.8, 0.7), Color(0.85, 0.15, 0.15), Vector3.ZERO, true)
	_glow.add(Vector3(-12.0, 1.15, 15.04), Vector3(0.72, 0.8, 0.02), Color(0.85, 0.95, 1.0))
	_bx.add(Vector3(-10.9, 0.9, 15.4), Vector3(0.9, 1.8, 0.7), Color(0.15, 0.4, 0.8), Vector3.ZERO, true)
	_glow.add(Vector3(-10.9, 1.15, 15.04), Vector3(0.72, 0.8, 0.02), Color(1.0, 0.95, 0.8))
	# 木箱（登ると上に結晶）
	for c in [[Vector3(4.6, 0.45, 14.7), 0.9], [Vector3(5.55, 0.4, 14.5), 0.8], [Vector3(5.05, 1.35, 14.6), 0.9]]:
		var cp: Vector3 = c[0]
		var cs: float = c[1]
		_bx.add(cp, Vector3.ONE * cs, Color(0.7, 0.5, 0.3), Vector3(0, 8, 0), true)
	# のぼり旗
	for f in [[Vector3(-31.0, 0, 15.0), Color(0.95, 0.3, 0.2)], [Vector3(-17.0, 0, 15.1), Color(1.0, 0.8, 0.15)], [Vector3(9.6, 0, 15.1), Color(0.2, 0.6, 0.9)], [Vector3(-23.0, 0, -13.0), Color(0.95, 0.4, 0.6)], [Vector3(17.0, 0, -13.0), Color(1.0, 0.82, 0.2)]]:
		var fp: Vector3 = f[0]
		var fc: Color = f[1]
		_pole.add(fp + Vector3(0, 1.4, 0), Vector3(0.05, 2.8, 0.05), Color(0.85, 0.85, 0.88))
		_glow.add(fp + Vector3(0.0, 1.75, 0.0), Vector3(0.5, 1.7, 0.03), fc)


func _lamp(pos: Vector3, h: float = 3.6) -> void:
	var c := Color(0.16, 0.24, 0.22)
	_pole.add(pos + Vector3(0, h * 0.5, 0), Vector3(0.14, h, 0.14), c)
	_pole.add(pos + Vector3(0, 0.18, 0), Vector3(0.34, 0.36, 0.34), c)
	_lant.add(pos + Vector3(0, h + 0.22, 0), Vector3(0.46, 0.54, 0.46), Color(1.0, 0.95, 0.8))
	_pole.add(pos + Vector3(0, h + 0.52, 0), Vector3(0.32, 0.08, 0.32), c)
	_bx.collider(pos + Vector3(0, 1.0, 0), Vector3(0.3, 2.0, 0.3))


# ---------------------------------------------------------------- マツイ社長の机（構想図）

func _build_matsui_corner() -> void:
	var c := Vector3(-18.3, 0, 11.2)
	# 白いテントと青い垂れ幕
	for dx in [-2.6, 2.6]:
		for dz in [-1.35, 1.35]:
			_pole.add(c + Vector3(dx, 1.3, dz), Vector3(0.07, 2.6, 0.07), Color(0.75, 0.77, 0.8))
	_bx.add(c + Vector3(0, 2.66, 0), Vector3(5.4, 0.12, 2.9), Color(0.97, 0.97, 0.98))
	_bx.add(c + Vector3(0, 2.46, -1.45), Vector3(5.4, 0.3, 0.04), Color(0.16, 0.46, 0.86))
	_bx.add(c + Vector3(-2.7, 2.46, 0), Vector3(0.04, 0.3, 2.9), Color(0.16, 0.46, 0.86))
	_bx.add(c + Vector3(2.7, 2.46, 0), Vector3(0.04, 0.3, 2.9), Color(0.16, 0.46, 0.86))
	# 机（前面の布）・椅子
	var dk := Vector3(-19.3, 0, 11.3)
	_bx.add(dk + Vector3(0, 0.76, 0), Vector3(1.8, 0.06, 0.8), Color(0.95, 0.95, 0.93))
	_bx.add(dk + Vector3(0, 0.44, -0.39), Vector3(1.8, 0.62, 0.03), C_NAVY)
	_bx.collider(dk + Vector3(0, 0.4, 0), Vector3(1.8, 0.8, 0.8))
	_text("ロボット構想スケッチ", dk + Vector3(0, 0.5, -0.415), 0.1, Color.WHITE, Vector3(0, 180, 0))
	_bx.add(dk + Vector3(0.2, 0.45, 0.85), Vector3(0.46, 0.06, 0.46), Color(0.25, 0.27, 0.3))
	_bx.add(dk + Vector3(0.2, 0.75, 1.06), Vector3(0.46, 0.5, 0.05), Color(0.25, 0.27, 0.3))
	# ノートPC・紙・カップ
	_bx.add(dk + Vector3(0.35, 0.8, 0.1), Vector3(0.42, 0.02, 0.3), Color(0.72, 0.74, 0.78))
	_bx.add(dk + Vector3(0.35, 0.93, 0.26), Vector3(0.42, 0.27, 0.02), Color(0.72, 0.74, 0.78), Vector3(14, 0, 0))
	_bx.add(dk + Vector3(-0.35, 0.795, -0.05), Vector3(0.3, 0.01, 0.42), Color(0.98, 0.98, 1.0), Vector3(0, 12, 0))
	_bx.add(dk + Vector3(-0.55, 0.8, 0.12), Vector3(0.3, 0.01, 0.42), Color(0.92, 0.95, 1.0), Vector3(0, -20, 0))
	LevelKit.cyl(self, dk + Vector3(-0.1, 0.84, 0.2), 0.045, 0.1, Color(0.95, 0.95, 0.95), false, Vector3.ZERO, 8)
	# 小さなネクマックスの模型（まだ作られていない「構想」の試作）
	var fg := dk + Vector3(0.75, 0.79, -0.15)
	LevelKit.sphere(self, fg + Vector3(0, 0.09, 0), 0.055, NexmaxModel.BLUE, Vector3.ONE, 8)
	LevelKit.sphere(self, fg + Vector3(0, 0.21, 0), 0.085, NexmaxModel.BLUE, Vector3(1, 0.94, 0.96), 10)
	LevelKit.sphere(self, fg + Vector3(0, 0.205, -0.045), 0.066, NexmaxModel.WHITE, Vector3(1, 1.05, 0.6), 10)
	for sx in [-1.0, 1.0]:
		LevelKit.sphere(self, fg + Vector3(0.032 * sx, 0.025, -0.01), 0.032, NexmaxModel.BLUE_DARK, Vector3(1, 0.7, 1.3), 6)
	# 構想図の画板（イーゼル）：到着した側（北西）へ向ける
	var ea := Node3D.new()
	ea.name = "Blueprint"
	ea.position = Vector3(-14.9, 0, 10.6)
	ea.rotation_degrees.y = -118.0
	ea.scale = Vector3.ONE * 1.3
	add_child(ea)
	var wood := Color(0.5, 0.34, 0.2)
	for sx in [-0.62, 0.62]:
		LevelKit.box(ea, Vector3(sx, 0.95, 0.02), Vector3(0.05, 1.9, 0.05), wood, false, Vector3(6, 0, 0))
	LevelKit.box(ea, Vector3(0, 0.9, -0.38), Vector3(0.05, 1.85, 0.05), wood, false, Vector3(-20, 0, 0))
	LevelKit.box(ea, Vector3(0, 0.76, 0.1), Vector3(1.55, 0.05, 0.14), wood, false)
	LevelKit.box(ea, Vector3(0, 1.36, 0.05), Vector3(1.64, 1.16, 0.05), Color(0.2, 0.16, 0.12), false)
	var qm := QuadMesh.new()
	qm.size = Vector2(1.52, 1.045)
	LevelKit.mesh(ea, qm, Vector3(0, 1.36, 0.08), Art.tex_mat("blueprint", Art.blueprint_tex(), false, 0.15))
	LevelKit.box(ea, Vector3(0, 2.06, 0.05), Vector3(0.95, 0.2, 0.03), Color(0.97, 0.97, 0.95), false)
	_text("NEXMAX 構想図", Vector3(0, 2.06, 0.07), 0.11, C_NAVY, Vector3.ZERO, ea)
	_bx.collider(Vector3(-14.9, 1.0, 10.6), Vector3(1.2, 2.0, 1.2))


# ---------------------------------------------------------------- IDO マーカー（canal_01）

func _build_ido() -> void:
	var gran := Art.tri_mat("granite", Art.granite_tex(), 0.8)
	ido_root = Node3D.new()
	ido_root.name = "IDO"
	ido_root.position = IDO_POS
	add_child(ido_root)
	_tbox(ido_root, Vector3(0, 0.09, 0), Vector3(1.32, 0.18, 0.95), gran)
	_tbox(ido_root, Vector3(0, 0.8, 0), Vector3(0.95, 1.25, 0.55), gran)
	_tbox(ido_root, Vector3(0, 1.47, 0), Vector3(1.04, 0.1, 0.64), gran, false)
	# 銅板（QR・IDO の文字）。少し上向きに傾ける
	var plate := Node3D.new()
	plate.position = Vector3(0, 0.86, 0.34)
	plate.rotation_degrees.x = -10.0
	ido_root.add_child(plate)
	var pb := BoxMesh.new()
	pb.size = Vector3(0.8, 0.94, 0.05)
	LevelKit.mesh(plate, pb, Vector3.ZERO, LevelKit.mat(Color(0.62, 0.43, 0.22), 0.0, 0.45, 0.55))
	var qm := QuadMesh.new()
	qm.size = Vector2(0.46, 0.46)
	qr_mat = Art.tex_mat("qr", Art.qr_tex(), true, 0.35)
	ido_qr = LevelKit.mesh(plate, qm, Vector3(0, 0.07, 0.028), qr_mat)
	ido_qr.add_to_group("dynamic")
	# 読み取り枠（四隅の光）
	var cyan := LevelKit.mat(Color(0.35, 0.95, 1.0), 2.2, 0.4)
	var bh := BoxMesh.new()
	bh.size = Vector3(0.12, 0.024, 0.01)
	var bv := BoxMesh.new()
	bv.size = Vector3(0.024, 0.12, 0.01)
	for sx in [-1.0, 1.0]:
		for sy in [-1.0, 1.0]:
			var corner := Vector3(0.275 * sx, 0.07 + 0.275 * sy, 0.032)
			LevelKit.mesh(plate, bh, corner - Vector3(0.048 * sx, 0, 0), cyan)
			LevelKit.mesh(plate, bv, corner - Vector3(0, 0.048 * sy, 0), cyan)
	_text("IDO", Vector3(0, -0.33, 0.03), 0.15, Color(0.16, 0.1, 0.05), Vector3.ZERO, plate)
	_text("歴史・文化の記録案内", Vector3(0, 0.375, 0.03), 0.055, Color(0.2, 0.13, 0.06), Vector3.ZERO, plate)
	# 反応範囲（近づくと柔らかく光る／仕様 §3.2）
	ido_ring_mat = Art.ring_mat(Color(0.4, 0.95, 1.0))
	var rq := QuadMesh.new()
	rq.size = Vector2(4.4, 4.4)
	var ring := LevelKit.mesh(self, rq, Vector3(12, 0.035, 6.7), ido_ring_mat, Vector3(-90, 0, 0))
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# のぼり旗「歴史案内」：遠くからでも目印になる
	_pole.add(Vector3(13.45, 1.8, 5.95), Vector3(0.06, 3.6, 0.06), Color(0.85, 0.85, 0.88))
	_pole.add(Vector3(13.78, 3.5, 5.95), Vector3(0.04, 0.7, 0.04), Color(0.85, 0.85, 0.88), Vector3(0, 0, 90))
	_glow.add(Vector3(13.78, 2.25, 5.95), Vector3(0.62, 2.45, 0.03), Color(0.1, 0.55, 0.92))
	_vtext("歴史案内", Vector3(13.78, 2.1, 5.975), 0.4, Color.WHITE, Vector3.ZERO)
	_text("IDO", Vector3(13.78, 3.22, 5.975), 0.18, Color(1.0, 0.9, 0.35), Vector3.ZERO)
	_vtext("歴史案内", Vector3(13.78, 2.1, 5.925), 0.4, Color.WHITE, Vector3(0, 180, 0))
	Interactable.create(self, Vector3(12, 0, 6.1), "IDOをスキャン", _on_ido, 2.6, 2.1)
	targets["ido"] = ido_root


# ---------------------------------------------------------------- 旧水門跡 canal_01（2状態）

func _build_canal_01() -> void:
	vs = VariantSwitch.new()
	vs.name = "canal_01_present"
	vs.anchor_id = "canal_01_present"
	add_child(vs)
	_build_variant_a(vs.add_variant("A"))
	_build_variant_b(vs.add_variant("B"))
	vs.set_variant("B" if TimelineState.gate_repaired else "A")


## 変更前：コンクリートの護岸と「記録なし」の小さな案内板だけ。
func _build_variant_a(root: Node3D) -> void:
	var bb := Art.Batch.new(root, Art.unit_box(), Art.vc_mat())
	bb.add(Vector3(12.0, 0.5, 4.3), Vector3(9.0, 1.0, 0.44), C_CONCRETE, Vector3.ZERO, true)
	bb.add(Vector3(12.0, 1.04, 4.3), Vector3(9.1, 0.08, 0.5), C_CONCRETE.lightened(0.12))
	for i in 4:
		bb.add(Vector3(8.6 + i * 2.3, 0.5, 4.075), Vector3(0.03, 0.98, 0.02), C_CONCRETE.darkened(0.25))
	_railing(bb, 16.5, 31.0, 4.3)
	_railing(bb, 11.0, 13.0, -4.3)
	bb.add(Vector3(8.6, 0.55, 5.0), Vector3(0.08, 1.1, 0.08), Color(0.5, 0.5, 0.52))
	bb.add(Vector3(8.6, 1.2, 5.03), Vector3(0.98, 0.4, 0.04), Color(0.92, 0.92, 0.9))
	bb.flush()
	_text("旧水門跡（記録なし）", Vector3(8.6, 1.2, 5.06), 0.075, Color(0.22, 0.22, 0.25), Vector3.ZERO, root)
	Interactable.create(root, Vector3(8.6, 0, 5.6), "調べる", _on_old_sign, 1.8, 1.8)


## 変更後：保存された木の水門柱・歯止め式の保守水門・絵図の展示・保守通路（仕様 §4.2 段階C / プレイイメージ09）。
func _build_variant_b(root: Node3D) -> void:
	var bb := Art.Batch.new(root, Art.unit_box(), Art.vc_mat())
	var bg := Art.Batch.new(root, Art.unit_box(), Art.vc_mat(true), false)
	var bl := Art.Batch.new(root, Art.unit_sphere(8), Art.vc_mat(true), false)
	for seg in [[7.5, 11.55], [12.45, 13.6], [15.0, 28.4], [29.8, 31.0]]:
		_railing(bb, seg[0], seg[1], 4.3)
	for seg in [[11.0, 11.6], [12.4, 13.0]]:
		_railing(bb, seg[0], seg[1], -4.3)

	# 享保の水門柱（保存）と梁・笠木
	for sz in [-1.0, 1.0]:
		bb.add(Vector3(12, 0.7, 4.35 * sz), Vector3(0.62, 7.4, 0.62), C_WOOD_OLD, Vector3.ZERO, true)
		for y in [0.9, 3.0]:
			bb.add(Vector3(12, y, 4.35 * sz), Vector3(0.68, 0.12, 0.68), Color(0.66, 0.46, 0.22))
		bb.add(Vector3(12, 1.6, 3.95 * sz), Vector3(0.5, 6.0, 0.18), C_STEEL.darkened(0.25))
	bb.add(Vector3(12, 4.15, 0), Vector3(0.72, 0.56, 9.6), C_WOOD_OLD.darkened(0.08))
	bb.add(Vector3(12, 4.52, 0), Vector3(1.0, 0.18, 10.3), C_WOOD_OLD.darkened(0.3))
	bb.add(Vector3(12, 4.65, 0), Vector3(0.62, 0.08, 10.1), Color(0.36, 0.6, 0.52))
	bb.add(Vector3(12, 4.72, 2.4), Vector3(0.8, 0.5, 0.8), C_STEEL.darkened(0.1))
	bb.add(Vector3(12, 4.72, -2.4), Vector3(0.8, 0.5, 0.8), C_STEEL.darkened(0.1))
	# 引き上げた鋼の堰板（下を舟が通れる）
	var leaf := Color(0.24, 0.55, 0.62)
	bb.add(Vector3(12, 2.8, 0), Vector3(0.28, 1.6, 7.9), leaf)
	for y in [2.15, 2.8, 3.45]:
		bb.add(Vector3(12, y, 0), Vector3(0.36, 0.1, 7.9), leaf.darkened(0.35))
	# 梁の扁額「保存水門」（水路の東西どちらからも読める）
	for sx in [-1.0, 1.0]:
		bb.add(Vector3(12 + 0.42 * sx, 4.15, 0), Vector3(0.06, 0.62, 2.7), Color(0.95, 0.9, 0.78))
		_text("保存水門", Vector3(12 + 0.46 * sx, 4.15, 0), 0.42, Color(0.3, 0.16, 0.08), Vector3(0, 90 * sx, 0), root)
	for z in [-2.4, 2.4]:
		bb.add(Vector3(12, 3.98, z), Vector3(0.1, 0.4, 0.1), Color(0.62, 0.64, 0.68))
	_text("享保の水門柱（保存）", Vector3(12, 2.15, 4.67), 0.075, Color(0.98, 0.92, 0.75), Vector3.ZERO, root)

	# 大歯車と歯止め（台座・枠・銘板）
	bb.add(Vector3(10.2, 0.45, 5.0), Vector3(1.9, 0.9, 0.7), Color(0.68, 0.67, 0.64), Vector3.ZERO, true)
	for x in [8.95, 11.45]:
		bb.add(Vector3(x, 1.95, 4.95), Vector3(0.14, 2.1, 0.14), C_STEEL.darkened(0.2))
	bb.add(Vector3(10.2, 3.05, 4.95), Vector3(2.7, 0.16, 0.16), C_STEEL.darkened(0.2))
	bb.add(Vector3(10.2, 1.85, 4.8), Vector3(0.18, 0.18, 0.4), Color(0.55, 0.57, 0.6))
	bg.add(Vector3(10.2, 3.42, 5.0), Vector3(2.5, 0.46, 0.06), C_NAVY)
	_text("保存水門（歯止め式）", Vector3(10.2, 3.42, 5.04), 0.2, Color.WHITE, Vector3.ZERO, root)
	gate_gear = LevelKit.gear(root, GEAR_POS, 0.95, 0.22, Color(0.36, 0.39, 0.44), 12, Color(0.52, 0.55, 0.6))
	gate_gear.add_to_group("dynamic")
	_pawl = Node3D.new()
	_pawl.position = Vector3(11.35, 2.95, 5.22)
	_pawl.rotation_degrees.z = PAWL_BASE
	_pawl.add_to_group("dynamic")
	root.add_child(_pawl)
	LevelKit.box(_pawl, Vector3(0, -0.28, 0), Vector3(0.11, 0.58, 0.09), Color(0.96, 0.42, 0.12), false)
	LevelKit.cyl(root, Vector3(11.35, 2.95, 5.22), 0.07, 0.16, Color(0.22, 0.22, 0.25), false, Vector3(90, 0, 0), 8)
	_text("歯止め", Vector3(11.95, 2.6, 5.27), 0.11, Color(1.0, 0.85, 0.3), Vector3.ZERO, root)

	# 源兵衛の水門絵図（写し）の展示
	exhibit = Node3D.new()
	exhibit.name = "Exhibit"
	exhibit.position = EXHIBIT_POS
	exhibit.rotation_degrees.y = 18.0
	root.add_child(exhibit)
	var dark := Color(0.26, 0.18, 0.12)
	for sx in [-0.74, 0.74]:
		LevelKit.box(exhibit, Vector3(sx, 0.62, -0.02), Vector3(0.09, 1.24, 0.09), dark, false)
	LevelKit.box(exhibit, Vector3(0, 1.62, -0.02), Vector3(1.78, 1.3, 0.08), dark, true)
	var dq := QuadMesh.new()
	dq.size = Vector2(1.6, 1.12)
	LevelKit.mesh(exhibit, dq, Vector3(0, 1.62, 0.025), Art.tex_mat("drawing", Art.drawing_tex(), false, 0.1))
	LevelKit.box(exhibit, Vector3(0, 2.34, 0.04), Vector3(1.96, 0.08, 0.34), dark, false)
	LevelKit.box(exhibit, Vector3(0, 0.82, 0.0), Vector3(1.6, 0.26, 0.05), C_NAVY, false)
	_text("源兵衛の水門絵図（写し）", Vector3(0, 0.82, 0.03), 0.1, Color.WHITE, Vector3.ZERO, exhibit)
	LevelKit.box(exhibit, Vector3(0, 2.56, 0.0), Vector3(1.3, 0.3, 0.04), Color(0.95, 0.92, 0.84), false)
	_text("保存水門の由来", Vector3(0, 2.56, 0.025), 0.15, dark, Vector3.ZERO, exhibit)
	Interactable.create(exhibit, Vector3(0, 0, 0.95), "記録を確かめる", _on_exhibit, 2.4, 2.0)
	targets["exhibit"] = exhibit

	# 保守通路への階段（西）・通路・階段（東）：見た目は段、当たり判定は坂
	var conc := C_CONCRETE
	bb.add(Vector3(14.3, -0.15, 3.3), Vector3(1.4, 0.3, 1.4), conc, Vector3.ZERO, true)
	bb.add(Vector3(29.1, -0.15, 3.3), Vector3(1.4, 0.3, 1.4), conc, Vector3.ZERO, true)
	for i in 6:
		var top := -0.15 * (i + 1)
		var hgt := top + 1.25
		bb.add(Vector3(15.2 + 0.4 * i, top - hgt * 0.5, 3.3), Vector3(0.4, hgt, 1.4), conc.darkened(0.04 * (i % 2)))
		bb.add(Vector3(28.2 - 0.4 * i, top - hgt * 0.5, 3.3), Vector3(0.4, hgt, 1.4), conc.darkened(0.04 * (i % 2)))
	var ang := rad_to_deg(atan2(0.9, 2.4))
	var rl := sqrt(2.4 * 2.4 + 0.9 * 0.9)
	var nx := 0.1 * sin(deg_to_rad(ang))
	var ny := 0.1 * cos(deg_to_rad(ang))
	bb.collider(Vector3(16.2 - nx, -0.45 - ny, 3.3), Vector3(rl, 0.2, 1.4), Vector3(0, 0, -ang))
	bb.collider(Vector3(27.2 + nx, -0.45 - ny, 3.3), Vector3(rl, 0.2, 1.4), Vector3(0, 0, ang))
	bb.add(Vector3(21.7, -1.05, 3.3), Vector3(8.6, 0.3, 1.4), Color(0.6, 0.58, 0.54), Vector3.ZERO, true)
	bb.add(Vector3(21.7, -0.893, 2.72), Vector3(8.6, 0.016, 0.1), Color(0.98, 0.8, 0.15))
	for i in 5:
		bb.add(Vector3(18.0 + i * 2.0, -1.45, 3.4), Vector3(0.2, 0.6, 1.1), conc.darkened(0.15))
	# 水側の手すり（銅色）
	for seg in [[13.6, 15.0, 0.0, 0.0], [15.0, 17.4, 0.0, -0.9], [17.4, 26.0, -0.9, -0.9], [26.0, 28.4, -0.9, 0.0], [28.4, 29.8, 0.0, 0.0]]:
		var xa: float = seg[0]
		var xb: float = seg[1]
		var ya: float = seg[2]
		var yb: float = seg[3]
		var sl := rad_to_deg(atan2(yb - ya, xb - xa))
		var ln := Vector2(xb - xa, yb - ya).length()
		var mid := Vector3((xa + xb) * 0.5, (ya + yb) * 0.5, 2.66)
		bb.add(mid + Vector3(0, 1.0, 0), Vector3(ln + 0.06, 0.07, 0.07), C_COPPER, Vector3(0, 0, sl))
		bb.add(mid + Vector3(0, 0.5, 0), Vector3(ln, 0.05, 0.05), C_COPPER.darkened(0.2), Vector3(0, 0, sl))
		bb.collider(mid + Vector3(0, 0.6, 0), Vector3(ln + 0.1, 1.2, 0.12), Vector3(0, 0, sl))
		var np := maxi(1, int(ln / 1.4))
		for k in np + 1:
			var x := lerpf(xa, xb, float(k) / np)
			var y := lerpf(ya, yb, float(k) / np)
			bb.add(Vector3(x, y + 0.5, 2.66), Vector3(0.07, 1.0, 0.07), C_COPPER.darkened(0.1))
	# 壁の明かり・足元の光の帯・通路の灯り
	for i in 8:
		bg.add(Vector3(15.0 + i * 2.0, -0.32, 3.975), Vector3(0.42, 0.16, 0.05), C_WARM)
	bg.add(Vector3(21.7, -1.21, 2.6), Vector3(8.6, 0.05, 0.05), C_WARM)
	for x in [18.0, 22.0, 26.0]:
		bb.add(Vector3(x, -0.25, 2.66), Vector3(0.06, 1.3, 0.06), Color(0.2, 0.22, 0.24))
		bl.add(Vector3(x, 0.5, 2.66), Vector3(0.24, 0.28, 0.24), C_WARM)
	# 階段口の案内板
	bb.add(Vector3(15.6, 1.3, 4.3), Vector3(0.08, 0.5, 0.08), Color(0.3, 0.3, 0.32))
	bg.add(Vector3(15.6, 1.68, 4.33), Vector3(1.34, 0.34, 0.04), Color(0.12, 0.42, 0.3))
	_text("保守通路（見学できます）", Vector3(15.6, 1.68, 4.36), 0.09, Color.WHITE, Vector3.ZERO, root)
	# 北の石垣に現れた水路の口（新しい水の流れ）
	var stone := Color(0.82, 0.8, 0.75)
	var dark_hole := Color(0.04, 0.06, 0.07)
	for x in [19.5, 24.5]:
		# アーチ形の口：暗い奥・半円の上部・石の縁
		bb.add(Vector3(x, -0.78, -3.985), Vector3(1.6, 0.6, 0.03), dark_hole)
		var arch := LevelKit.cyl(root, Vector3(x, -0.48, -3.985), 0.8, 0.03, dark_hole, false, Vector3(90, 0, 0), 16)
		arch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var rim := LevelKit.cyl(root, Vector3(x, -0.48, -3.995), 1.02, 0.05, stone, false, Vector3(90, 0, 0), 16)
		rim.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		for sx in [-0.92, 0.92]:
			bb.add(Vector3(x + sx, -0.8, -3.9), Vector3(0.22, 0.75, 0.22), stone)
		bb.add(Vector3(x, 0.4, -3.86), Vector3(0.34, 0.34, 0.26), stone.darkened(0.08))
		bb.add(Vector3(x, -1.08, -3.8), Vector3(1.7, 0.1, 0.4), stone)
		var fq := QuadMesh.new()
		fq.size = Vector2(1.5, 0.5)
		var fall := LevelKit.mesh(root, fq, Vector3(x, -1.32, -3.6), Art.waterfall_mat())
		fall.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		bl.add(Vector3(x, -1.38, -3.25), Vector3(1.9, 0.14, 0.9), Color(0.93, 0.98, 1.0))
	bb.flush()
	bg.flush()
	bl.flush()
	# 保守通路の結晶（あらたに現れた道のごほうび）
	Crystal.create(root, "present_c8", Vector3(18.8, 0.0, 3.3))
	Crystal.create(root, "present_c9", Vector3(22.0, 0.0, 3.3))
	Crystal.create(root, "present_c10", Vector3(25.2, 0.0, 3.3))
	Crystal.create(root, "present_c11", Vector3(29.1, 0.9, 3.3))


# ---------------------------------------------------------------- 遠景・範囲

func _build_backdrop() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 2026
	var cols := [Color(0.9, 0.86, 0.78), Color(0.75, 0.78, 0.84), Color(0.85, 0.5, 0.42), Color(0.55, 0.65, 0.78),
			Color(0.95, 0.92, 0.86), Color(0.6, 0.7, 0.62), Color(0.96, 0.78, 0.55)]
	var signs := [Color(0.95, 0.2, 0.15), Color(1.0, 0.8, 0.15), Color(0.15, 0.4, 0.85), Color(0.95, 0.4, 0.6), Color(0.2, 0.7, 0.4)]
	# 範囲の外へ続く店並み（東西）
	for north in [false, true]:
		var fz := N_FRONT if north else S_FRONT
		var s := 1.0 if north else -1.0
		for xr in [[-92.0, -44.0], [44.0, 92.0]]:
			var x: float = xr[0]
			while x < float(xr[1]):
				var w := rng.randf_range(6.0, 10.0)
				var h := rng.randf_range(10.0, 26.0)
				_far.add(Vector3(x + w * 0.5, h * 0.5, fz - s * 6.0), Vector3(w, h, 12.0), cols[rng.randi() % cols.size()])
				if rng.randf() < 0.7:
					var vh := rng.randf_range(3.0, 5.0)
					_glow.add(Vector3(x + 0.9, rng.randf_range(5.0, h - 3.0), fz + s * 1.0), Vector3(0.24, vh, 1.2), signs[rng.randi() % signs.size()])
				if rng.randf() < 0.5:
					_glow.add(Vector3(x + w * 0.5, rng.randf_range(6.0, h - 2.0), fz + s * 0.2), Vector3(w * 0.7, 2.2, 0.1), signs[rng.randi() % signs.size()])
				x += w
	# 奥のビル群（スカイライン）
	for north in [false, true]:
		var s2 := -1.0 if north else 1.0
		for i in 16:
			var x2 := -92.0 + i * 11.5 + rng.randf_range(-2.0, 2.0)
			var w2 := rng.randf_range(8.0, 14.0)
			var h2 := rng.randf_range(24.0, 52.0)
			var z2 := s2 * rng.randf_range(34.0, 46.0)
			_far.add(Vector3(x2, h2 * 0.5, z2), Vector3(w2, h2, 10.0), cols[rng.randi() % cols.size()].lerp(Color(0.62, 0.7, 0.84), 0.4))
	# 遠くの橋（水路の見通しの終点）
	for bxx in [-50.0, 48.0]:
		_bx.add(Vector3(bxx, 0.25, 0), Vector3(5.0, 0.5, 9.4), C_STONE)
		for sx in [-1.0, 1.0]:
			_bx.add(Vector3(bxx + 2.35 * sx, 0.95, 0), Vector3(0.3, 0.9, 9.4), C_STONE)
		_bx.add(Vector3(bxx, -0.8, 0), Vector3(3.6, 1.6, 0.8), C_STONE.darkened(0.15))
	# 雲
	var cl := Art.Batch.new(self, Art.unit_sphere(10), Art.vc_mat(true), false)
	for i in 10:
		var a := TAU * i / 10.0 + rng.randf_range(-0.2, 0.2)
		var r := rng.randf_range(130.0, 170.0)
		var cc := Vector3(cos(a) * r, rng.randf_range(48.0, 70.0), sin(a) * r)
		for k in 4:
			var off := Vector3(rng.randf_range(-12.0, 12.0), rng.randf_range(-2.0, 3.0), rng.randf_range(-6.0, 6.0))
			var sz := rng.randf_range(10.0, 18.0)
			cl.add(cc + off, Vector3(sz * 1.6, sz * 0.6, sz), Color(1.0, 1.0, 1.0))
	cl.flush()


func _build_bounds() -> void:
	LevelKit.wall(self, Vector3(-37.6, 5, 0), Vector3(1, 14, 60))
	LevelKit.wall(self, Vector3(33.9, 5, 0), Vector3(1, 14, 60))
	LevelKit.wall(self, Vector3(0, 5, 27), Vector3(80, 14, 1))
	LevelKit.wall(self, Vector3(0, 5, -27), Vector3(80, 14, 1))
	# 通行止めの柵（範囲の端を自然に見せる）
	for e in [[-37.0, 90.0], [33.3, -90.0]]:
		var x: float = e[0]
		var face: float = e[1]
		for zr in [[4.8, 15.8], [-13.8, -4.8]]:
			var z0: float = zr[0]
			var z1: float = zr[1]
			var n := int((z1 - z0) / 0.55)
			for i in n:
				var z := z0 + (i + 0.5) * (z1 - z0) / n
				var c := Color(0.98, 0.78, 0.1) if i % 2 == 0 else Color(0.12, 0.12, 0.12)
				_bx.add(Vector3(x, 0.9, z), Vector3(0.08, 0.16, (z1 - z0) / n), c)
				_bx.add(Vector3(x, 0.5, z), Vector3(0.08, 0.16, (z1 - z0) / n), c)
			for zp in [z0, (z0 + z1) * 0.5, z1]:
				_bx.add(Vector3(x, 0.55, zp), Vector3(0.12, 1.1, 0.12), Color(0.92, 0.92, 0.9))
			var zc := (z0 + z1) * 0.5
			_bx.add(Vector3(x, 1.45, zc), Vector3(0.05, 0.5, 1.3), Color(0.95, 0.95, 0.95))
			_text("この先 工事中", Vector3(x + 0.04 * signf(face), 1.45, zc), 0.15, Color(0.75, 0.1, 0.08), Vector3(0, face, 0))


func _build_crystals() -> void:
	Crystal.create(self, "present_c1", Vector3(-33.5, 0.9, 13.6))
	Crystal.create(self, "present_c2", Vector3(BRIDGE_X, 1.45, 0.0))
	Crystal.create(self, "present_c3", Vector3(-31.0, 0.9, -9.0))
	Crystal.create(self, "present_c4", Vector3(-6.5, 0.9, -11.6))
	Crystal.create(self, "present_c5", Vector3(16.5, 0.9, -7.0))
	Crystal.create(self, "present_c6", Vector3(5.05, 2.65, 14.6))
	Crystal.create(self, "present_c7", Vector3(27.5, 0.9, 13.6))


# ---------------------------------------------------------------- 人

func _build_npcs() -> void:
	var changed := TimelineState.gate_repaired
	_citizen(Vector3(-23.0, 0, 5.5), 0.0, "idle",
			"保存水門の歯止め、江戸時代の職人さんの仕組みがもとになってるんやて。" if changed
			else "水路沿いの石の標識、QRが付いてるやろ？ IDOっていう歴史案内なんやて。")
	_citizen(Vector3(-6.6, 0, 11.3), 180.0, "idle", "ここのたこ焼き、外はカリッと中はトロッとや！")
	_citizen(Vector3(-6.0, 0, 13.6), 0.0, "work", "まいど！ 焼きたてやで〜！")
	_citizen(Vector3(-24.5, 0, -6.6), 180.0, "idle", "ロボットのイベントでもやってるんかな？")
	_citizen(Vector3(-12.6, 0.55, -1.0), 90.0, "idle", "この橋から見る水路、ええ眺めやろ。")
	_citizen(Vector3(19.5, 0, 7.2), 0.0, "point",
			"下の保守通路、見学できるんよ。水の流れがよう見えるで。" if changed
			else "このへん、昔は水門があったらしいけど、記録は何も残ってへんねん。")


func _citizen(pos: Vector3, yaw: float, anim: String, line: String) -> Npc:
	var n := Npc.create(self, "citizen", pos, yaw)
	n.play(anim)
	# 遠くの通行人は描かない（描画負荷対策）
	for g in n.find_children("*", "GeometryInstance3D", true, false):
		(g as GeometryInstance3D).visibility_range_end = 38.0
	n.set_talk("話す", func() -> void: Hud.bark("通行人", line, 3.6), 2.2)
	return n


# ================================================================ 物語

func _setup_story_state() -> void:
	var t := TimelineState
	if t.drawing_confirmed:
		matsui = Npc.create(self, "matsui", MATSUI_EXHIBIT_POS, -31.0)
		_make_portal(false)
	else:
		matsui = Npc.create(self, "matsui", MATSUI_DESK_POS, 70.0)
		if not t.met_matsui:
			matsui.play("wave")
	matsui.set_talk("話す", _on_matsui)
	targets["matsui"] = matsui


func _start_story() -> void:
	var t := TimelineState
	if t.drawing_confirmed:
		Hud.hint("光の扉から異次元拠点へ向かおう", 4.0)
		return
	if t.gate_repaired:
		if arrived_by_warp or not _seen.has("return"):
			_seen["return"] = true
			await _return_cutscene()
		else:
			Hud.hint("IDOの隣の展示を F で確かめよう", 4.0)
		return
	if not t.met_matsui:
		var at_start := TimeTravel.pending_spawn in ["present_start", "default", ""]
		if not _seen.has("arrive") and (arrived_by_warp or at_start):
			_seen["arrive"] = true
			_busy = true
			if arrived_by_warp:
				_rift_fx()
			await get_tree().create_timer(1.0).timeout
			await say("present_arrive_first")
			checkpoint("present_start", false)
			_busy = false
		Hud.hint("Shift でダッシュ！ 水路沿いの通りを調べてみよう", 5.0)
	else:
		Hud.hint("水路沿いの石の標識（IDO）を F で調べよう", 4.0)


## 1726年から戻った直後：変わった場所を同じ構図で見せる（仕様 §3.4 / §9.1）。
func _return_cutscene() -> void:
	_busy = true
	await get_tree().create_timer(1.0).timeout
	await say("present_return_changed")
	await reveal(Vector3(1.5, 3.0, 0.4), Vector3(13.0, 1.1, 2.6), 3.0, "記録が変化した！")
	checkpoint("present_ido", false)
	refresh_objective()
	Hud.hint("IDOの隣の展示を F で確かめよう", 5.0)
	_busy = false


## 時の裂け目から出てきた名残（到着地点の背後で消えていく）。
func _rift_fx() -> void:
	var p := Portal.create(self, Vector3(-31.6, 1.5, 7.0), Color(0.7, 0.55, 1.0), 1.3, false, 90.0)
	var tw := create_tween()
	tw.tween_interval(1.2)
	tw.tween_property(p, "scale", Vector3.ONE * 0.02, 0.8).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tw.tween_callback(p.queue_free)


func _on_matsui() -> void:
	if _busy:
		return
	_busy = true
	var t := TimelineState
	if not t.met_matsui:
		matsui.play("idle")
		await say("matsui_first")
		t.set_flag("met_matsui", true)
		refresh_objective()
		checkpoint("present_start", false)
		Hud.hint("水路沿いの石の標識（IDO）を探して、F で調べよう", 5.0)
	elif not t.gate_repaired:
		await say("matsui_repeat")
	elif not t.drawing_confirmed:
		var line: Dictionary = DialogueDB.lines("matsui_return")[0]
		Hud.bark(line.speaker, line.text, 3.5)
	else:
		await say("matsui_after")
	_busy = false


func _on_ido() -> void:
	if _busy or TimeTravel.busy:
		return
	_busy = true
	TimelineState.mark_metric_time("ido_found_time")
	await _scan_fx()
	var i: int = await Hud.choose("IDO 歴史記録 ― 旧水路 canal_01", _ido_body(), ["時空移動する（1726年へ）", "やめる"])
	_busy = false
	if i == 0:
		_busy = true
		checkpoint("present_ido", false)
		TimeTravel.travel_to(TimelineState.ERA_EDO, "edo_arrive")


func _ido_body() -> String:
	var head := "[b]1726年（享保11年）　大坂・仕掛け横丁の水門[/b]\n"
	var back := "[color=#7dffd8]帰還：[/color]到着地点の光の輪から現代へ戻れる"
	if TimelineState.gate_repaired:
		return head + \
				"[color=#a8bcd8]記録：[/color]からくり職人 源兵衛が水門を修理。[color=#ffe27a]歯止め式の大歯車[/color]で人の通行を守った\n" + \
				"[color=#a8bcd8]継承：[/color]おはるの写した絵図が町の記録に残り、[color=#ffe27a]いまは保存水門[/color]としてこの場所にある\n" + back
	return head + \
			"[color=#a8bcd8]記録：[/color]からくり職人 源兵衛が水門の修理を請け負う\n" + \
			"[color=#ff9a7a]危険：[/color]水門の大歯車が外れ、水路があふれている\n" + back


## スキャン演出：ネクマックスから QR へ光を伸ばす。
func _scan_fx() -> void:
	var was := Game.input_locked
	Game.input_locked = true
	var to := ido_qr.global_position
	var from := player.global_position + Vector3(0, 0.8, 0)
	var flat := to - player.global_position
	flat.y = 0.0
	if flat.length() > 0.05:
		player.model.rotation.y = atan2(-flat.x, -flat.z)
	Sfx.play("lock")
	var beam := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.26
	cm.bottom_radius = 0.03
	cm.height = 1.0
	cm.radial_segments = 10
	cm.rings = 1
	beam.mesh = cm
	beam.material_override = LevelKit.unshaded(Color(0.45, 0.95, 1.0, 0.4))
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(beam)
	var dir := to - from
	beam.global_transform = Transform3D(Basis(Quaternion(Vector3.UP, dir.normalized())), (from + to) * 0.5)
	var blen := dir.length()
	beam.scale = Vector3(0.05, blen, 0.05)
	var tw := create_tween()
	tw.tween_property(beam, "scale", Vector3(1.0, blen, 1.0), 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(qr_mat, "emission_energy_multiplier", 2.2, 0.22)
	tw.tween_interval(0.45)
	tw.tween_property(beam, "scale", Vector3(0.02, blen, 0.02), 0.18)
	tw.parallel().tween_property(qr_mat, "emission_energy_multiplier", 0.35, 0.4)
	await tw.finished
	beam.queue_free()
	Hud.flash(Color(0.6, 1.0, 1.0, 0.4), 0.35)
	Hud.toast("IDO 読み取り完了", "info", 1.4)
	await get_tree().create_timer(0.35).timeout
	Game.input_locked = was


func _on_old_sign() -> void:
	Hud.hint("「旧水門跡」……どんな水門だったのか、記録は残っていないようだ", 3.5)


## 展示で記録を確かめる（仕様 §2.4「更新箇所だけを比較表示」）→ マツイ社長 → 光の扉。
func _on_exhibit() -> void:
	if _busy:
		return
	_busy = true
	var t := TimelineState
	if t.drawing_confirmed:
		await Hud.show_panel("記録の比較", _compare_bbcode(), ["閉じる"])
		_busy = false
		return
	if not t.confirm_drawing():
		Hud.hint("記録がまだ確定していない……（1726年の絵図が見つかっていない）", 3.0)
		_busy = false
		return
	Sfx.play("success")
	await Hud.show_panel("記録の比較", _compare_bbcode(), ["閉じる"])
	await say("exhibit_confirm")
	# マツイ社長が駆けつける。光の扉は「さっきから開いてる」ので先に開いておく
	var was := Game.input_locked
	Game.input_locked = true
	var cam := _cut_cam(Vector3(10.4, 2.5, 13.0), Vector3(4.4, 1.2, 8.6))
	_make_portal(true)
	await get_tree().create_timer(0.6).timeout
	if matsui.global_position.distance_to(MATSUI_EXHIBIT_POS) > 11.0:
		matsui.teleport(Vector3(-4.5, 0, 10.9), -90.0)
	matsui.emote("！", 1.4)
	await matsui.walk_to([MATSUI_EXHIBIT_POS], 4.2)
	matsui.face_towards(player.global_position)
	await say("matsui_second")
	_end_cut(cam)
	Game.input_locked = was
	Hud.toast("異次元拠点への扉が開いている", "change", 2.6)
	checkpoint("present_portal")
	refresh_objective()
	_busy = false


func _compare_bbcode() -> String:
	var c_old := "#8fa3c0"
	var c_new := "#ffe27a"
	return "[b]旧水路 canal_01 ― 旧水門跡の記録[/b]\n" + \
			"[table=2]" + \
			"[cell][color=%s]変更前[/color]　[/cell][cell][color=#7dffd8]変更後（いまの記録）[/color][/cell]" % c_old + \
			"[cell][color=%s][s]記録なし[/s]　[/color][/cell][cell][color=%s]源兵衛の水門絵図[/color]──おはるの写しが町の記録に残る[/cell]" % [c_old, c_new] + \
			"[cell][color=%s][s]旧水門は明治期に撤去[/s]　[/color][/cell][cell][color=%s]昭和の改修で、歯止め式の保守水門として保存[/color][/cell]" % [c_old, c_new] + \
			"[cell][color=%s][s]跡地はコンクリートの護岸のみ[/s]　[/color][/cell][cell][color=%s]水門の脇に保守通路が開通[/color][/cell]" % [c_old, c_new] + \
			"[/table]\n" + \
			"[color=#a8bcd8]※ 更新された箇所だけを表示しています[/color]"


func _make_portal(animate: bool) -> void:
	if portal:
		return
	LevelKit.cyl(self, Vector3(PORTAL_POS.x, 0.04, PORTAL_POS.z), 1.15, 0.08, Color(0.78, 0.9, 0.92), false, Vector3.ZERO, 20)
	portal = Portal.create(self, PORTAL_POS, Color(0.5, 1.0, 0.9), 1.4, false, 90.0)
	Interactable.create(self, Vector3(PORTAL_POS.x, 0, PORTAL_POS.z), "異次元拠点へ", _on_portal, 2.6, 2.6)
	targets["hub_portal"] = portal
	if animate:
		portal.scale = Vector3.ONE * 0.05
		var tw := create_tween()
		tw.tween_property(portal, "scale", Vector3.ONE, 0.8).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		Sfx.play("door")
		Hud.flash(Color(0.6, 1.0, 0.95, 0.3), 0.5)


func _on_portal() -> void:
	if _busy or TimeTravel.busy:
		return
	_busy = true
	TimeTravel.travel_to(TimelineState.ERA_HUB, "hub_start")


func _cut_cam(pos: Vector3, look: Vector3) -> Camera3D:
	var cam := Camera3D.new()
	cam.fov = 60.0
	add_child(cam)
	cam.global_position = pos
	cam.look_at(look, Vector3.UP)
	cam.current = true
	return cam


func _end_cut(cam: Camera3D) -> void:
	if player and player.camera:
		player.camera.current = true
	cam.queue_free()


# ================================================================ 毎フレーム

func _process(delta: float) -> void:
	if player == null:
		return
	# IDO の反応範囲：遠くでもうっすら、近づくほど明るく脈打つ
	var d := player.global_position.distance_to(IDO_POS)
	var want := maxf(0.2, clampf((8.0 - d) / 5.0, 0.0, 1.0))
	_ring_s = lerpf(_ring_s, want, 1.0 - exp(-4.0 * delta))
	ido_ring_mat.set_shader_parameter("strength", _ring_s)
	# 保存水門の大歯車：ときどき1歯ぶん回り、歯止めがカチッと落ちる
	if gate_gear and gate_gear.is_visible_in_tree():
		_gear_t += delta
		if _gear_t > 2.8:
			_gear_t = 0.0
			_tick_gear(d)
	# マツイ社長がネクマックスに気づく
	if matsui and not _matsui_noticed and not TimelineState.met_matsui:
		if player.global_position.distance_to(matsui.global_position) < 8.0:
			_matsui_noticed = true
			matsui.emote("！", 1.6)


func _tick_gear(dist: float) -> void:
	var tw := create_tween()
	tw.tween_property(_pawl, "rotation_degrees:z", PAWL_BASE - 12.0, 0.12)
	tw.parallel().tween_property(gate_gear, "rotation:z", gate_gear.rotation.z - TAU / 12.0, 0.32).set_trans(Tween.TRANS_SINE)
	tw.tween_property(_pawl, "rotation_degrees:z", PAWL_BASE, 0.08).set_trans(Tween.TRANS_BOUNCE)
	if dist < 9.0:
		tw.tween_callback(func() -> void: Sfx.play("click", 1.0, -10.0))


# ================================================================ 下請け

## 日陰が空の青一色にならないよう、環境光に少し暖かい灰色を混ぜる（この時代のシーンだけ）。
func _tune_environment() -> void:
	for c in get_children():
		if c is WorldEnvironment:
			var env := (c as WorldEnvironment).environment
			env.ambient_light_color = Color(0.86, 0.8, 0.72)
			env.ambient_light_sky_contribution = 0.55


## 世界座標の模様を貼った箱（石畳・石垣・御影石）。
func _tbox(parent: Node, pos: Vector3, size: Vector3, m: Material, collide: bool = true) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = size
	var mi := LevelKit.mesh(parent, bm, pos, m)
	if collide:
		var body := StaticBody3D.new()
		body.position = pos
		body.collision_layer = LevelKit.LAYER_WORLD
		body.collision_mask = 0
		var cs := CollisionShape3D.new()
		var sh := BoxShape3D.new()
		sh.size = size
		cs.shape = sh
		body.add_child(cs)
		parent.add_child(body)
	return mi


## 看板の文字。height はおおよその文字の高さ（m）。
func _text(txt: String, pos: Vector3, height: float, col: Color, rot: Vector3, parent: Node = null) -> Label3D:
	var l := LevelKit.label(parent if parent else self, txt, pos, 72, col, false, rot)
	l.pixel_size = height / 72.0
	l.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if height < 0.2:
		l.visibility_range_end = 24.0   # 小さな銘板の文字は近くでだけ描く
	return l


func _vtext(txt: String, pos: Vector3, height: float, col: Color, rot: Vector3, parent: Node = null) -> Label3D:
	var l := LevelKit.vlabel(parent if parent else self, txt, pos, 72, col, rot)
	l.pixel_size = height / 72.0
	l.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return l


## 検証用（-- --stats）：描画対象の数を出す。
func _print_stats() -> void:
	await get_tree().create_timer(0.5).timeout
	var meshes := find_children("*", "MeshInstance3D", true, false).size()
	var mms := find_children("*", "MultiMeshInstance3D", true, false)
	var inst := 0
	for m in mms:
		inst += (m as MultiMeshInstance3D).multimesh.instance_count
	var labels := find_children("*", "Label3D", true, false).size()
	print("PRESENT STATS: mesh=%d multimesh=%d (instances=%d) label=%d" % [meshes, mms.size(), inst, labels])
