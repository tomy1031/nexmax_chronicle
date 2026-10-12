extends RefCounted
## 2086年ナンバタウンの景観パーツ（簡易形状）。future_canal.gd から preload して使う。
## 動かない装飾は merge_static() で材質ごとに1つのメッシュへまとめ、Web版の描画負荷を抑える。

const C_WHITE := Color(0.88, 0.85, 0.8)
const C_CREAM := Color(0.88, 0.77, 0.6)
const C_SAND := Color(0.78, 0.64, 0.47)
const C_TERRA := Color(0.8, 0.5, 0.36)
const C_STEEL := Color(0.5, 0.55, 0.64)
const C_DARK := Color(0.16, 0.2, 0.3)
const C_GLASS := Color(0.26, 0.52, 0.72)
const C_GREEN := Color(0.2, 0.48, 0.22)
const C_GREEN_DARK := Color(0.13, 0.36, 0.18)
const C_LEAF := Color(0.33, 0.62, 0.24)
const C_AMBER := Color(1.0, 0.6, 0.18)
const C_CYAN := Color(0.25, 0.82, 1.0)
const C_ORANGE := Color(0.98, 0.45, 0.15)
const C_TEAL := Color(0.1, 0.52, 0.6)
const C_STONE := Color(0.74, 0.69, 0.62)
const C_STONE_DARK := Color(0.56, 0.52, 0.48)
const C_FLOOR := Color(0.86, 0.79, 0.68)
const C_FLOOR_LINE := Color(0.52, 0.5, 0.52)

static var _holo_shader: Shader
static var _holo_mats := {}


## ホログラムの面（閉鎖表示・シャッター・封鎖壁）。QuadMesh に使うと縁が光る。
static func holo_mat(color: Color, stripes: float = 5.0, speed: float = 1.0, strength: float = 1.0, edge_amt: float = 0.55) -> ShaderMaterial:
	var key := "%s|%.1f|%.1f|%.2f|%.2f" % [color.to_html(), stripes, speed, strength, edge_amt]
	if _holo_mats.has(key):
		return _holo_mats[key]
	if _holo_shader == null:
		_holo_shader = Shader.new()
		_holo_shader.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, shadows_disabled, depth_draw_never;
uniform vec4 tint : source_color = vec4(1.0, 0.5, 0.1, 1.0);
uniform float stripes = 5.0;
uniform float speed = 1.0;
uniform float strength = 1.0;
uniform float edge_amt = 0.55;
void fragment() {
	float s = fract((UV.x + UV.y) * stripes - TIME * speed);
	float band = smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.42, 0.5, s));
	float scan = 0.5 + 0.5 * sin(UV.y * 60.0 - TIME * 5.0);
	vec2 e = abs(UV - vec2(0.5)) * 2.0;
	float edge = smoothstep(0.86, 0.98, max(e.x, e.y));
	float a = (0.22 + band * 0.32 + scan * 0.06 + edge * edge_amt) * strength;
	ALBEDO = mix(tint.rgb, vec3(1.0), edge * edge_amt * 0.6 + band * 0.12) * 1.25;
	ALPHA = clamp(a, 0.0, 0.95);
}
"""
	var m := ShaderMaterial.new()
	m.shader = _holo_shader
	m.set_shader_parameter("tint", color)
	m.set_shader_parameter("stripes", stripes)
	m.set_shader_parameter("speed", speed)
	m.set_shader_parameter("strength", strength)
	m.set_shader_parameter("edge_amt", edge_amt)
	_holo_mats[key] = m
	return m


static func quad(parent: Node, pos: Vector3, size: Vector2, material: Material, rot_deg: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var qm := QuadMesh.new()
	qm.size = size
	var mi := LevelKit.mesh(parent, qm, pos, material, rot_deg)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func glow_box(parent: Node, pos: Vector3, size: Vector3, color: Color, energy: float = 2.2) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = size
	var mi := LevelKit.mesh(parent, bm, pos, LevelKit.glow(color, energy))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


## 欄干：ガラス板＋光る手すり＋見えない当たり判定（高さ1.2m。カメラのばね腕に当たらない高さ）。
## a→b は水平な線分（y は床の高さ）。
static func railing(parent: Node, a: Vector3, b: Vector3, rail_color: Color, collide: bool = true) -> void:
	var d := b - a
	var length := Vector3(d.x, 0, d.z).length()
	if length < 0.05:
		return
	var mid := (a + b) * 0.5
	var yaw := rad_to_deg(atan2(d.x, d.z))
	var n := Node3D.new()
	n.position = mid
	n.rotation_degrees.y = yaw
	parent.add_child(n)
	LevelKit.box(n, Vector3(0, 0.45, 0), Vector3(0.06, 0.8, length), Color(0.55, 0.78, 0.95, 0.28), false)
	glow_box(n, Vector3(0, 0.9, 0), Vector3(0.1, 0.08, length), rail_color, 2.0)
	LevelKit.box(n, Vector3(0, 0.04, 0), Vector3(0.16, 0.08, length), C_STEEL, false)
	if collide:
		var w := LevelKit.wall(n, Vector3(0, 0.6, 0), Vector3(0.3, 1.2, length))
		w.name = "RailWall"


## 高層ビル：本体＋光る窓の帯＋屋上の緑。
static func tower(parent: Node, pos: Vector3, size: Vector3, body: Color, win: Color, garden: bool = true) -> void:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	LevelKit.box(n, Vector3(0, size.y * 0.5, 0), size, body, false)
	var bands := clampi(int(size.y / 9.0), 2, 5)
	for i in bands:
		var y := size.y * (0.25 + 0.7 * float(i) / float(bands))
		glow_box(n, Vector3(0, y, 0), Vector3(size.x + 0.08, 0.35, size.z + 0.08), win, 1.6)
	# ガラスの面と縦の差し色
	for sz in [-1.0, 1.0]:
		LevelKit.box(n, Vector3(0, size.y * 0.5, sz * (size.z * 0.5 + 0.05)), Vector3(size.x * 0.56, size.y * 0.86, 0.1), C_GLASS, false)
	LevelKit.box(n, Vector3(size.x * 0.5 + 0.05, size.y * 0.5, 0), Vector3(0.12, size.y * 0.92, size.z * 0.4), C_GLASS, false)
	LevelKit.box(n, Vector3(0, size.y + 0.4, 0), Vector3(size.x * 0.7, 0.8, size.z * 0.7), body.darkened(0.12), false)
	if garden:
		LevelKit.sphere(n, Vector3(0, size.y + 0.9, 0), minf(size.x, size.z) * 0.38, C_GREEN, Vector3(1.2, 0.55, 1.2), 8)


## 段々の建物（近景）：屋上庭園と垂れ下がる蔦つき。
static func terrace(parent: Node, pos: Vector3, size: Vector3, body: Color, face_dir: Vector3, sign_color: Color = Color(-1, 0, 0)) -> void:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	LevelKit.box(n, Vector3(0, size.y * 0.5, 0), size, body, false)
	var top := Vector3(size.x * 0.78, size.y * 0.35, size.z * 0.78)
	LevelKit.box(n, Vector3(0, size.y + top.y * 0.5, 0), top, body.lightened(0.06), false)
	LevelKit.box(n, Vector3(0, size.y + 0.15, 0), Vector3(size.x + 0.2, 0.3, size.z + 0.2), C_GREEN_DARK, false)
	LevelKit.sphere(n, Vector3(size.x * 0.3, size.y + 0.4, size.z * 0.25), 1.0, C_LEAF, Vector3(1.4, 0.7, 1.2), 8)
	# face_dir は ±X か ±Z。正面の半分の奥行きと、正面の幅
	var ax := absf(face_dir.x)
	var az := absf(face_dir.z)
	var half := ax * size.x * 0.5 + az * size.z * 0.5
	var width := az * size.x + ax * size.z
	var across := Vector3(az, 0, ax)
	var thin := Vector3(ax, 0, az) * 0.1
	glow_box(n, Vector3(0, size.y * 0.62, 0) + face_dir * (half + 0.05), across * width * 0.82 + Vector3(0, 0.28, 0) + thin, C_AMBER, 1.6)
	if sign_color.r >= 0.0:
		glow_box(n, Vector3(0, size.y * 0.32, 0) + face_dir * (half + 0.08), across * 2.2 + Vector3(0, 0.8, 0) + thin, sign_color, 1.8)
	# 蔦（位置から決まる長さにして、毎回同じ見た目にする）
	for i in 3:
		var t := (float(i) - 1.0) * width * 0.32
		var vtop := Vector3(0, size.y + 0.1, 0) + face_dir * (half + 0.12) + across * t
		vine(n, vtop, 2.4 + 2.2 * _rand01(pos + vtop))


static func _rand01(p: Vector3) -> float:
	return fposmod(sin(p.x * 12.9898 + p.z * 78.233 + p.y * 37.719) * 43758.5453, 1.0)


## 垂れ下がる蔦（葉の房を縦に重ねる）。pos は上端。
static func vine(parent: Node, pos: Vector3, length: float) -> void:
	var k := _rand01(pos)
	LevelKit.sphere(parent, pos - Vector3(0, length * 0.42, 0), 0.42, C_GREEN, Vector3(1.0, length * 1.15, 0.7), 8)
	LevelKit.sphere(parent, pos - Vector3(0.18 - k * 0.36, length * 0.72, 0.12), 0.34, C_LEAF, Vector3(1.0, length * 0.75, 0.75), 8)
	LevelKit.sphere(parent, pos - Vector3(-0.2, length * 0.15, -0.1), 0.38, C_GREEN_DARK, Vector3(1.3, 1.2, 0.8), 8)


## 植え込み（当たり判定つき。ロボの突進を止める障害物にもなる）。
static func planter(parent: Node, pos: Vector3, size: float = 1.6, with_tree: bool = true) -> void:
	LevelKit.box(parent, pos + Vector3(0, 0.4, 0), Vector3(size, 0.8, size), C_WHITE)
	glow_box(parent, pos + Vector3(0, 0.82, 0), Vector3(size + 0.04, 0.06, size + 0.04), C_CYAN, 1.4)
	LevelKit.box(parent, pos + Vector3(0, 0.86, 0), Vector3(size - 0.2, 0.1, size - 0.2), C_GREEN_DARK, false)
	if with_tree:
		LevelKit.tree(parent, pos + Vector3(0, 0.8, 0), 0.9)
	else:
		LevelKit.sphere(parent, pos + Vector3(0, 1.15, 0), size * 0.4, C_LEAF, Vector3(1.2, 0.8, 1.2), 8)


## 縦長の旗（「なんば」「NAMBA TOWN」）。面は yaw 方向（0 なら +Z）を向く。
static func banner(parent: Node, pos: Vector3, text: String, cloth: Color, yaw_deg: float, vertical: bool, h: float = 3.2) -> void:
	var n := Node3D.new()
	n.position = pos
	n.rotation_degrees.y = yaw_deg
	parent.add_child(n)
	LevelKit.cyl(n, Vector3(-0.75, h * 0.5 + 0.6, -0.08), 0.06, h + 1.2, C_STEEL)
	LevelKit.box(n, Vector3(-0.1, h + 0.95, -0.08), Vector3(1.4, 0.06, 0.06), C_STEEL, false)
	LevelKit.box(n, Vector3(0, h * 0.5 + 1.0, -0.08), Vector3(1.2, h, 0.06), cloth, false)
	glow_box(n, Vector3(0, 1.02, -0.08), Vector3(1.2, 0.08, 0.1), Color(1.0, 0.95, 0.8), 1.4)
	var l: Label3D
	if vertical:
		l = LevelKit.vlabel(n, text, Vector3(0, h * 0.5 + 1.0, -0.04), 92, Color.WHITE)
	else:
		l = LevelKit.label(n, text, Vector3(0, h * 0.5 + 1.0, -0.04), 64, Color.WHITE)
	l.outline_size = 10
	l.outline_modulate = cloth.darkened(0.5)


## 源兵衛へのオマージュの巨大な胸像（石造り。白いひげ・額にゴーグル・笑顔）。原点は台座の上面。
static func statue(parent: Node, pos: Vector3, yaw_deg: float, s: float = 1.0) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	n.rotation_degrees.y = yaw_deg
	n.scale = Vector3.ONE * s
	parent.add_child(n)
	var skin := C_STONE
	var robe := Color(0.36, 0.42, 0.62)
	var beard := Color(0.97, 0.96, 0.93)
	# 肩と胸（藍の着物＋白い前掛けの襟）
	LevelKit.sphere(n, Vector3(0, 1.2, 0), 2.6, robe, Vector3(1.35, 0.62, 0.8), 16)
	LevelKit.box(n, Vector3(0, 0.5, 0), Vector3(6.6, 1.0, 3.6), robe.darkened(0.1), false)
	LevelKit.box(n, Vector3(-0.55, 1.5, 1.85), Vector3(0.7, 1.9, 0.4), C_CREAM, false, Vector3(0, 0, 18))
	LevelKit.box(n, Vector3(0.55, 1.5, 1.85), Vector3(0.7, 1.9, 0.4), C_CREAM, false, Vector3(0, 0, -18))
	# 首と頭（前方は +Z）
	LevelKit.cyl(n, Vector3(0, 2.4, 0.1), 0.95, 1.0, skin, false, Vector3.ZERO, 12)
	LevelKit.sphere(n, Vector3(0, 3.9, 0.2), 1.75, skin, Vector3(1.0, 1.05, 0.95), 18)
	# 耳
	for sx in [-1.0, 1.0]:
		LevelKit.sphere(n, Vector3(1.72 * sx, 3.85, 0.1), 0.38, skin.darkened(0.06), Vector3(0.5, 1.0, 0.8), 8)
	# 白い髪（横と後ろ）
	for sx in [-1.0, 1.0]:
		LevelKit.sphere(n, Vector3(1.45 * sx, 4.35, -0.35), 0.75, beard, Vector3(0.7, 1.0, 1.1), 10)
	LevelKit.sphere(n, Vector3(0, 4.4, -1.15), 1.1, beard, Vector3(1.3, 0.9, 0.6), 10)
	# ゴーグル（額のバンドとレンズ）
	var band := LevelKit.cyl(n, Vector3(0, 4.75, 0.2), 1.79, 0.32, Color(0.36, 0.25, 0.18), false, Vector3(-8, 0, 0), 18)
	band.scale = Vector3(1.0, 1.0, 0.95)
	for sx in [-1.0, 1.0]:
		var lens := Node3D.new()
		lens.position = Vector3(0.55 * sx, 4.95, 1.62)
		lens.rotation_degrees = Vector3(-20, 0, 0)
		n.add_child(lens)
		LevelKit.cyl(lens, Vector3.ZERO, 0.46, 0.3, Color(0.78, 0.6, 0.3), false, Vector3(90, 0, 0), 14)
		var g := LevelKit.cyl(lens, Vector3(0, 0, 0.12), 0.34, 0.12, C_CYAN, false, Vector3(90, 0, 0), 14) as MeshInstance3D
		g.material_override = LevelKit.glow(Color(0.45, 0.85, 1.0), 1.2)
	# 太い眉・笑った目・鼻
	for sx in [-1.0, 1.0]:
		LevelKit.box(n, Vector3(0.62 * sx, 4.3, 1.62), Vector3(0.8, 0.22, 0.3), beard, false, Vector3(0, 0, -12 * sx))
		LevelKit.box(n, Vector3(0.6 * sx, 3.98, 1.66), Vector3(0.48, 0.09, 0.12), Color(0.25, 0.2, 0.18), false, Vector3(0, 0, 14 * sx))
		LevelKit.sphere(n, Vector3(0.95 * sx, 3.55, 1.45), 0.3, Color(0.92, 0.7, 0.62), Vector3(1.0, 0.7, 0.6), 8)
	LevelKit.sphere(n, Vector3(0, 3.62, 1.85), 0.36, skin.darkened(0.04), Vector3(1.0, 0.9, 0.9), 10)
	# 口ひげと大きな白いあごひげ
	for sx in [-1.0, 1.0]:
		LevelKit.sphere(n, Vector3(0.42 * sx, 3.22, 1.72), 0.48, beard, Vector3(1.2, 0.55, 0.65), 10)
	LevelKit.sphere(n, Vector3(0, 2.75, 1.25), 1.25, beard, Vector3(1.15, 0.95, 0.75), 12)
	LevelKit.cone(n, Vector3(0, 1.75, 1.45), 0.9, 1.4, beard, 10, Vector3(180, 0, 0))
	LevelKit.box(n, Vector3(0, 3.0, 1.95), Vector3(0.7, 0.12, 0.1), Color(0.45, 0.22, 0.2), false)
	return n


## セントラルタワー（遠景の目印）。回転させる光の輪のノードを返す。
static func central_tower(parent: Node, pos: Vector3) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	LevelKit.cyl(n, Vector3(0, 10, 0), 9.0, 20.0, C_WHITE, false, Vector3.ZERO, 16, 6.5)
	LevelKit.cyl(n, Vector3(0, 32, 0), 5.0, 24.0, Color(0.85, 0.9, 0.96), false, Vector3.ZERO, 16, 4.2)
	LevelKit.cyl(n, Vector3(0, 46, 0), 8.0, 4.0, C_WHITE, false, Vector3.ZERO, 16, 8.5)
	LevelKit.cyl(n, Vector3(0, 52, 0), 3.4, 8.0, C_GLASS, false, Vector3.ZERO, 12, 2.6)
	LevelKit.cyl(n, Vector3(0, 62, 0), 1.2, 14.0, C_WHITE, false, Vector3.ZERO, 8, 0.2)
	for i in 4:
		var a := TAU * i / 4.0
		glow_box(n, Vector3(cos(a) * 4.6, 32, sin(a) * 4.6), Vector3(0.6, 22, 0.6), C_CYAN, 2.4)
	glow_box(n, Vector3(0, 48.2, 0), Vector3(17.2, 0.4, 17.2), C_AMBER, 1.6)
	LevelKit.sphere(n, Vector3(0, 69.5, 0), 0.9, C_AMBER).material_override = LevelKit.glow(Color(1.0, 0.85, 0.4), 4.0)
	var rings := Node3D.new()
	n.add_child(rings)
	for i in 3:
		var tm := TorusMesh.new()
		tm.inner_radius = 11.0 + i * 3.5
		tm.outer_radius = tm.inner_radius + 0.45
		tm.rings = 40
		tm.ring_segments = 6
		var r := LevelKit.mesh(rings, tm, Vector3(0, 26 + i * 9.0, 0), LevelKit.glow(Color(0.7, 0.6, 1.0) if i == 1 else C_CYAN, 2.6), Vector3(4.0 * (i - 1), 0, 6.0 * (1 - i)))
		r.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return rings


## 空飛ぶ車（小さなカプセル＋光の帯）。
static func flying_car(parent: Node, color: Color) -> Node3D:
	var n := Node3D.new()
	parent.add_child(n)
	var cap := CapsuleMesh.new()
	cap.radius = 0.7
	cap.height = 3.2
	cap.radial_segments = 10
	cap.rings = 3
	LevelKit.mesh(n, cap, Vector3.ZERO, LevelKit.mat(color, 0.0, 0.4), Vector3(90, 0, 0), Vector3(1.0, 1.0, 0.7))
	LevelKit.sphere(n, Vector3(0, 0.35, -0.3), 0.55, C_GLASS, Vector3(1.0, 0.7, 1.5), 8)
	glow_box(n, Vector3(0, -0.15, 0), Vector3(1.5, 0.12, 2.6), C_CYAN, 2.2)
	return n


## 静的な装飾を材質ごとに1つのメッシュへまとめる（Label3D・粒子・当たり判定はそのまま残る）。
## 動かすノードには meta "no_merge" を付ける。
static func merge_static(root: Node3D, shadows: bool = true) -> int:
	var groups := {}
	var inv := root.global_transform.affine_inverse()
	var stack: Array[Node] = [root]
	var originals: Array[MeshInstance3D] = []
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		if node.has_meta("no_merge"):
			continue
		for c in node.get_children():
			stack.append(c)
		var mi := node as MeshInstance3D
		if mi == null or mi.mesh == null or mi.material_override == null or not mi.visible:
			continue
		if mi.mesh is TextMesh:
			continue
		var mat := mi.material_override
		if not groups.has(mat):
			groups[mat] = SurfaceTool.new()
			(groups[mat] as SurfaceTool).begin(Mesh.PRIMITIVE_TRIANGLES)
		var st: SurfaceTool = groups[mat]
		var xf := inv * mi.global_transform
		for s in mi.mesh.get_surface_count():
			st.append_from(mi.mesh, s, xf)
		originals.append(mi)
	for mi in originals:
		mi.get_parent().remove_child(mi)
		mi.queue_free()
	for mat in groups:
		var st: SurfaceTool = groups[mat]
		var am := st.commit()
		var out := MeshInstance3D.new()
		out.mesh = am
		out.material_override = mat
		var transparent: bool = mat is StandardMaterial3D and (mat as StandardMaterial3D).transparency != BaseMaterial3D.TRANSPARENCY_DISABLED
		var glowing: bool = mat is StandardMaterial3D and (mat as StandardMaterial3D).emission_enabled
		var cast := shadows and not transparent and not glowing and not (mat is ShaderMaterial)
		out.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		out.name = "Merged"
		root.add_child(out)
	return groups.size()
