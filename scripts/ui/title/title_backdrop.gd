extends Node3D
## タイトル画面の3D背景：空に浮かぶ小島で手をふるネクマックス、遠くの未来都市と浮島、時の裂け目。
## カメラはゆっくり弧を描いて回る。menu_shift を 1 にするとネクマックスが画面の右寄りになる（メニュー表示用）。

const SkyProps := preload("res://scripts/eras/hub/sky_props.gd")
const Motion := preload("res://scripts/eras/hub/motion.gd")
const HubBuilder := preload("res://scripts/eras/hub/hub_builder.gd")

const HERO_POS := Vector3(0.0, 0.0, 0.6)
const CAM_DIST := 6.4
const CAM_HEIGHT := 0.95
const LOOK_HEIGHT := 1.75

var camera: Camera3D
var model: NexmaxModel
## 0 = 中央（スタート待ち） / 1 = 右寄り（メニュー）
var menu_shift := 0.0

var _t := 0.0
var _wave_z := 0.25
var _hop_done := false
var _cars: Array[Node3D] = []


func _ready() -> void:
	_build_environment()
	_build_hero_island()
	_build_backdrop()
	# 動かない部品を材質ごとにまとめる（Web版のドローコール対策）
	HubBuilder.merge_by_color(self)
	LevelKit.merge_static(self)
	camera = Camera3D.new()
	camera.fov = 34.0
	camera.near = 0.1
	camera.far = 900.0
	add_child(camera)
	camera.current = true
	_update_camera(0.0)


func _process(delta: float) -> void:
	_t += delta
	_animate_hero(delta)
	_update_camera(delta)


# ---------------------------------------------------------------- 構築

func _build_environment() -> void:
	var sun := LevelKit.environment(self, Color(0.2, 0.47, 0.92), Color(0.74, 0.88, 1.0), Color(0.55, 0.72, 0.95),
			Color(1.0, 0.93, 0.8), 1.35, Vector3(-36, 28, 0), 0.95, Color(0.78, 0.88, 1.0))
	sun.directional_shadow_max_distance = 20.0


func _build_hero_island() -> void:
	var isl := Node3D.new()
	isl.name = "HeroIsland"
	add_child(isl)
	# 草の上面・土の層・下の岩
	LevelKit.cyl(isl, Vector3(0, -0.22, 0), 3.0, 0.44, Color(0.42, 0.74, 0.34), false, Vector3.ZERO, 14)
	LevelKit.cyl(isl, Vector3(0, -0.7, 0), 3.06, 0.56, Color(0.66, 0.48, 0.34), false, Vector3.ZERO, 14, 2.9)
	LevelKit.cone(isl, Vector3(0, -3.2, 0), 2.95, 4.4, Color(0.56, 0.43, 0.35), 10, Vector3(180, 0, 0))
	LevelKit.cone(isl, Vector3(1.7, -1.9, 0.9), 1.1, 2.0, Color(0.5, 0.39, 0.32), 7, Vector3(180, 20, 0))
	LevelKit.cone(isl, Vector3(-1.5, -1.6, -1.1), 0.9, 1.6, Color(0.6, 0.47, 0.37), 7, Vector3(180, 0, 0))
	# 木と岩
	# 低い茂み
	for b in [[Vector3(-2.1, 0, -1.3), 0.42], [Vector3(2.2, 0, -1.0), 0.36], [Vector3(-0.9, 0, -2.3), 0.34]]:
		var bush := LevelKit.sphere(isl, b[0], b[1], Color(0.3, 0.62, 0.3), Vector3(1.3, 0.85, 1.1), 10)
		bush.position.y = b[1] * 0.5
	var rock := LevelKit.sphere(isl, Vector3(1.6, 0.12, 0.9), 0.35, Color(0.7, 0.68, 0.66), Vector3(1.3, 0.7, 1.0), 8)
	rock.rotation_degrees.y = 30
	LevelKit.sphere(isl, Vector3(-1.4, 0.08, 1.4), 0.22, Color(0.66, 0.64, 0.62), Vector3(1.2, 0.7, 1.0), 8)
	# 草むらと花（MultiMesh でまとめる）
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var tuft_xf: Array = []
	var tuft_col: Array = []
	var flower_xf: Array = []
	var flower_col: Array = []
	var flower_palette := [Color(1.0, 0.62, 0.78), Color(1.0, 0.9, 0.35), Color(1.0, 1.0, 1.0), Color(0.6, 0.75, 1.0)]
	for i in 70:
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf()) * 2.85
		var p := Vector3(cos(a) * r, 0.0, sin(a) * r)
		if p.distance_to(HERO_POS) < 0.7:
			continue
		var s := rng.randf_range(0.7, 1.4)
		tuft_xf.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s * 1.3, s, s)), p))
		tuft_col.append(Color(0.3, 0.62, 0.28).lightened(rng.randf_range(0.0, 0.25)))
		if i % 3 == 0:
			var fp := p + Vector3(rng.randf_range(-0.2, 0.2), 0.16, rng.randf_range(-0.2, 0.2))
			flower_xf.append(Transform3D(Basis.from_scale(Vector3.ONE * rng.randf_range(0.8, 1.2)), fp))
			flower_col.append(flower_palette[rng.randi() % flower_palette.size()])
	var tuft := SphereMesh.new()
	tuft.radius = 0.12
	tuft.height = 0.16
	tuft.is_hemisphere = true
	tuft.radial_segments = 7
	tuft.rings = 2
	SkyProps.multimesh(isl, tuft, SkyProps.tint_mat(), tuft_xf, false, tuft_col)
	var flower := SphereMesh.new()
	flower.radius = 0.065
	flower.height = 0.11
	flower.radial_segments = 6
	flower.rings = 3
	SkyProps.multimesh(isl, flower, SkyProps.tint_mat(0.0, 0.6), flower_xf, false, flower_col)
	# 小さな滝
	var fall := BoxMesh.new()
	fall.size = Vector3(0.7, 4.2, 0.12)
	var fall_mi := LevelKit.mesh(isl, fall, Vector3(-2.15, -2.3, 1.95), LevelKit.unshaded(Color(0.75, 0.92, 1.0, 0.55)), Vector3(0, -40, 0))
	fall_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var pool := LevelKit.cyl(isl, Vector3(-2.1, 0.02, 1.85), 0.5, 0.04, Color(0.4, 0.75, 1.0))
	(pool as MeshInstance3D).material_override = LevelKit.mat(Color(0.45, 0.8, 1.0), 0.5, 0.1)
	_mist(isl, Vector3(-2.15, -4.4, 1.95))
	# 時の結晶（ふわふわ回る）
	for i in 3:
		var a := TAU * i / 3.0 + 0.6
		var c := SkyProps.motion(isl, HERO_POS + Vector3(cos(a) * 1.25, 1.1 + i * 0.2, sin(a) * 0.9 - 0.3))
		c.spin = Vector3(0, 1.4, 0)
		c.bob_amp = 0.12
		c.bob_speed = 1.6 + i * 0.3
		var gem := MeshInstance3D.new()
		gem.mesh = LevelKit.diamond_mesh(0.13)
		gem.material_override = LevelKit.mat(Color(1.0, 0.82, 0.3), 2.2, 0.3)
		gem.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		c.add_child(gem)
	# ネクマックス
	model = NexmaxModel.new()
	model.position = HERO_POS
	model.rotation.y = PI
	add_child(model)
	_sparkles(model)


func _build_backdrop() -> void:
	# 遠くの未来都市（左奥）と時の裂け目（右奥）
	SkyProps.future_city(self, Vector3(-36, 0.0, -150), 26.0, 11)
	SkyProps.rift(self, Vector3(52, 22, -150), 44.0, Color(1.0, 0.62, 0.25), Color(0.75, 0.35, 1.0), 0.62)
	var rift_ring := TorusMesh.new()
	rift_ring.inner_radius = 17.0
	rift_ring.outer_radius = 17.8
	rift_ring.rings = 48
	rift_ring.ring_segments = 6
	var rr := SkyProps.motion(self, Vector3(52, 22, -152))
	rr.rotation_degrees = Vector3(90, -18, 0)
	rr.spin = Vector3(0, 0.1, 0)
	var rmi := LevelKit.mesh(rr, rift_ring, Vector3.ZERO, LevelKit.mat(Color(1.0, 0.8, 0.5), 1.6, 0.3))
	rmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# 浮島（ぐるりと全周）と雲
	SkyProps.islands(self, 21, 9, 22.0, 46.0, -6.0, 9.0, 1.6, 4.0)
	SkyProps.islands(self, 33, 7, 55.0, 90.0, -2.0, 22.0, 4.0, 8.0, 0.0, TAU, false)
	SkyProps.clouds(self, 5, 26, 110.0, 170.0, -14.0, 16.0, 5.0, 10.0)
	SkyProps.clouds(self, 9, 14, 34.0, 90.0, -28.0, -18.0, 4.0, 8.0)
	# 空を行き交う乗り物
	for i in 3:
		var car := SkyProps.motion(self, Vector3.ZERO)
		var y := 6.0 + i * 5.0
		var z := -40.0 - i * 18.0
		car.path_from = Vector3(-70, y, z)
		car.path_to = Vector3(70, y + 3.0, z - 10.0)
		car.path_period = 38.0 + i * 9.0
		var body := LevelKit.sphere(car, Vector3.ZERO, 0.8, Color(0.95, 0.96, 1.0), Vector3(2.2, 0.7, 1.0), 10)
		body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var glow := LevelKit.sphere(car, Vector3(0, -0.3, 0), 0.5, Color(0.4, 0.85, 1.0), Vector3(2.4, 0.3, 1.1), 8)
		glow.material_override = LevelKit.mat(Color(0.4, 0.85, 1.0), 2.5, 0.4)
		glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_cars.append(car)


func _sparkles(parent: Node3D) -> void:
	var p := CPUParticles3D.new()
	p.amount = 22
	p.lifetime = 3.0
	p.position = Vector3(0, 0.7, 0)
	var m := SphereMesh.new()
	m.radius = 0.025
	m.height = 0.05
	m.radial_segments = 4
	m.rings = 2
	p.mesh = m
	p.material_override = LevelKit.mat(Color(1.0, 0.9, 0.5), 3.0, 0.4)
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 1.4
	p.direction = Vector3.UP
	p.spread = 30.0
	p.gravity = Vector3(0, 0.15, 0)
	p.initial_velocity_min = 0.05
	p.initial_velocity_max = 0.25
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.4
	parent.add_child(p)


func _mist(parent: Node3D, pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.amount = 10
	p.lifetime = 2.0
	p.position = pos
	var m := SphereMesh.new()
	m.radius = 0.3
	m.height = 0.6
	m.radial_segments = 6
	m.rings = 3
	p.mesh = m
	p.material_override = LevelKit.unshaded(Color(1, 1, 1, 0.35))
	p.direction = Vector3.DOWN
	p.spread = 40.0
	p.gravity = Vector3(0, -0.4, 0)
	p.initial_velocity_min = 0.2
	p.initial_velocity_max = 0.6
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.6
	parent.add_child(p)


# ---------------------------------------------------------------- 動き

## ネクマックス：待機の動きに、手をふる・小さく跳ねる・見回すを重ねる。
func _animate_hero(delta: float) -> void:
	if model == null:
		return
	# 低いフレームレートでも目の伸び縮みが暴れないよう、渡す時間を 1/30 秒までに抑える
	model.animate(minf(delta, 1.0 / 30.0), 0.0, true, 0.0, false, false)
	var arm: Node3D = model.get("arm_r") as Node3D
	var arm_l: Node3D = model.get("arm_l") as Node3D
	var head: Node3D = model.get("head") as Node3D
	var cyc := fmod(_t, 7.5)
	var waving := cyc < 3.0
	# 右腕を上げて手をふる
	var want_z := 1.95 + sin(_t * 9.0) * 0.32 if waving else 0.25
	_wave_z = lerpf(_wave_z, want_z, 1.0 - exp(-10.0 * delta))
	if arm:
		arm.rotation.z = _wave_z
		if waving:
			arm.rotation.x = lerpf(arm.rotation.x, -0.45, 1.0 - exp(-8.0 * delta))
	# 跳ねる（ぴょん）
	var hop := 0.0
	if cyc > 3.4 and cyc < 4.1:
		var k := (cyc - 3.4) / 0.7
		hop = sin(k * PI) * 0.32
		if not _hop_done:
			_hop_done = true
			model.squash(Vector3(0.85, 1.2, 0.85))
		if arm_l:
			arm_l.rotation.z = lerpf(arm_l.rotation.z, -1.2, 1.0 - exp(-12.0 * delta))
		if arm:
			arm.rotation.z = maxf(arm.rotation.z, 1.2)
	elif cyc >= 4.1 and _hop_done:
		_hop_done = false
		model.squash(Vector3(1.18, 0.82, 1.18))
	elif arm_l:
		arm_l.rotation.z = lerpf(arm_l.rotation.z, -0.25, 1.0 - exp(-8.0 * delta))
	model.position = HERO_POS + Vector3(0, hop, 0)
	# 見回す・カメラの方を向く
	if head:
		head.rotation.y = sin(_t * 0.6) * 0.22 if not waving else lerpf(head.rotation.y, 0.0, delta * 4.0)
		head.rotation.x = -0.08 if waving else 0.0
	var cam_dir := camera.global_position - model.global_position if camera else Vector3.BACK
	model.rotation.y = lerp_angle(model.rotation.y, atan2(-cam_dir.x, -cam_dir.z) + 0.15, 1.0 - exp(-2.0 * delta))


func _update_camera(_delta: float) -> void:
	if camera == null:
		return
	var yaw := sin(_t * 0.09) * 0.42
	var dist := CAM_DIST + sin(_t * 0.13) * 0.15
	var target := HERO_POS + Vector3(0, LOOK_HEIGHT, 0)
	var pos := HERO_POS + Vector3(sin(yaw) * dist, CAM_HEIGHT + sin(_t * 0.17) * 0.08, cos(yaw) * dist)
	camera.global_position = pos
	camera.look_at(target, Vector3.UP)
	camera.h_offset = -1.35 * menu_shift
