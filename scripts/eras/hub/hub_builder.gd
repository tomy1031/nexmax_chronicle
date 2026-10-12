extends RefCounted
## 異次元拠点の部品（床の模様・ホログラムの地球儀・看板・クローの展示・ホログラム画面）を組み立てる道具。
## プレイイメージ08：丸い工房の床とにっこり顔の紋章、中央の地球儀と時代の画面、暖かい照明。

const SkyProps := preload("res://scripts/eras/hub/sky_props.gd")
const Motion := preload("res://scripts/eras/hub/motion.gd")

static var _floor_shader: Shader
static var _holo_shader: Shader
static var _vc_mats := {}
static var _vc_glow_shader: Shader


## 北(-Z)から時計回りの角度 θ（度）と半径から床の上の位置を返す。
static func polar(theta_deg: float, r: float, y: float = 0.0) -> Vector3:
	var t := deg_to_rad(theta_deg)
	return Vector3(sin(t) * r, y, -cos(t) * r)


## 角度 θ の位置に、正面（ローカル +Z）を中心へ向けた入れ物を置く。
static func station_root(parent: Node, theta_deg: float, r: float, node_name: String) -> Node3D:
	var n := Node3D.new()
	n.name = node_name
	n.position = polar(theta_deg, r)
	n.rotation.y = -deg_to_rad(theta_deg)
	parent.add_child(n)
	return n


## 見えない当たり判定の箱（床や棚など、カメラも止めたい固い物。LevelKit.wall はカメラを通す範囲の壁）。
static func solid(parent: Node, pos: Vector3, size: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = pos
	body.collision_layer = LevelKit.LAYER_WORLD
	body.collision_mask = 0
	parent.add_child(body)
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	return body


static func torus(parent: Node, pos: Vector3, radius: float, tube: float, material: Material, rot_deg: Vector3 = Vector3.ZERO, rings: int = 48, seg: int = 8) -> MeshInstance3D:
	var tm := TorusMesh.new()
	tm.inner_radius = radius - tube
	tm.outer_radius = radius + tube
	tm.rings = rings
	tm.ring_segments = seg
	return LevelKit.mesh(parent, tm, pos, material, rot_deg)


static func no_shadow(n: Node) -> void:
	for gi in n.find_children("*", "GeometryInstance3D", true, false):
		(gi as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if n is GeometryInstance3D:
		(n as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


# ---------------------------------------------------------------- 描画の統合

## 動かない不透明の部品を、色を頂点色に焼き込んで少数のメッシュにまとめる（色がばらばらでも1回の描画）。
## 発光・半透明・輪郭線つきの材質と、"dynamic" グループ・スクリプト付きノード（StaticBody3D を除く）の下は対象外。
## 残った同じ材質どうしは、このあと LevelKit.merge_static でまとめる。
static func merge_by_color(root: Node3D) -> int:
	var groups := {}
	var inv := root.global_transform.affine_inverse()
	_collect_by_color(root, inv, groups)
	var made := 0
	for key in groups:
		var g: Dictionary = groups[key]
		var victims: Array = g.victims
		if victims.size() < 2:
			continue
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = g.verts
		arrays[Mesh.ARRAY_NORMAL] = g.norms
		arrays[Mesh.ARRAY_COLOR] = g.cols
		arrays[Mesh.ARRAY_INDEX] = g.idx
		var am := ArrayMesh.new()
		am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		var mi := MeshInstance3D.new()
		mi.name = "ColorMerged_%d" % made
		mi.mesh = am
		mi.material_override = _vc_glow_mat(g.energy, g.rough) if g.energy > 0.0 else _vc_mat(g.rough, g.metal)
		mi.cast_shadow = g.shadow
		root.add_child(mi)
		made += 1
		for v in victims:
			(v as Node).queue_free()
	return made


static func _vc_mat(rough: float, metal: float) -> StandardMaterial3D:
	var key := "%.1f|%.1f" % [rough, metal]
	if _vc_mats.has(key):
		return _vc_mats[key]
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	m.albedo_color = Color.WHITE
	m.roughness = rough
	m.metallic = metal
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT_WRAP
	_vc_mats[key] = m
	return m


## 発光する部品用：頂点色（sRGB）をそのまま発光色にも使う材質。
static func _vc_glow_mat(energy: float, rough: float) -> ShaderMaterial:
	var key := "glow|%.1f|%.1f" % [energy, rough]
	if _vc_mats.has(key):
		return _vc_mats[key]
	if _vc_glow_shader == null:
		_vc_glow_shader = Shader.new()
		_vc_glow_shader.code = """
shader_type spatial;
render_mode diffuse_lambert_wrap;
uniform float energy = 1.0;
uniform float rough = 0.5;
void fragment() {
	vec3 s = COLOR.rgb;
	vec3 lin = mix(pow((s + vec3(0.055)) / 1.055, vec3(2.4)), s / 12.92, vec3(lessThan(s, vec3(0.04045))));
	ALBEDO = lin;
	EMISSION = lin * energy;
	ROUGHNESS = rough;
}
"""
	var m := ShaderMaterial.new()
	m.shader = _vc_glow_shader
	m.set_shader_parameter("energy", energy)
	m.set_shader_parameter("rough", rough)
	_vc_mats[key] = m
	return m


static func _skip_node(n: Node) -> bool:
	if n.is_in_group("dynamic"):
		return true
	if n is Node3D and not (n as Node3D).visible:
		return true
	if n is Npc or n is ClawTarget or n is Portal or n is CharacterBody3D or n is CPUParticles3D \
			or n is GPUParticles3D or n is Camera3D or n is Label3D:
		return true
	return n.get_script() != null and not (n is StaticBody3D)


static func _collect_by_color(node: Node, inv: Transform3D, groups: Dictionary) -> void:
	for child in node.get_children():
		if _skip_node(child):
			continue
		if child is MeshInstance3D:
			var mi := child as MeshInstance3D
			var m := mi.material_override as StandardMaterial3D
			if m != null and mi.mesh != null and mi.get_child_count() == 0 and mi.mesh.get_surface_count() == 1 \
					and m.next_pass == null and m.transparency == BaseMaterial3D.TRANSPARENCY_DISABLED \
					and (not m.emission_enabled or (m.emission.is_equal_approx(m.albedo_color) and m.emission_texture == null)) \
					and m.albedo_texture == null and not m.vertex_color_use_as_albedo \
					and m.shading_mode == BaseMaterial3D.SHADING_MODE_PER_PIXEL:
				_append_mesh(groups, mi, m, inv * mi.global_transform)
				continue
		_collect_by_color(child, inv, groups)


static func _append_mesh(groups: Dictionary, mi: MeshInstance3D, m: StandardMaterial3D, xf: Transform3D) -> void:
	var rough := snappedf(m.roughness, 0.1)
	var metal := snappedf(m.metallic, 0.1)
	var energy := snappedf(m.emission_energy_multiplier, 0.2) if m.emission_enabled else 0.0
	var shadow := mi.cast_shadow
	var key := "%d|%.1f|%.1f|%.1f" % [shadow, rough, metal, energy]
	if not groups.has(key):
		groups[key] = {"verts": PackedVector3Array(), "norms": PackedVector3Array(), "cols": PackedColorArray(),
				"idx": PackedInt32Array(), "victims": [], "rough": rough, "metal": metal, "shadow": shadow, "energy": energy}
	var g: Dictionary = groups[key]
	var arr := mi.mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var norms: PackedVector3Array = arr[Mesh.ARRAY_NORMAL] if arr[Mesh.ARRAY_NORMAL] != null else PackedVector3Array()
	var base: int = (g.verts as PackedVector3Array).size()
	var nb := xf.basis.inverse().transposed()
	var col := m.albedo_color
	var gv: PackedVector3Array = g.verts
	var gn: PackedVector3Array = g.norms
	var gc: PackedColorArray = g.cols
	var gi: PackedInt32Array = g.idx
	for i in verts.size():
		gv.append(xf * verts[i])
		gn.append((nb * norms[i]).normalized() if i < norms.size() else Vector3.UP)
		gc.append(col)
	if arr[Mesh.ARRAY_INDEX] != null and (arr[Mesh.ARRAY_INDEX] as PackedInt32Array).size() > 0:
		for idx in (arr[Mesh.ARRAY_INDEX] as PackedInt32Array):
			gi.append(base + idx)
	else:
		for i in verts.size():
			gi.append(base + i)
	g.verts = gv
	g.norms = gn
	g.cols = gc
	g.idx = gi
	(g.victims as Array).append(mi)


# ---------------------------------------------------------------- 床

## 床の模様（同心円のタイル・光る象眼・にっこり顔の紋章）を1枚の板で描く。
static func floor_pattern(parent: Node, radius: float, emblem_center: Vector2, emblem_r: float) -> MeshInstance3D:
	var pm := PlaneMesh.new()
	pm.size = Vector2(radius * 2.0, radius * 2.0)
	var sm := ShaderMaterial.new()
	sm.shader = _get_floor_shader()
	sm.set_shader_parameter("radius", radius)
	sm.set_shader_parameter("emblem_center", emblem_center)
	sm.set_shader_parameter("emblem_r", emblem_r)
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	mi.material_override = sm
	mi.position = Vector3(0, 0.008, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func _get_floor_shader() -> Shader:
	if _floor_shader == null:
		_floor_shader = Shader.new()
		_floor_shader.code = """
shader_type spatial;
render_mode cull_back, diffuse_lambert_wrap, specular_schlick_ggx;
uniform float radius = 11.0;
uniform vec2 emblem_center = vec2(0.0, 5.0);
uniform float emblem_r = 2.0;
uniform vec4 tile_a : source_color = vec4(0.74, 0.7, 0.64, 1.0);
uniform vec4 tile_b : source_color = vec4(0.62, 0.6, 0.58, 1.0);
uniform vec4 inlay : source_color = vec4(0.35, 0.85, 1.0, 1.0);
uniform vec4 gold : source_color = vec4(1.0, 0.72, 0.3, 1.0);
varying vec3 lpos;
void vertex() {
	lpos = VERTEX;
}
float ring(float r, float c, float w) {
	float aa = fwidth(r);
	return 1.0 - smoothstep(w - aa, w + aa, abs(r - c));
}
float grid_line(float g) {
	float d = 0.5 - abs(fract(g) - 0.5);
	return 1.0 - smoothstep(0.0, fwidth(g) * 1.5, d);
}
void fragment() {
	vec2 q = lpos.xz;
	float r = length(q);
	if (r > radius) {
		discard;
	}
	float ang = atan(q.y, q.x) / 6.2831853 + 0.5;
	float band = floor(r / 1.6);
	float nseg = 6.0 + band * 6.0;
	float cell = floor(ang * nseg);
	float checker = mod(band + cell, 2.0);
	vec3 col = mix(tile_a.rgb, tile_b.rgb, checker * 0.55);
	float seam_r = grid_line(r / 1.6);
	float wa = fwidth(ang * nseg);
	float seam_a = wa < 0.5 ? grid_line(ang * nseg) : 0.0;
	col *= 1.0 - 0.2 * max(seam_r, seam_a);
	vec3 emi = vec3(0.0);
	float g1 = ring(r, 3.05, 0.05);
	float g2 = ring(r, 9.85, 0.06);
	float g3 = ring(r, 10.45, 0.03);
	col = mix(col, inlay.rgb, max(g1, g3));
	col = mix(col, gold.rgb, g2);
	emi += inlay.rgb * max(g1, g3) * 1.3 + gold.rgb * g2 * 0.9;
	vec2 e = (q - emblem_center) / emblem_r;
	float er = length(e);
	if (er < 1.05) {
		float aa = fwidth(er) * 1.5;
		float disc = 1.0 - smoothstep(0.84 - aa, 0.84 + aa, er);
		float band2 = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, er);
		col = mix(col, vec3(0.38, 0.55, 0.78), band2 * (1.0 - disc));
		col = mix(col, vec3(0.86, 0.88, 0.92), disc);
		vec2 d1 = (e - vec2(-0.24, -0.2)) / vec2(0.08, 0.15);
		vec2 d2 = (e - vec2(0.24, -0.2)) / vec2(0.08, 0.15);
		float l1 = length(d1);
		float l2 = length(d2);
		float eye1 = 1.0 - smoothstep(1.0 - fwidth(l1), 1.0 + fwidth(l1), l1);
		float eye2 = 1.0 - smoothstep(1.0 - fwidth(l2), 1.0 + fwidth(l2), l2);
		float sd = abs(length(e - vec2(0.0, -0.06)) - 0.44);
		float smile = (1.0 - smoothstep(0.05 - aa, 0.05 + aa, sd)) * smoothstep(0.1, 0.16, e.y);
		float face = max(max(eye1, eye2), smile);
		vec3 ink = vec3(0.16, 0.42, 0.86);
		col = mix(col, ink, face);
		float rim1 = ring(er, 0.92, 0.035);
		col = mix(col, inlay.rgb, rim1);
		emi += inlay.rgb * rim1 * 1.5 + ink * face * 0.35;
	}
	ALBEDO = col;
	EMISSION = emi;
	ROUGHNESS = 0.38;
	SPECULAR = 0.45;
}
"""
	return _floor_shader


# ---------------------------------------------------------------- ホログラム

static func holo_material(tint: Color, land: Color = Color(0.6, 1.0, 0.85), strength: float = 1.0) -> ShaderMaterial:
	var sm := ShaderMaterial.new()
	sm.shader = _get_holo_shader()
	sm.set_shader_parameter("tint", tint)
	sm.set_shader_parameter("land", land)
	sm.set_shader_parameter("strength", strength)
	return sm


static func _get_holo_shader() -> Shader:
	if _holo_shader == null:
		_holo_shader = Shader.new()
		_holo_shader.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, shadows_disabled, depth_draw_never;
uniform vec4 tint : source_color = vec4(0.35, 0.85, 1.0, 1.0);
uniform vec4 land : source_color = vec4(0.6, 1.0, 0.85, 1.0);
uniform float strength = 1.0;
float grid_line(float g) {
	float d = 0.5 - abs(fract(g) - 0.5);
	return 1.0 - smoothstep(0.0, fwidth(g) * 1.4, d);
}
void fragment() {
	float fres = pow(1.0 - clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0), 2.0);
	vec2 uv = UV;
	float grid = max(grid_line(uv.x * 18.0), grid_line(uv.y * 9.0));
	float n = sin(uv.x * 18.85 + sin(uv.y * 12.0) * 1.4) * sin(uv.y * 12.57 + sin(uv.x * 25.0) * 0.7);
	float landm = smoothstep(0.12, 0.22, n) * smoothstep(0.05, 0.2, uv.y) * smoothstep(0.95, 0.8, uv.y);
	float scan = 0.5 + 0.5 * sin(uv.y * 140.0 - TIME * 5.0);
	vec3 c = mix(tint.rgb * 0.75, vec3(0.85, 1.0, 1.0), fres * 0.6 + grid * 0.25);
	c = mix(c, land.rgb, landm * 0.6);
	float a = 0.12 + fres * 0.7 + grid * 0.38 + landm * 0.4 + scan * 0.04;
	if (!FRONT_FACING) {
		a *= 0.35;
	}
	ALBEDO = c;
	ALPHA = clamp(a * strength, 0.0, 1.0);
}
"""
	return _holo_shader


## 中央の地球儀：台座・光の柱・ホログラムの球・回る輪。回す必要のあるノードは Motion なので自動で動く。
static func holo_globe(parent: Node, pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.name = "HoloGlobe"
	root.position = pos
	parent.add_child(root)
	var white := Color(0.94, 0.93, 0.9)
	LevelKit.cyl(root, Vector3(0, 0.18, 0), 2.25, 0.36, white, true, Vector3.ZERO, 32)
	LevelKit.cyl(root, Vector3(0, 0.5, 0), 1.6, 0.3, Color(0.85, 0.86, 0.9), false, Vector3.ZERO, 32)
	torus(root, Vector3(0, 0.37, 0), 2.05, 0.05, LevelKit.mat(Color(0.35, 0.85, 1.0), 2.2, 0.4))
	torus(root, Vector3(0, 0.66, 0), 1.45, 0.04, LevelKit.mat(Color(1.0, 0.75, 0.35), 1.8, 0.4))
	# 台座のまわりの小さな灯り
	var lamp := SphereMesh.new()
	lamp.radius = 0.07
	lamp.height = 0.14
	lamp.radial_segments = 6
	lamp.rings = 3
	var xf: Array = []
	for i in 16:
		var a := TAU * i / 16.0
		xf.append(Transform3D(Basis.IDENTITY, Vector3(cos(a) * 2.25, 0.36, sin(a) * 2.25)))
	SkyProps.multimesh(root, lamp, LevelKit.mat(Color(0.5, 0.95, 1.0), 2.5, 0.4), xf)
	var proj := LevelKit.cyl(root, Vector3(0, 0.67, 0), 0.95, 0.04, Color(0.4, 0.9, 1.0))
	(proj as MeshInstance3D).material_override = LevelKit.mat(Color(0.4, 0.9, 1.0), 2.4, 0.3)
	# 光の柱
	var beam := CylinderMesh.new()
	beam.top_radius = 1.25
	beam.bottom_radius = 0.85
	beam.height = 1.5
	beam.radial_segments = 20
	beam.rings = 1
	beam.cap_top = false
	beam.cap_bottom = false
	var bmi := LevelKit.mesh(root, beam, Vector3(0, 1.45, 0), holo_material(Color(0.25, 0.7, 1.0), Color(0, 0, 0), 0.7))
	no_shadow(bmi)
	# 球
	var globe := SkyProps.motion(root, Vector3(0, 3.0, 0))
	globe.spin = Vector3(0, 0.25, 0)
	globe.bob_amp = 0.06
	globe.bob_speed = 1.2
	var sm := SphereMesh.new()
	sm.radius = 1.35
	sm.height = 2.7
	sm.radial_segments = 32
	sm.rings = 16
	var gmi := LevelKit.mesh(globe, sm, Vector3.ZERO, holo_material(Color(0.35, 0.82, 1.0)))
	no_shadow(gmi)
	var core := LevelKit.sphere(globe, Vector3.ZERO, 0.32, Color(0.7, 0.95, 1.0), Vector3.ONE, 12)
	core.material_override = LevelKit.mat(Color(0.7, 0.95, 1.0), 2.5, 0.3)
	no_shadow(core)
	# 回る輪
	for k in 2:
		var ringn := SkyProps.motion(root, Vector3(0, 3.0, 0))
		ringn.rotation_degrees = Vector3(72 if k == 0 else 108, 0, 18 if k == 0 else -24)
		ringn.spin = Vector3(0, 0.0, 0.5 if k == 0 else -0.35)
		var tmi := torus(ringn, Vector3.ZERO, 1.75 + k * 0.28, 0.022, LevelKit.mat(Color(0.55, 0.92, 1.0) if k == 0 else Color(1.0, 0.82, 0.45), 2.6, 0.3), Vector3(90, 0, 0), 64, 4)
		no_shadow(tmi)
	# 漂う光の粒
	var p := CPUParticles3D.new()
	p.position = Vector3(0, 2.6, 0)
	p.amount = 26
	p.lifetime = 3.5
	var pm := SphereMesh.new()
	pm.radius = 0.03
	pm.height = 0.06
	pm.radial_segments = 4
	pm.rings = 2
	p.mesh = pm
	p.material_override = LevelKit.mat(Color(0.6, 0.95, 1.0), 3.0, 0.3)
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 2.2
	p.direction = Vector3.UP
	p.spread = 25.0
	p.gravity = Vector3(0, 0.12, 0)
	p.initial_velocity_min = 0.05
	p.initial_velocity_max = 0.2
	root.add_child(p)
	return root


## 地球儀のまわりを回る時代の画面。face_out で常に外を向く。
static func era_screen(parent: Node, center: Vector3, radius: float, angle: float, tint: Color, year: String, place: String, locked: bool) -> Node3D:
	var m := SkyProps.motion(parent, center)
	m.orbit_center = center
	m.orbit_radius = radius
	m.orbit_speed = 0.18
	m.orbit_angle = angle
	m.face_out = true
	m.bob_amp = 0.08
	m.bob_speed = 0.9
	var frame := BoxMesh.new()
	frame.size = Vector3(1.56, 1.0, 0.04)
	LevelKit.mesh(m, frame, Vector3(0, 0, -0.02), LevelKit.mat(tint, 2.0, 0.4))
	var qm := QuadMesh.new()
	qm.size = Vector2(1.46, 0.9)
	LevelKit.mesh(m, qm, Vector3(0, 0, 0.005), LevelKit.unshaded(Color(tint.r * 0.25, tint.g * 0.3, tint.b * 0.45, 0.88)))
	# 画面の中の簡単な景色（時代ごとの形）
	var sil := LevelKit.unshaded(tint.lightened(0.25))
	var bm := BoxMesh.new()
	match year:
		"1726":
			for i in 3:
				var roof := LevelKit.mesh(m, bm, Vector3(-0.45 + i * 0.42, -0.22, 0.012), sil, Vector3(0, 0, 45), Vector3(0.22, 0.22, 0.01))
				roof.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		"2026":
			for i in 5:
				var h := [0.32, 0.5, 0.26, 0.42, 0.3][i] as float
				LevelKit.mesh(m, bm, Vector3(-0.5 + i * 0.25, -0.38 + h * 0.5, 0.012), sil, Vector3.ZERO, Vector3(0.17, h, 0.01))
		_:
			LevelKit.mesh(m, bm, Vector3(0.0, -0.18, 0.012), sil, Vector3.ZERO, Vector3(0.08, 0.5, 0.01))
			LevelKit.mesh(m, bm, Vector3(0.0, 0.08, 0.012), sil, Vector3.ZERO, Vector3(0.3, 0.06, 0.01))
			LevelKit.mesh(m, bm, Vector3(-0.42, -0.25, 0.012), sil, Vector3(0, 0, 45), Vector3(0.14, 0.14, 0.01))
			LevelKit.mesh(m, bm, Vector3(0.45, -0.18, 0.012), sil, Vector3(0, 0, 45), Vector3(0.12, 0.12, 0.01))
	var y := LevelKit.label(m, year, Vector3(0, 0.2, 0.02), 64, Color.WHITE, false, Vector3.ZERO, Color(0.02, 0.05, 0.15, 0.9))
	y.pixel_size = 0.0055
	var pl := LevelKit.label(m, "座標が未復元" if locked else place, Vector3(0, 0.0, 0.02), 40, Color(1.0, 0.75, 0.6) if locked else tint.lightened(0.5), false, Vector3.ZERO, Color(0.02, 0.05, 0.15, 0.9))
	pl.pixel_size = 0.005
	no_shadow(m)
	return m


# ---------------------------------------------------------------- 看板・展示

## ホログラムの看板（日本語の大きな文字＋英語の小さな文字）。正面はローカル +Z。
static func sign_board(parent: Node, pos: Vector3, jp: String, en: String, color: Color, width: float = 2.6) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	var frame := BoxMesh.new()
	frame.size = Vector3(width + 0.14, 1.06, 0.05)
	LevelKit.mesh(n, frame, Vector3(0, 0, -0.04), LevelKit.mat(color, 2.2, 0.4))
	var back := BoxMesh.new()
	back.size = Vector3(width, 0.92, 0.07)
	LevelKit.mesh(n, back, Vector3.ZERO, LevelKit.mat(Color(0.06, 0.1, 0.22), 0.0, 0.6))
	var big := LevelKit.label(n, jp, Vector3(0, 0.13, 0.045), 96, Color.WHITE, false, Vector3.ZERO, color.darkened(0.55))
	big.pixel_size = 0.0052
	if en != "":
		var small := LevelKit.label(n, en, Vector3(0, -0.27, 0.045), 56, color.lightened(0.45))
		small.pixel_size = 0.0045
	no_shadow(n)
	return n


## 展示用のクロー（腕＋輪＋3本の爪）。length で腕の長さが変わる。軸はローカル X。
static func claw_model(parent: Node, pos: Vector3, accent: Color, length: float) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	var metal := Color(0.82, 0.85, 0.9)
	LevelKit.cyl(n, Vector3(-length * 0.5 - 0.1, 0, 0), 0.11, 0.2, metal.darkened(0.25), false, Vector3(0, 0, 90), 10)
	LevelKit.cyl(n, Vector3(0, 0, 0), 0.055, length, metal, false, Vector3(0, 0, 90), 8)
	var band := LevelKit.cyl(n, Vector3(-length * 0.15, 0, 0), 0.07, 0.08, accent, false, Vector3(0, 0, 90), 8)
	(band as MeshInstance3D).material_override = LevelKit.mat(accent, 1.6, 0.4)
	torus(n, Vector3(length * 0.5 + 0.04, 0, 0), 0.12, 0.035, LevelKit.mat(accent, 1.8, 0.4), Vector3(0, 0, 90), 16, 6)
	var prong := BoxMesh.new()
	prong.size = Vector3(0.24, 0.045, 0.045)
	for i in 3:
		var a := TAU * i / 3.0
		var p := LevelKit.mesh(n, prong, Vector3(length * 0.5 + 0.17, cos(a) * 0.1, sin(a) * 0.1), LevelKit.mat(Color(0.92, 0.96, 1.0), 0.6, 0.4))
		p.rotation = Vector3(a, 0, 0)
		p.rotate_object_local(Vector3.FORWARD, -0.35)
	return n


## 小さなホログラム画面（記録盤用）。
static func holo_panel(parent: Node, pos: Vector3, size: Vector2, tint: Color, yaw_deg: float = 0.0) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	n.rotation_degrees.y = yaw_deg
	parent.add_child(n)
	var frame := BoxMesh.new()
	frame.size = Vector3(size.x + 0.08, size.y + 0.08, 0.03)
	LevelKit.mesh(n, frame, Vector3(0, 0, -0.02), LevelKit.mat(tint, 1.8, 0.4))
	var qm := QuadMesh.new()
	qm.size = size
	LevelKit.mesh(n, qm, Vector3.ZERO, LevelKit.unshaded(Color(tint.r * 0.22, tint.g * 0.26, tint.b * 0.4, 0.92)))
	no_shadow(n)
	return n


## 鉢植え（工房を居心地よく）。
static func plant(parent: Node, pos: Vector3, s: float = 1.0) -> void:
	LevelKit.cyl(parent, pos + Vector3(0, 0.3 * s, 0), 0.32 * s, 0.6 * s, Color(0.85, 0.5, 0.32), false, Vector3.ZERO, 10, 0.4 * s)
	LevelKit.cyl(parent, pos + Vector3(0, 0.6 * s, 0), 0.36 * s, 0.06 * s, Color(0.4, 0.28, 0.2), false, Vector3.ZERO, 10)
	LevelKit.sphere(parent, pos + Vector3(0, 0.95 * s, 0), 0.42 * s, Color(0.32, 0.64, 0.3), Vector3(1.0, 0.9, 1.0), 10)
	LevelKit.sphere(parent, pos + Vector3(0.22 * s, 1.25 * s, 0.05 * s), 0.28 * s, Color(0.38, 0.72, 0.34), Vector3.ONE, 8)
	LevelKit.sphere(parent, pos + Vector3(-0.2 * s, 1.18 * s, -0.12 * s), 0.25 * s, Color(0.28, 0.58, 0.28), Vector3.ONE, 8)


## 吊りランプ（灯りつき）。
static func hanging_lamp(parent: Node, pos: Vector3, drop: float, with_light: bool) -> void:
	LevelKit.cyl(parent, pos - Vector3(0, drop * 0.5, 0), 0.02, drop, Color(0.25, 0.22, 0.2), false, Vector3.ZERO, 4)
	var shade := LevelKit.cone(parent, pos - Vector3(0, drop - 0.05, 0), 0.38, 0.32, Color(0.95, 0.75, 0.4), 12)
	shade.material_override = LevelKit.mat(Color(0.95, 0.72, 0.38), 0.4, 0.5)
	var bulb := LevelKit.sphere(parent, pos - Vector3(0, drop + 0.14, 0), 0.16, Color(1.0, 0.85, 0.55), Vector3.ONE, 8)
	bulb.material_override = LevelKit.mat(Color(1.0, 0.85, 0.55), 3.0, 0.4)
	no_shadow(bulb)
	if with_light:
		var l := OmniLight3D.new()
		l.position = pos - Vector3(0, drop + 0.4, 0)
		l.light_color = Color(1.0, 0.8, 0.55)
		l.light_energy = 1.4
		l.omni_range = 7.5
		l.shadow_enabled = false
		parent.add_child(l)
