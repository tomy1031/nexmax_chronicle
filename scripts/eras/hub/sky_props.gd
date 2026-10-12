extends RefCounted
## 空の背景（雲・浮島・未来の街並み・時の裂け目）を組み立てる道具。タイトル・異次元拠点・クロー練習場で共用。
## 同じ形の繰り返しは MultiMesh にまとめてドローコールを抑える（Web 版の負荷対策）。

const Motion := preload("res://scripts/eras/hub/motion.gd")

static var _rift_shader: Shader
static var _cloud_mat: StandardMaterial3D
static var _tint_mats := {}


## 動く入れ物（motion.gd）を作って親に付ける。
static func motion(parent: Node, pos: Vector3) -> Motion:
	var m := Motion.new()
	m.position = pos
	parent.add_child(m)
	return m


## 同じメッシュを MultiMesh で一括描画する（1 ドローコール）。colors を渡すとインスタンスごとに色を変える。
static func multimesh(parent: Node, m: Mesh, material: Material, xforms: Array, shadow: bool = false, colors: Array = []) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = not colors.is_empty()
	mm.mesh = m
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
		if mm.use_colors:
			mm.set_instance_color(i, colors[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = material
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mmi)
	return mmi


## 頂点色（インスタンス色）をそのまま使うマテリアル。emission > 0 で自ら光る。
static func tint_mat(emission: float = 0.0, rough: float = 0.8) -> StandardMaterial3D:
	var key := "%.2f|%.2f" % [emission, rough]
	if _tint_mats.has(key):
		return _tint_mats[key]
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	m.albedo_color = Color.WHITE
	m.roughness = rough
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT_WRAP
	if emission > 0.0:
		m.emission_enabled = true
		m.emission = Color.WHITE
		m.emission_energy_multiplier = emission
	_tint_mats[key] = m
	return m


static func cloud_mat() -> StandardMaterial3D:
	if _cloud_mat == null:
		_cloud_mat = StandardMaterial3D.new()
		_cloud_mat.vertex_color_use_as_albedo = true
		_cloud_mat.vertex_color_is_srgb = true
		_cloud_mat.albedo_color = Color.WHITE
		_cloud_mat.roughness = 1.0
		_cloud_mat.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
		_cloud_mat.emission_enabled = true
		_cloud_mat.emission = Color(0.62, 0.72, 0.9)
		_cloud_mat.emission_energy_multiplier = 0.32
	return _cloud_mat


static func _unit_sphere(seg: int = 12) -> SphereMesh:
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = seg
	sm.rings = maxi(4, seg / 2)
	return sm


## もこもこの雲を円環状に散らす。arc_from〜arc_to は北(-Z)から時計回りの角度（ラジアン）。
static func clouds(parent: Node, rng_seed: int, count: int, r_min: float, r_max: float, y_min: float, y_max: float,
		s_min: float, s_max: float, center: Vector3 = Vector3.ZERO, arc_from: float = 0.0, arc_to: float = TAU) -> MultiMeshInstance3D:
	var rng := RandomNumberGenerator.new()
	rng.seed = rng_seed
	var xf: Array = []
	var cols: Array = []
	for i in count:
		var a := rng.randf_range(arc_from, arc_to)
		var r := rng.randf_range(r_min, r_max)
		var base := center + Vector3(sin(a) * r, rng.randf_range(y_min, y_max), -cos(a) * r)
		var s := rng.randf_range(s_min, s_max)
		var side := Vector3(cos(a), 0.0, sin(a))
		var puffs := rng.randi_range(3, 6)
		for k in puffs:
			var off := side * rng.randf_range(-1.8, 1.8) * s + Vector3(0, rng.randf_range(-0.15, 0.55) * s, 0)
			off += Vector3(sin(a), 0, -cos(a)) * rng.randf_range(-0.6, 0.6) * s
			var ps := s * rng.randf_range(0.6, 1.15)
			var b := Basis.from_scale(Vector3(ps * 1.35, ps * 0.85, ps * 1.1))
			xf.append(Transform3D(b, base + off))
			cols.append(Color(1, 1, 1).darkened(rng.randf_range(0.0, 0.1)))
	return multimesh(parent, _unit_sphere(9), cloud_mat(), xf, false, cols)


## 遠景の浮島をいくつも置く（LevelKit.floating_island に小さな塔や木を添える）。
static func islands(parent: Node, rng_seed: int, count: int, r_min: float, r_max: float, y_min: float, y_max: float,
		s_min: float, s_max: float, arc_from: float = 0.0, arc_to: float = TAU, bob: bool = true) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = rng_seed
	for i in count:
		var a := lerpf(arc_from, arc_to, (i + rng.randf_range(0.15, 0.85)) / count)
		var r := rng.randf_range(r_min, r_max)
		var pos := Vector3(sin(a) * r, rng.randf_range(y_min, y_max), -cos(a) * r)
		# 揺れる島は Motion（描画の統合からは外れる）。揺れない遠景の島は統合できるよう普通のノードにする
		var holder: Node3D
		if bob:
			var mo := motion(parent, pos)
			mo.bob_amp = rng.randf_range(0.15, 0.4)
			mo.bob_speed = rng.randf_range(0.25, 0.5)
			holder = mo
		else:
			holder = Node3D.new()
			holder.position = pos
			parent.add_child(holder)
		var s := rng.randf_range(s_min, s_max)
		LevelKit.floating_island(holder, Vector3.ZERO, s)
		var deco := rng.randi_range(0, 3)
		if deco == 0:
			# 小さな白い塔（未来の建物）
			LevelKit.cyl(holder, Vector3(-s * 0.2, s * 0.9, -s * 0.15), s * 0.16, s * 1.6, Color(0.93, 0.95, 1.0), false, Vector3.ZERO, 8)
			var cap := LevelKit.cone(holder, Vector3(-s * 0.2, s * 1.85, -s * 0.15), s * 0.22, s * 0.35, Color(0.4, 0.75, 1.0), 8)
			cap.material_override = LevelKit.mat(Color(0.4, 0.75, 1.0), 0.6)
		elif deco == 1:
			LevelKit.tree(holder, Vector3(-s * 0.25, s * 0.1, s * 0.25), s * 0.35)
		if bob:
			for mi in holder.find_children("*", "MeshInstance3D", true, false):
				(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## 遠くに浮かぶ未来都市（ナンバタウンを思わせる塔の群れ）。塔は MultiMesh でまとめる。
static func future_city(parent: Node, center: Vector3, radius: float, rng_seed: int) -> Node3D:
	var root := Node3D.new()
	root.position = center
	parent.add_child(root)
	var rng := RandomNumberGenerator.new()
	rng.seed = rng_seed
	# 土台の浮遊大地
	LevelKit.cyl(root, Vector3(0, -1.0, 0), radius, 2.0, Color(0.86, 0.88, 0.94), false, Vector3.ZERO, 24)
	LevelKit.cyl(root, Vector3(0, 0.05, 0), radius * 0.98, 0.2, Color(0.42, 0.68, 0.4), false, Vector3.ZERO, 24)
	LevelKit.cone(root, Vector3(0, -2.0 - radius * 0.45, 0), radius * 0.95, radius * 0.9, Color(0.58, 0.47, 0.4), 12, Vector3(180, 0, 0))
	var glow_ring := TorusMesh.new()
	glow_ring.inner_radius = radius * 1.0
	glow_ring.outer_radius = radius * 1.04
	glow_ring.rings = 48
	glow_ring.ring_segments = 6
	LevelKit.mesh(root, glow_ring, Vector3(0, -0.6, 0), LevelKit.mat(Color(0.4, 0.85, 1.0), 2.2, 0.4))
	# 塔（箱と円柱）
	var box_xf: Array = []
	var box_col: Array = []
	var cyl_xf: Array = []
	var cyl_col: Array = []
	var win_xf: Array = []
	var palette := [Color(0.93, 0.9, 0.84), Color(0.5, 0.7, 0.95), Color(1.0, 0.72, 0.5), Color(0.55, 0.85, 0.78), Color(0.78, 0.68, 0.95), Color(0.98, 0.84, 0.45)]
	for i in 26:
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf()) * radius * 0.85
		if r < radius * 0.18:
			r = radius * 0.18 + rng.randf() * 2.0
		var h := rng.randf_range(4.0, 16.0) * (1.25 - r / radius * 0.6)
		var w := rng.randf_range(1.6, 3.2)
		var p := Vector3(cos(a) * r, h * 0.5, sin(a) * r)
		var c: Color = palette[rng.randi() % palette.size()]
		if rng.randf() < 0.45:
			cyl_xf.append(Transform3D(Basis.from_scale(Vector3(w * 0.5, h, w * 0.5)), p))
			cyl_col.append(c)
		else:
			var b := Basis(Vector3.UP, rng.randf() * PI).scaled(Vector3(w, h, w * rng.randf_range(0.7, 1.2)))
			box_xf.append(Transform3D(b, p))
			box_col.append(c)
		# 光る窓の帯
		var bands := int(h / 2.5)
		for k in bands:
			win_xf.append(Transform3D(Basis.from_scale(Vector3(w * 1.02, 0.18, w * 1.02)), Vector3(p.x, 1.4 + k * 2.5, p.z)))
	var bm := BoxMesh.new()
	multimesh(root, bm, tint_mat(0.0, 0.5), box_xf, false, box_col)
	var cm := CylinderMesh.new()
	cm.top_radius = 1.0
	cm.bottom_radius = 1.0
	cm.height = 1.0
	cm.radial_segments = 10
	cm.rings = 1
	multimesh(root, cm, tint_mat(0.0, 0.5), cyl_xf, false, cyl_col)
	var wm := CylinderMesh.new()
	wm.top_radius = 0.55
	wm.bottom_radius = 0.55
	wm.height = 1.0
	wm.radial_segments = 10
	wm.rings = 1
	multimesh(root, wm, LevelKit.mat(Color(0.2, 0.42, 0.78), 0.35, 0.2, 0.3), win_xf)
	# 中央のタワー（展望台つき）
	var tower := Node3D.new()
	root.add_child(tower)
	LevelKit.cyl(tower, Vector3(0, 9.0, 0), 1.6, 18.0, Color(0.92, 0.88, 0.8), false, Vector3.ZERO, 8, 0.9)
	LevelKit.cyl(tower, Vector3(0, 18.5, 0), 3.4, 1.6, Color(0.95, 0.55, 0.3), false, Vector3.ZERO, 16)
	LevelKit.cyl(tower, Vector3(0, 19.6, 0), 2.6, 0.8, Color(0.98, 0.95, 0.9), false, Vector3.ZERO, 16)
	var dome := LevelKit.sphere(tower, Vector3(0, 20.4, 0), 1.6, Color(0.5, 0.85, 1.0), Vector3(1, 0.7, 1), 12)
	dome.material_override = LevelKit.mat(Color(0.5, 0.85, 1.0), 0.8, 0.3)
	LevelKit.cyl(tower, Vector3(0, 24.0, 0), 0.18, 6.0, Color(0.9, 0.9, 0.95), false, Vector3.ZERO, 6)
	var tip := LevelKit.sphere(tower, Vector3(0, 27.2, 0), 0.4, Color(1.0, 0.4, 0.4))
	tip.material_override = LevelKit.mat(Color(1.0, 0.45, 0.4), 2.5)
	# 空を巡る光の輪
	var halo := TorusMesh.new()
	halo.inner_radius = radius * 0.62
	halo.outer_radius = radius * 0.64
	halo.rings = 48
	halo.ring_segments = 4
	var halo_node := motion(root, Vector3(0, 15.0, 0))
	halo_node.rotation_degrees = Vector3(8, 0, 4)
	halo_node.spin = Vector3(0, 0.08, 0)
	LevelKit.mesh(halo_node, halo, Vector3.ZERO, LevelKit.mat(Color(0.65, 0.9, 1.0), 2.4, 0.3))
	return root


## 時の裂け目（渦巻く光）。常にカメラの方を向く板。
static func rift(parent: Node, pos: Vector3, size: float, col_a: Color = Color(1.0, 0.72, 0.35), col_b: Color = Color(0.8, 0.45, 1.0), strength: float = 0.55) -> MeshInstance3D:
	var qm := QuadMesh.new()
	qm.size = Vector2(size, size)
	var sm := ShaderMaterial.new()
	sm.shader = _get_rift_shader()
	sm.set_shader_parameter("col_a", col_a)
	sm.set_shader_parameter("col_b", col_b)
	sm.set_shader_parameter("strength", strength)
	var mi := MeshInstance3D.new()
	mi.mesh = qm
	mi.material_override = sm
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func _get_rift_shader() -> Shader:
	if _rift_shader == null:
		_rift_shader = Shader.new()
		_rift_shader.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, shadows_disabled, depth_draw_never, fog_disabled;
uniform vec4 col_a : source_color = vec4(1.0, 0.72, 0.35, 1.0);
uniform vec4 col_b : source_color = vec4(0.8, 0.45, 1.0, 1.0);
uniform float strength = 0.55;
void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}
void fragment() {
	vec2 p = UV - vec2(0.5);
	float r = length(p) * 2.0;
	float a = atan(p.y, p.x);
	float s1 = sin(a * 3.0 + r * 11.0 - TIME * 1.4) * 0.5 + 0.5;
	float s2 = sin(a * 5.0 - r * 16.0 + TIME * 0.9) * 0.5 + 0.5;
	float fade = smoothstep(1.0, 0.45, r);
	float core = smoothstep(0.42, 0.0, r);
	float ring = smoothstep(0.07, 0.0, abs(r - 0.8 - sin(TIME * 0.8) * 0.02));
	vec3 col = mix(col_b.rgb, col_a.rgb, s1);
	col = mix(col, vec3(1.0, 0.97, 0.9), core * core + ring * 0.35);
	float bright = (0.25 + 0.75 * s2) * fade * 0.8 + core * 1.2 + ring * 0.9;
	ALBEDO = col;
	ALPHA = clamp(bright * strength, 0.0, 1.0);
}
"""
	return _rift_shader
