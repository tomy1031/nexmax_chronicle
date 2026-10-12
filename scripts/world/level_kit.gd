class_name LevelKit
extends RefCounted
## 簡易形状でステージを組み立てる道具（仕様 §14.4：最初は簡易形状、描画負荷を抑える）。
## マテリアルは色ごとに共有してドローコールと生成コストを減らす。

const LAYER_WORLD := 1
const LAYER_PLAYER := 2
const LAYER_ENEMY := 4

static var _mats: Dictionary = {}
static var _water_shader: Shader
static var _outline_mat: StandardMaterial3D
static var _font: Font


static func font() -> Font:
	if _font == null:
		_font = load("res://assets/fonts/NotoSansJP-Regular.ttf")
	return _font


## 色ごとに共有するトゥーン調マテリアル。
static func mat(color: Color, emission: float = 0.0, rough: float = 0.85, metal: float = 0.0) -> StandardMaterial3D:
	var key := "%s|%.2f|%.2f|%.2f" % [color.to_html(), emission, rough, metal]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = metal
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT_WRAP
	if emission > 0.0:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = emission
	if color.a < 0.999:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mats[key] = m
	return m


## キャラクター用：トゥーン陰影＋縁の光＋黒い輪郭線。
static func char_mat(color: Color, emission: float = 0.0) -> StandardMaterial3D:
	var key := "char|%s|%.2f" % [color.to_html(), emission]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.55
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	m.specular_mode = BaseMaterial3D.SPECULAR_TOON
	m.rim_enabled = true
	m.rim = 0.35
	m.rim_tint = 0.6
	if emission > 0.0:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = emission
	m.next_pass = outline_mat()
	_mats[key] = m
	return m


static func outline_mat() -> StandardMaterial3D:
	if _outline_mat == null:
		_outline_mat = StandardMaterial3D.new()
		_outline_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_outline_mat.albedo_color = Color(0.04, 0.05, 0.1)
		_outline_mat.cull_mode = BaseMaterial3D.CULL_FRONT
		_outline_mat.grow = true
		_outline_mat.grow_amount = 0.022
	return _outline_mat


static func unshaded(color: Color, no_depth: bool = false) -> StandardMaterial3D:
	var key := "unshaded|%s|%s" % [color.to_html(), no_depth]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = color
	if color.a < 0.999:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.no_depth_test = no_depth
	if no_depth:
		m.render_priority = 10
	_mats[key] = m
	return m


static func glow(color: Color, energy: float = 2.0) -> StandardMaterial3D:
	return mat(color, energy, 0.5)


# ---------------------------------------------------------------- 形状

static func mesh(parent: Node, m: Mesh, pos: Vector3, material: Material, rot_deg: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = material
	mi.position = pos
	mi.rotation_degrees = rot_deg
	mi.scale = scl
	parent.add_child(mi)
	return mi


## 当たり判定つきの箱（足場・壁）。
static func box(parent: Node, pos: Vector3, size: Vector3, color: Color, collide: bool = true, rot_deg: Vector3 = Vector3.ZERO, emission: float = 0.0) -> Node3D:
	var bm := BoxMesh.new()
	bm.size = size
	var material := mat(color, emission)
	if not collide:
		return mesh(parent, bm, pos, material, rot_deg)
	var body := StaticBody3D.new()
	body.position = pos
	body.rotation_degrees = rot_deg
	body.collision_layer = LAYER_WORLD
	body.collision_mask = 0
	parent.add_child(body)
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	mesh(body, bm, Vector3.ZERO, material)
	return body


## 見えない壁（落下防止・範囲制限）。
static func wall(parent: Node, pos: Vector3, size: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = pos
	body.collision_layer = LAYER_WORLD
	parent.add_child(body)
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	return body


static func cyl(parent: Node, pos: Vector3, radius: float, height: float, color: Color, collide: bool = false, rot_deg: Vector3 = Vector3.ZERO, segments: int = 16, top_radius: float = -1.0) -> Node3D:
	var cm := CylinderMesh.new()
	cm.bottom_radius = radius
	cm.top_radius = radius if top_radius < 0.0 else top_radius
	cm.height = height
	cm.radial_segments = segments
	cm.rings = 1
	var material := mat(color)
	if not collide:
		return mesh(parent, cm, pos, material, rot_deg)
	var body := StaticBody3D.new()
	body.position = pos
	body.rotation_degrees = rot_deg
	body.collision_layer = LAYER_WORLD
	parent.add_child(body)
	var cs := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = maxf(radius, cm.top_radius)
	shape.height = height
	cs.shape = shape
	body.add_child(cs)
	mesh(body, cm, Vector3.ZERO, material)
	return body


static func sphere(parent: Node, pos: Vector3, radius: float, color: Color, scl: Vector3 = Vector3.ONE, segments: int = 16) -> MeshInstance3D:
	var sm := SphereMesh.new()
	sm.radius = radius
	sm.height = radius * 2.0
	sm.radial_segments = segments
	sm.rings = maxi(4, segments / 2)
	return mesh(parent, sm, pos, mat(color), Vector3.ZERO, scl)


static func cone(parent: Node, pos: Vector3, radius: float, height: float, color: Color, segments: int = 4, rot_deg: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.bottom_radius = radius
	cm.top_radius = 0.0
	cm.height = height
	cm.radial_segments = segments
	cm.rings = 1
	return mesh(parent, cm, pos, mat(color), rot_deg)


## 和風・寄棟の屋根（4角錐を平たくしたもの）。
static func roof(parent: Node, pos: Vector3, width: float, depth: float, height: float, color: Color) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.bottom_radius = 0.7071
	cm.top_radius = 0.12
	cm.height = 1.0
	cm.radial_segments = 4
	cm.rings = 1
	return mesh(parent, cm, pos, mat(color), Vector3(0, 45, 0), Vector3(width, height, depth))


static func label(parent: Node, text: String, pos: Vector3, size: int = 64, color: Color = Color.WHITE, billboard: bool = false, rot_deg: Vector3 = Vector3.ZERO, outline: Color = Color(0, 0, 0, 0.0)) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font = font()
	l.font_size = size
	l.pixel_size = 0.01
	l.modulate = color
	l.position = pos
	l.rotation_degrees = rot_deg
	l.double_sided = false
	if outline.a > 0.0:
		l.outline_size = maxi(4, size / 8)
		l.outline_modulate = outline
	else:
		l.outline_size = 0
	if billboard:
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	parent.add_child(l)
	return l


## 縦書きの看板文字。
static func vlabel(parent: Node, text: String, pos: Vector3, size: int, color: Color, rot_deg: Vector3 = Vector3.ZERO) -> Label3D:
	var chars := PackedStringArray()
	for ch in text:
		chars.append(ch)
	var l := label(parent, "\n".join(chars), pos, size, color, false, rot_deg)
	l.line_spacing = -size * 0.15
	return l


## 歯車のメッシュ（トーラス＋歯）。軸は local Z。
static func gear(parent: Node, pos: Vector3, radius: float, thickness: float, color: Color, teeth: int = 10, tooth_color: Color = Color(-1, 0, 0)) -> Node3D:
	var g := Node3D.new()
	g.position = pos
	parent.add_child(g)
	var tc := color if tooth_color.r < 0.0 else tooth_color
	var body := CylinderMesh.new()
	body.top_radius = radius * 0.86
	body.bottom_radius = radius * 0.86
	body.height = thickness
	body.radial_segments = 20
	body.rings = 1
	mesh(g, body, Vector3.ZERO, mat(color), Vector3(90, 0, 0))
	var hub := CylinderMesh.new()
	hub.top_radius = radius * 0.24
	hub.bottom_radius = radius * 0.24
	hub.height = thickness * 1.5
	hub.radial_segments = 12
	mesh(g, hub, Vector3.ZERO, mat(color.darkened(0.35), 0.0, 0.4, 0.5), Vector3(90, 0, 0))
	var tooth := BoxMesh.new()
	tooth.size = Vector3(radius * 0.3, radius * 0.3, thickness * 1.02)
	for i in teeth:
		var a := TAU * i / teeth
		var t := mesh(g, tooth, Vector3(cos(a), sin(a), 0) * radius * 0.92, mat(tc))
		t.rotation.z = a
	# 輻（スポーク）で木の大歯車らしさを出す
	var spoke := BoxMesh.new()
	spoke.size = Vector3(radius * 1.5, radius * 0.12, thickness * 1.15)
	for i in 3:
		var s := mesh(g, spoke, Vector3.ZERO, mat(color.darkened(0.2)))
		s.rotation.z = PI * i / 3.0
	return g


## ダイヤ形（八面体）のメッシュ。目標マーカーや時の結晶に使う。
static func diamond_mesh(radius: float = 0.3) -> SphereMesh:
	var sm := SphereMesh.new()
	sm.radius = radius
	sm.height = radius * 2.6
	sm.radial_segments = 4
	sm.rings = 1
	return sm


# ---------------------------------------------------------------- 水面

static func water(parent: Node, center: Vector3, size: Vector2, deep: Color, shallow: Color, flow: Vector2 = Vector2(0.0, 0.0)) -> MeshInstance3D:
	var pm := PlaneMesh.new()
	pm.size = size
	pm.subdivide_width = int(size.x / 2.0)
	pm.subdivide_depth = int(size.y / 2.0)
	var sm := ShaderMaterial.new()
	sm.shader = _get_water_shader()
	sm.set_shader_parameter("deep", deep)
	sm.set_shader_parameter("shallow", shallow)
	sm.set_shader_parameter("flow", flow)
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	mi.material_override = sm
	mi.position = center
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func _get_water_shader() -> Shader:
	if _water_shader == null:
		_water_shader = Shader.new()
		_water_shader.code = """
shader_type spatial;
render_mode blend_mix, cull_disabled, specular_schlick_ggx;
uniform vec4 deep : source_color = vec4(0.05, 0.3, 0.5, 1.0);
uniform vec4 shallow : source_color = vec4(0.3, 0.75, 0.9, 1.0);
uniform vec2 flow = vec2(0.0, 0.0);
varying vec3 wpos;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	VERTEX.y += sin(wpos.x * 0.6 + TIME * 1.6) * 0.04 + cos(wpos.z * 0.8 + TIME * 1.3) * 0.04;
}
void fragment() {
	vec2 uv = wpos.xz * 0.35 + flow * TIME;
	float w1 = sin(uv.x * 2.1 + sin(uv.y * 1.7 + TIME * 0.7) * 1.3);
	float w2 = sin(uv.y * 2.6 - TIME * 0.9 + sin(uv.x * 1.3) * 1.1);
	float bands = smoothstep(0.86, 1.0, w1 * 0.5 + w2 * 0.5 + 0.12);
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	vec3 col = mix(deep.rgb, shallow.rgb, 0.35 + 0.3 * w1 * w2);
	col = mix(col, vec3(0.95, 1.0, 1.0), bands * 0.55);
	ALBEDO = col;
	ALPHA = clamp(0.82 + fres * 0.18, 0.0, 1.0);
	ROUGHNESS = 0.08;
	SPECULAR = 0.6;
	EMISSION = col * 0.12 + vec3(bands * 0.15);
}
"""
	return _water_shader


# ---------------------------------------------------------------- 環境

static func environment(parent: Node, sky_top: Color, sky_horizon: Color, ground: Color, sun_color: Color, sun_energy: float, sun_rot: Vector3, ambient: float = 0.55, fog: Color = Color(0, 0, 0, 0)) -> DirectionalLight3D:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var psm := ProceduralSkyMaterial.new()
	psm.sky_top_color = sky_top
	psm.sky_horizon_color = sky_horizon
	psm.ground_horizon_color = sky_horizon.darkened(0.1)
	psm.ground_bottom_color = ground
	psm.sun_angle_max = 30.0
	psm.sky_curve = 0.12
	sky.sky_material = psm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = ambient
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	env.glow_enabled = true
	env.glow_intensity = 0.55
	env.glow_bloom = 0.05
	env.glow_hdr_threshold = 1.1
	if fog.a > 0.0:
		env.fog_enabled = true
		env.fog_light_color = fog
		env.fog_density = 0.006
		env.fog_sky_affect = 0.3
	we.environment = env
	parent.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = sun_color
	sun.light_energy = sun_energy
	sun.rotation_degrees = sun_rot
	sun.shadow_enabled = not Game.low_quality
	sun.directional_shadow_max_distance = 45.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.5
	parent.add_child(sun)
	return sun


## 遠景の浮島（2086年・拠点）。
static func floating_island(parent: Node, pos: Vector3, r: float) -> void:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	cone(n, Vector3(0, -r * 0.9, 0), r, r * 1.8, Color(0.55, 0.42, 0.34), 7, Vector3(180, 0, 0))
	cyl(n, Vector3(0, 0.05, 0), r, r * 0.25, Color(0.4, 0.7, 0.35), false, Vector3.ZERO, 7)
	sphere(n, Vector3(r * 0.3, r * 0.35, 0), r * 0.35, Color(0.3, 0.62, 0.3), Vector3.ONE, 8)
	sphere(n, Vector3(-r * 0.35, r * 0.25, r * 0.2), r * 0.28, Color(0.35, 0.68, 0.32), Vector3.ONE, 8)


## 桜の木（1726年）。
static func sakura(parent: Node, pos: Vector3, s: float = 1.0) -> void:
	cyl(parent, pos + Vector3(0, 1.2 * s, 0), 0.18 * s, 2.4 * s, Color(0.4, 0.27, 0.2), false, Vector3.ZERO, 6)
	var pink := Color(1.0, 0.74, 0.84)
	sphere(parent, pos + Vector3(0, 2.9 * s, 0), 1.3 * s, pink, Vector3(1.2, 0.85, 1.1), 10)
	sphere(parent, pos + Vector3(0.9 * s, 2.5 * s, 0.3 * s), 0.9 * s, pink.lightened(0.1), Vector3.ONE, 8)
	sphere(parent, pos + Vector3(-0.8 * s, 2.6 * s, -0.4 * s), 0.85 * s, pink.darkened(0.05), Vector3.ONE, 8)


static func tree(parent: Node, pos: Vector3, s: float = 1.0) -> void:
	cyl(parent, pos + Vector3(0, 1.0 * s, 0), 0.15 * s, 2.0 * s, Color(0.42, 0.3, 0.22), false, Vector3.ZERO, 6)
	sphere(parent, pos + Vector3(0, 2.5 * s, 0), 1.1 * s, Color(0.32, 0.62, 0.3), Vector3(1.0, 1.1, 1.0), 10)


## 提灯（1726年）。
static func lantern(parent: Node, pos: Vector3, color: Color = Color(1.0, 0.45, 0.3)) -> void:
	var l := sphere(parent, pos, 0.28, color, Vector3(1.0, 1.3, 1.0), 10)
	l.material_override = mat(color, 1.6, 0.6)
	cyl(parent, pos + Vector3(0, 0.38, 0), 0.16, 0.08, Color(0.15, 0.12, 0.1))
	cyl(parent, pos - Vector3(0, 0.38, 0), 0.16, 0.08, Color(0.15, 0.12, 0.1))
