extends RefCounted
## 2026年なんばの景観パーツ（手続き生成）。present_canal.gd から preload して使う。
## 外部素材は使わず、テクスチャは実行時に Image へ描く。
## 同じ形の小物は Batch（MultiMesh）で1回の描画にまとめ、Web版の描画負荷を抑える。

static var _cache: Dictionary = {}


# ================================================================ 一括描画

## 同じメッシュを色・大きさ・向き違いで並べ、1つの MultiMesh にまとめる。
## collide=true の要素は、共有の StaticBody3D に当たり判定の箱を足す。
class Batch:
	var parent: Node3D
	var mesh: Mesh
	var material: Material
	var shadows := true
	var xforms: Array[Transform3D] = []
	var colors := PackedColorArray()
	var body: StaticBody3D = null

	func _init(p_parent: Node3D, p_mesh: Mesh, p_material: Material, p_shadows: bool = true) -> void:
		parent = p_parent
		mesh = p_mesh
		material = p_material
		shadows = p_shadows

	func add(pos: Vector3, size: Vector3, color: Color, rot_deg: Vector3 = Vector3.ZERO, collide: bool = false) -> void:
		var b := Basis.from_euler(rot_deg * (PI / 180.0))
		xforms.append(Transform3D(b * Basis.from_scale(size), pos))
		colors.append(color)
		if collide:
			collider(pos, size, rot_deg)

	## 見えない当たり判定だけを足す（坂道・柵など）。
	func collider(pos: Vector3, size: Vector3, rot_deg: Vector3 = Vector3.ZERO) -> void:
		if body == null:
			body = StaticBody3D.new()
			body.collision_layer = LevelKit.LAYER_WORLD
			body.collision_mask = 0
			parent.add_child(body)
		var cs := CollisionShape3D.new()
		var sh := BoxShape3D.new()
		sh.size = size
		cs.shape = sh
		cs.transform = Transform3D(Basis.from_euler(rot_deg * (PI / 180.0)), pos)
		body.add_child(cs)

	func count() -> int:
		return xforms.size()

	func flush() -> MultiMeshInstance3D:
		if xforms.is_empty():
			return null
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = mesh
		mm.instance_count = xforms.size()
		for i in xforms.size():
			mm.set_instance_transform(i, xforms[i])
			mm.set_instance_color(i, colors[i])
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = material
		if not shadows:
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		parent.add_child(mmi)
		xforms.clear()
		colors.clear()
		return mmi


static func unit_box() -> BoxMesh:
	if not _cache.has("m_box"):
		var bm := BoxMesh.new()
		bm.size = Vector3.ONE
		_cache["m_box"] = bm
	return _cache["m_box"]


static func unit_cyl(segments: int = 10) -> CylinderMesh:
	var key := "m_cyl%d" % segments
	if not _cache.has(key):
		var cm := CylinderMesh.new()
		cm.top_radius = 0.5
		cm.bottom_radius = 0.5
		cm.height = 1.0
		cm.radial_segments = segments
		cm.rings = 1
		_cache[key] = cm
	return _cache[key]


static func unit_sphere(segments: int = 10) -> SphereMesh:
	var key := "m_sph%d" % segments
	if not _cache.has(key):
		var sm := SphereMesh.new()
		sm.radius = 0.5
		sm.height = 1.0
		sm.radial_segments = segments
		sm.rings = maxi(4, segments / 2)
		_cache[key] = sm
	return _cache[key]


# ================================================================ 材質

## インスタンス色（MultiMesh）をそのまま色に使う材質。
static func vc_mat(unshaded: bool = false, rough: float = 0.85) -> StandardMaterial3D:
	var key := "vc|%s|%.2f" % [unshaded, rough]
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	m.roughness = rough
	if unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	else:
		m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT_WRAP
	_cache[key] = m
	return m


## 世界座標で模様を貼る材質（石畳・石垣など。箱の大きさで模様が伸びない）。
static func tri_mat(key: String, tex: Texture2D, meters: float, tint: Color = Color.WHITE, double_sided: bool = false) -> StandardMaterial3D:
	var k := "tri|" + key
	if _cache.has(k):
		return _cache[k]
	var m := StandardMaterial3D.new()
	m.albedo_texture = tex
	m.albedo_color = tint
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_triplanar_sharpness = 6.0
	m.uv1_scale = Vector3.ONE / meters
	m.roughness = 0.92
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT_WRAP
	if double_sided:
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_cache[k] = m
	return m


## 画像を1枚そのまま貼る材質（構想図・絵図・QR）。
static func tex_mat(key: String, tex: Texture2D, nearest: bool = false, emission: float = 0.0) -> StandardMaterial3D:
	var k := "tex|" + key
	if _cache.has(k):
		return _cache[k]
	var m := StandardMaterial3D.new()
	m.albedo_texture = tex
	m.roughness = 0.7
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT_WRAP
	if nearest:
		m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	if emission > 0.0:
		m.emission_enabled = true
		m.emission_texture = tex
		m.emission = Color.WHITE
		m.emission_energy_multiplier = emission
	_cache[k] = m
	return m


## ビルの外壁：インスタンス色の壁に、色の付かない窓ガラスを重ねる（MultiMesh 1回で全ビル）。
static func building_mat() -> ShaderMaterial:
	if _cache.has("building"):
		return _cache["building"]
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode diffuse_lambert_wrap;
uniform sampler2D facade : source_color, filter_linear_mipmap, repeat_enable;
uniform float cell = 3.0;
varying vec3 wpos;
varying vec3 wnrm;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}
void fragment() {
	vec3 base = pow(COLOR.rgb, vec3(2.2));
	vec3 n = abs(wnrm);
	if (n.y > 0.6) {
		ALBEDO = base * 0.62;
		ROUGHNESS = 0.95;
	} else {
		vec2 uv = (n.x > n.z) ? wpos.zy : wpos.xy;
		vec4 t = texture(facade, vec2(uv.x, -uv.y) / cell);
		vec3 glass = mix(vec3(0.07, 0.13, 0.22), vec3(0.36, 0.52, 0.72), t.g);
		ALBEDO = mix(base * t.r, glass, t.a);
		ROUGHNESS = mix(0.9, 0.18, t.a);
		SPECULAR = mix(0.2, 0.8, t.a);
	}
}
"""
	var m := ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("facade", window_tex())
	_cache["building"] = m
	return m


## 大型ビジョン（色が流れる電光掲示板）。
static func screen_mat() -> ShaderMaterial:
	if _cache.has("screen"):
		return _cache["screen"]
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, shadows_disabled;
void fragment() {
	float t = TIME * 0.25;
	vec3 c = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + UV.x * 0.7 - UV.y * 0.3 + t));
	float scan = 0.92 + 0.08 * sin(UV.y * 260.0);
	float dots = 0.85 + 0.15 * step(0.35, fract(UV.x * 90.0)) * step(0.35, fract(UV.y * 50.0));
	ALBEDO = mix(c, vec3(0.08, 0.12, 0.4), 0.3) * scan * dots;
}
"""
	var m := ShaderMaterial.new()
	m.shader = sh
	_cache["screen"] = m
	return m


## 流れ落ちる水（排水口の小さな滝）。QuadMesh 用。
static func waterfall_mat() -> ShaderMaterial:
	if _cache.has("waterfall"):
		return _cache["waterfall"]
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_never;
void fragment() {
	float s = fract(UV.y * 2.5 - TIME * 1.9 + sin(UV.x * 23.0) * 0.12);
	float streak = smoothstep(0.0, 0.45, s) * (1.0 - smoothstep(0.55, 1.0, s));
	float lanes = 0.55 + 0.45 * sin(UV.x * 37.0 + 1.3);
	vec3 c = mix(vec3(0.45, 0.8, 0.92), vec3(1.0), streak * lanes * 0.8);
	ALBEDO = c;
	float edge = smoothstep(0.0, 0.12, UV.x) * smoothstep(1.0, 0.88, UV.x);
	ALPHA = 0.82 * edge;
}
"""
	var m := ShaderMaterial.new()
	m.shader = sh
	_cache["waterfall"] = m
	return m


## IDO の反応範囲（地面の柔らかく光る輪）。strength を毎フレーム変える。
static func ring_mat(tint: Color) -> ShaderMaterial:
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, shadows_disabled, depth_draw_never;
uniform vec4 tint : source_color = vec4(0.4, 0.95, 1.0, 1.0);
uniform float strength = 0.0;
void fragment() {
	vec2 p = UV - vec2(0.5);
	float r = length(p) * 2.0;
	float ring = smoothstep(0.78, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
	float wave = 0.5 + 0.5 * sin(TIME * 3.0 - r * 9.0);
	float fill = (1.0 - smoothstep(0.1, 0.9, r)) * 0.22 * wave;
	float dash = 0.65 + 0.35 * step(0.5, fract(atan(p.y, p.x) * 3.8197 + TIME * 0.35));
	ALBEDO = tint.rgb;
	ALPHA = clamp((ring * 1.4 * dash + fill) * strength, 0.0, 1.0);
}
"""
	var m := ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("tint", tint)
	return m


# ================================================================ メッシュ

## 石造りのアーチ橋の本体（側面＋アーチの内側）。x 方向の幅 w、z 方向に架かる。
## 路面の高さ：中央 |z|<flat_z で top_y、そこから end_z で 0 へ下がる。路面の厚み slab_t の下までを作る。
## アーチ：|z|<ch の範囲で spring_y から crown_y まで楕円で持ち上がる。
static func arch_bridge_mesh(w: float, end_z: float, flat_z: float, top_y: float, slab_t: float, ch: float, spring_y: float, crown_y: float, segs: int = 16) -> ArrayMesh:
	var zs: Array[float] = [-end_z, end_z, -flat_z, flat_z]
	for i in segs + 1:
		zs.append(ch * cos(PI - PI * float(i) / segs))
	zs.sort()
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hx := w * 0.5
	for i in zs.size() - 1:
		var z0: float = zs[i]
		var z1: float = zs[i + 1]
		if z1 - z0 < 0.001:
			continue
		var b0 := _arch_bottom(z0, ch, spring_y, crown_y)
		var b1 := _arch_bottom(z1, ch, spring_y, crown_y)
		var t0 := _deck_top(z0, end_z, flat_z, top_y) - slab_t
		var t1 := _deck_top(z1, end_z, flat_z, top_y) - slab_t
		# 両側面
		for sx in [-1.0, 1.0]:
			var x: float = hx * sx
			var n := Vector3(sx, 0, 0)
			_quad(st, Vector3(x, b0, z0), Vector3(x, t0, z0), Vector3(x, t1, z1), Vector3(x, b1, z1), n)
		# アーチの内側（下面）
		if absf(z0) < ch + 0.001 and absf(z1) < ch + 0.001:
			var tan := Vector3(0, b1 - b0, z1 - z0).normalized()
			var n2 := Vector3(0, -tan.z, tan.y)
			_quad(st, Vector3(-hx, b0, z0), Vector3(hx, b0, z0), Vector3(hx, b1, z1), Vector3(-hx, b1, z1), n2)
	return st.commit()


static func _arch_bottom(z: float, ch: float, spring_y: float, crown_y: float) -> float:
	if absf(z) >= ch:
		return spring_y
	return spring_y + (crown_y - spring_y) * sqrt(maxf(0.0, 1.0 - (z / ch) * (z / ch)))


static func _deck_top(z: float, end_z: float, flat_z: float, top_y: float) -> float:
	var az := absf(z)
	if az <= flat_z:
		return top_y
	return top_y * clampf((end_z - az) / (end_z - flat_z), 0.0, 1.0)


## 法線 n の向きから見て表になる順で四角形を足す（Godot は時計回りが表）。
static func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3) -> void:
	_tri(st, a, b, c, n)
	_tri(st, a, c, d, n)


static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, n: Vector3) -> void:
	var fn := (c - a).cross(b - a)
	if fn.dot(n) < 0.0:
		var tmp := b
		b = c
		c = tmp
	st.set_normal(n)
	st.add_vertex(a)
	st.set_normal(n)
	st.add_vertex(b)
	st.set_normal(n)
	st.add_vertex(c)


# ================================================================ テクスチャ

static func _finish(key: String, img: Image, mipmaps: bool = true) -> ImageTexture:
	if mipmaps:
		img.generate_mipmaps()
	var t := ImageTexture.create_from_image(img)
	_cache[key] = t
	return t


## 石畳（2m 四方に 0.5m×0.25m の敷石。半分ずつずらす）。
static func paving_tex() -> ImageTexture:
	if _cache.has("t_paving"):
		return _cache["t_paving"]
	var img := Image.create(128, 128, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 2026
	img.fill(Color(0.46, 0.43, 0.4))
	for row in 8:
		var off := 16 if row % 2 == 1 else 0
		for col in 5:
			var v := rng.randf_range(-0.06, 0.05)
			var warm := rng.randf_range(0.0, 0.04)
			var c := Color(0.8 + v + warm, 0.76 + v, 0.7 + v - warm)
			var x0 := col * 32 - off
			for y in range(row * 16 + 1, row * 16 + 16):
				for x in range(x0 + 1, x0 + 32):
					var px := posmod(x, 128)
					img.set_pixel(px, y, c)
	for i in 1400:
		var x := rng.randi_range(0, 127)
		var y := rng.randi_range(0, 127)
		var c := img.get_pixel(x, y)
		img.set_pixel(x, y, c.darkened(rng.randf_range(0.03, 0.12)) if rng.randf() < 0.7 else c.lightened(0.06))
	return _finish("t_paving", img)


## 石垣（2m 四方に 1.0m×0.5m の切石）。
static func masonry_tex() -> ImageTexture:
	if _cache.has("t_masonry"):
		return _cache["t_masonry"]
	var img := Image.create(128, 128, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 1726
	img.fill(Color(0.38, 0.37, 0.35))
	for row in 4:
		var off := 32 if row % 2 == 1 else 0
		for col in 3:
			var v := rng.randf_range(-0.07, 0.06)
			var c := Color(0.66 + v, 0.64 + v, 0.6 + v)
			var x0 := col * 64 - off
			for y in range(row * 32 + 2, row * 32 + 31):
				for x in range(x0 + 2, x0 + 63):
					var px := posmod(x, 128)
					var shade := 1.0 - 0.1 * float(y - row * 32) / 32.0
					img.set_pixel(px, y, Color(c.r * shade, c.g * shade, c.b * shade))
	for i in 2200:
		var x := rng.randi_range(0, 127)
		var y := rng.randi_range(0, 127)
		var c := img.get_pixel(x, y)
		img.set_pixel(x, y, c.darkened(rng.randf_range(0.04, 0.14)))
	return _finish("t_masonry", img)


## 御影石（IDO の標石）。
static func granite_tex() -> ImageTexture:
	if _cache.has("t_granite"):
		return _cache["t_granite"]
	var img := Image.create(64, 64, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 55
	img.fill(Color(0.6, 0.6, 0.6))
	for i in 1600:
		var x := rng.randi_range(0, 63)
		var y := rng.randi_range(0, 63)
		var r := rng.randf()
		var c := Color(0.28, 0.28, 0.3) if r < 0.35 else (Color(0.82, 0.8, 0.78) if r < 0.6 else Color(0.5, 0.48, 0.47))
		img.set_pixel(x, y, c)
	return _finish("t_granite", img)


## 窓（3m 四方に1枚）。R=壁の陰影、G=ガラスの映り込み、A=ガラスの範囲。
static func window_tex() -> ImageTexture:
	if _cache.has("t_window"):
		return _cache["t_window"]
	var img := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.95, 0.0, 0.0, 0.0))
	# 階の境目の帯
	img.fill_rect(Rect2i(0, 60, 64, 4), Color(0.78, 0.0, 0.0, 0.0))
	# 窓枠
	img.fill_rect(Rect2i(10, 12, 44, 38), Color(0.7, 0.0, 0.0, 0.0))
	# ガラス（上ほど明るい映り込み、斜めの光）
	for y in range(14, 48):
		for x in range(12, 52):
			if x == 31 or x == 32:
				continue
			var g := 0.25 + 0.45 * (1.0 - float(y - 14) / 34.0)
			if absi((x - 12) - (y - 14) - 6) < 4:
				g += 0.35
			img.set_pixel(x, y, Color(0.0, clampf(g, 0.0, 1.0), 0.0, 1.0))
	# 窓台
	img.fill_rect(Rect2i(8, 50, 48, 3), Color(0.62, 0.0, 0.0, 0.0))
	return _finish("t_window", img)


## QR コード風の模様（読み取れる必要はない）。外周2マスの余白つき 29×29。
static func qr_tex() -> ImageTexture:
	if _cache.has("t_qr"):
		return _cache["t_qr"]
	var n := 25
	var q := 2
	var img := Image.create(n + q * 2, n + q * 2, false, Image.FORMAT_RGB8)
	img.fill(Color(0.97, 0.96, 0.92))
	var ink := Color(0.06, 0.06, 0.07)
	var rng := RandomNumberGenerator.new()
	rng.seed = 12026
	var finder := [Vector2i(0, 0), Vector2i(n - 7, 0), Vector2i(0, n - 7)]
	for y in n:
		for x in n:
			var reserved := false
			for f in finder:
				var fp: Vector2i = f
				if x >= fp.x - 1 and x <= fp.x + 7 and y >= fp.y - 1 and y <= fp.y + 7:
					reserved = true
			if reserved:
				continue
			var on := rng.randf() < 0.48
			if y == 6:
				on = x % 2 == 0
			elif x == 6:
				on = y % 2 == 0
			if on:
				img.set_pixel(x + q, y + q, ink)
	for f in finder:
		var fp: Vector2i = f
		for y in 7:
			for x in 7:
				var ring := x == 0 or y == 0 or x == 6 or y == 6
				var core := x >= 2 and x <= 4 and y >= 2 and y <= 4
				if ring or core:
					img.set_pixel(fp.x + x + q, fp.y + y + q, ink)
	# 位置合わせの小さな四角
	for y in 5:
		for x in 5:
			var ring2 := x == 0 or y == 0 or x == 4 or y == 4
			var c2 := ink if ring2 or (x == 2 and y == 2) else Color(0.97, 0.96, 0.92)
			img.set_pixel(n - 9 + x + q, n - 9 + y + q, c2)
	return _finish("t_qr", img, false)


## マツイ社長の構想図（青焼き風）：ネクマックスの線画と寸法線・メモ。
static func blueprint_tex() -> ImageTexture:
	if _cache.has("t_blueprint"):
		return _cache["t_blueprint"]
	var img := Image.create(256, 176, false, Image.FORMAT_RGB8)
	img.fill(Color(0.07, 0.2, 0.45))
	var grid := Color(0.13, 0.29, 0.56)
	for x in range(0, 256, 16):
		_line(img, Vector2(x, 0), Vector2(x, 175), grid)
	for y in range(0, 176, 16):
		_line(img, Vector2(0, y), Vector2(255, y), grid)
	var w := Color(0.9, 0.95, 1.0)
	var soft := Color(0.62, 0.78, 0.98)
	_rect(img, Rect2i(5, 5, 246, 166), w, 1)
	_rect(img, Rect2i(8, 8, 240, 160), soft, 1)
	# 頭・顔・目・口
	var hc := Vector2(104, 66)
	_ellipse(img, hc, 36, 33, w, 2)
	_ellipse(img, hc + Vector2(0, 5), 27, 24, w, 2)
	_fill_ellipse(img, hc + Vector2(-9, 1), 2.6, 6.0, w)
	_fill_ellipse(img, hc + Vector2(9, 1), 2.6, 6.0, w)
	_ellipse(img, hc + Vector2(0, 12), 8, 5, w, 2, 0.15 * PI, 0.85 * PI)
	# 耳とアンテナ
	_ellipse(img, hc + Vector2(-39, 2), 6, 9, w, 2)
	_ellipse(img, hc + Vector2(39, 2), 6, 9, w, 2)
	_line(img, hc + Vector2(-12, -32), hc + Vector2(-22, -52), w, 2)
	_line(img, hc + Vector2(12, -32), hc + Vector2(22, -52), w, 2)
	_ellipse(img, hc + Vector2(-23, -55), 3, 3, w, 2)
	_ellipse(img, hc + Vector2(23, -55), 3, 3, w, 2)
	# 胴体・胸のマーク・腕（右手はクロー）・脚と大きな靴
	var bc := Vector2(104, 122)
	_ellipse(img, bc, 21, 18, w, 2)
	_rect(img, Rect2i(96, 116, 16, 7), soft, 1)
	_line(img, bc + Vector2(-19, -6), bc + Vector2(-36, 8), w, 2)
	_ellipse(img, bc + Vector2(-39, 11), 5, 5, w, 2)
	_line(img, bc + Vector2(19, -6), bc + Vector2(38, -18), w, 2)
	var cp := bc + Vector2(41, -20)
	_line(img, cp, cp + Vector2(10, -9), w, 2)
	_line(img, cp, cp + Vector2(13, 0), w, 2)
	_line(img, cp, cp + Vector2(10, 9), w, 2)
	_ellipse(img, cp + Vector2(4, 0), 15, 15, soft, 1, -0.6, 0.6)
	_line(img, bc + Vector2(-8, 17), bc + Vector2(-10, 28), w, 2)
	_line(img, bc + Vector2(8, 17), bc + Vector2(10, 28), w, 2)
	_ellipse(img, bc + Vector2(-13, 32), 10, 5, w, 2)
	_ellipse(img, bc + Vector2(13, 32), 10, 5, w, 2)
	# 寸法線
	_line(img, Vector2(40, 12), Vector2(40, 160), soft, 1)
	_line(img, Vector2(34, 12), Vector2(46, 12), soft, 1)
	_line(img, Vector2(34, 160), Vector2(46, 160), soft, 1)
	_line(img, Vector2(40, 12), Vector2(37, 18), soft, 1)
	_line(img, Vector2(40, 12), Vector2(43, 18), soft, 1)
	_line(img, Vector2(40, 160), Vector2(37, 154), soft, 1)
	_line(img, Vector2(40, 160), Vector2(43, 154), soft, 1)
	# メモ（文字の代わりの線）と引き出し線
	var lens := [56, 40, 62, 34, 50, 44, 58]
	for i in lens.size():
		var y := 24 + i * 11
		_line(img, Vector2(172, y), Vector2(172 + int(lens[i]), y), soft if i % 3 else w, 1)
	_line(img, cp + Vector2(14, 0), Vector2(170, 46), soft, 1)
	_line(img, hc + Vector2(30, -18), Vector2(170, 24), soft, 1)
	# 表題欄
	_rect(img, Rect2i(164, 128, 80, 36), w, 1)
	_line(img, Vector2(164, 140), Vector2(244, 140), soft, 1)
	_line(img, Vector2(206, 140), Vector2(206, 164), soft, 1)
	_line(img, Vector2(170, 134), Vector2(230, 134), w, 1)
	return _finish("t_blueprint", img)


## 源兵衛の水門絵図（写し）：和紙に墨で水門・大歯車・歯止め。
static func drawing_tex() -> ImageTexture:
	if _cache.has("t_drawing"):
		return _cache["t_drawing"]
	var img := Image.create(256, 192, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 300
	var paper := Color(0.93, 0.85, 0.66)
	for y in 192:
		for x in 256:
			var e := minf(minf(x, 255 - x), minf(y, 191 - y))
			var k := clampf(e / 18.0, 0.0, 1.0)
			img.set_pixel(x, y, paper.darkened(0.22 * (1.0 - k)))
	for i in 900:
		var x := rng.randi_range(0, 255)
		var y := rng.randi_range(0, 191)
		img.set_pixel(x, y, img.get_pixel(x, y).darkened(rng.randf_range(0.03, 0.09)))
	var ink := Color(0.2, 0.13, 0.08)
	var blue := Color(0.25, 0.36, 0.55)
	# 柱・梁・笠木
	_rect(img, Rect2i(44, 42, 14, 112), ink, 2)
	_rect(img, Rect2i(146, 42, 14, 112), ink, 2)
	_rect(img, Rect2i(36, 32, 132, 12), ink, 2)
	_line(img, Vector2(30, 28), Vector2(174, 28), ink, 2)
	# 堰板（板の継ぎ目）
	_rect(img, Rect2i(58, 72, 88, 58), ink, 2)
	for y in range(82, 130, 10):
		_line(img, Vector2(60, y), Vector2(144, y), ink, 1)
	# 水
	for row in 4:
		var yy := 140.0 + row * 9.0
		var prev := Vector2(20, yy)
		for x in range(24, 236, 4):
			var p := Vector2(x, yy + sin(x * 0.12 + row) * 2.0)
			_line(img, prev, p, blue, 1)
			prev = p
	# 大歯車（歯・輻・軸）
	var gc := Vector2(204, 92)
	_ellipse(img, gc, 30, 30, ink, 2)
	_ellipse(img, gc, 7, 7, ink, 2)
	for i in 12:
		var a := TAU * i / 12.0
		_line(img, gc + Vector2(cos(a), sin(a)) * 30.0, gc + Vector2(cos(a), sin(a)) * 37.0, ink, 3)
	for i in 3:
		var a := PI * i / 3.0
		_line(img, gc - Vector2(cos(a), sin(a)) * 28.0, gc + Vector2(cos(a), sin(a)) * 28.0, ink, 1)
	# 歯止め（赤で強調）と綱
	var red := Color(0.72, 0.16, 0.1)
	_ellipse(img, Vector2(232, 50), 3, 3, red, 2)
	_line(img, Vector2(232, 50), Vector2(222, 64), red, 3)
	_line(img, Vector2(236, 46), Vector2(246, 34), red, 1)
	_line(img, gc + Vector2(-8, -29), Vector2(168, 36), ink, 1)
	# 縦書きの注記（文字の代わりの短い線）
	for col in 3:
		var x := 14 + col * 8
		for y in range(30, 128, 9):
			if rng.randf() < 0.85:
				_line(img, Vector2(x, y), Vector2(x, y + 5), ink, 1)
	for y in range(18, 60, 9):
		_line(img, Vector2(246, y + 10), Vector2(246, y + 15), ink, 1)
	# 落款
	img.fill_rect(Rect2i(212, 150, 22, 22), red)
	_rect(img, Rect2i(215, 153, 16, 16), Color(0.95, 0.75, 0.6), 1)
	return _finish("t_drawing", img)


# ---------------------------------------------------------------- 描画の下請け

static func _plot(img: Image, x: int, y: int, c: Color, w: int = 1) -> void:
	var iw := img.get_width()
	var ih := img.get_height()
	var r := w >> 1
	for dy in w:
		for dx in w:
			var px := x + dx - r
			var py := y + dy - r
			if px >= 0 and py >= 0 and px < iw and py < ih:
				img.set_pixel(px, py, c)


static func _line(img: Image, a: Vector2, b: Vector2, c: Color, w: int = 1) -> void:
	var n := int(maxf(absf(b.x - a.x), absf(b.y - a.y))) + 1
	for i in n + 1:
		var p := a.lerp(b, float(i) / n)
		_plot(img, int(round(p.x)), int(round(p.y)), c, w)


static func _rect(img: Image, r: Rect2i, c: Color, w: int = 1) -> void:
	var a := Vector2(r.position)
	var b := Vector2(r.position + r.size)
	_line(img, a, Vector2(b.x, a.y), c, w)
	_line(img, Vector2(b.x, a.y), b, c, w)
	_line(img, b, Vector2(a.x, b.y), c, w)
	_line(img, Vector2(a.x, b.y), a, c, w)


static func _ellipse(img: Image, cen: Vector2, rx: float, ry: float, c: Color, w: int = 1, a0: float = 0.0, a1: float = TAU) -> void:
	var n := int(maxf(rx, ry) * 7.0) + 8
	for i in n + 1:
		var a := lerpf(a0, a1, float(i) / n)
		_plot(img, int(round(cen.x + cos(a) * rx)), int(round(cen.y + sin(a) * ry)), c, w)


static func _fill_ellipse(img: Image, cen: Vector2, rx: float, ry: float, c: Color) -> void:
	for y in range(int(cen.y - ry), int(cen.y + ry) + 1):
		for x in range(int(cen.x - rx), int(cen.x + rx) + 1):
			var dx := (x - cen.x) / rx
			var dy := (y - cen.y) / ry
			if dx * dx + dy * dy <= 1.0:
				_plot(img, x, y, c)
