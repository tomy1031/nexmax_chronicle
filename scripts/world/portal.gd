class_name Portal
extends Node3D
## 光の扉・時の裂け目・帰還地点の輪。touch_enter なら触れて入る、そうでなければ F で使う。

signal entered

var color := Color(1.0, 0.8, 0.4)
var radius := 1.4
var touch_enter := false
var active := true
var flat := false   # true なら地面に置く輪（帰還地点）
var _ring: Node3D
var _disc: MeshInstance3D
var _particles: CPUParticles3D
var _fired := false
var _t := 0.0


static func create(parent: Node, pos: Vector3, p_color: Color, p_radius: float, p_flat: bool = false, yaw_deg: float = 0.0) -> Portal:
	var p := Portal.new()
	p.position = pos
	p.rotation_degrees.y = yaw_deg
	p.color = p_color
	p.radius = p_radius
	p.flat = p_flat
	parent.add_child(p)
	return p


func _ready() -> void:
	_ring = Node3D.new()
	add_child(_ring)
	var tm := TorusMesh.new()
	tm.inner_radius = radius * 0.86
	tm.outer_radius = radius
	tm.rings = 32
	tm.ring_segments = 8
	var ring := MeshInstance3D.new()
	ring.mesh = tm
	ring.material_override = LevelKit.mat(color, 3.0, 0.3)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_ring.add_child(ring)
	if not flat:
		ring.rotation_degrees = Vector3(90, 0, 0)
	_disc = MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(radius * 1.8, radius * 1.8)
	_disc.mesh = qm
	var sm := ShaderMaterial.new()
	sm.shader = _disc_shader()
	sm.set_shader_parameter("tint", color)
	_disc.material_override = sm
	_disc.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if flat:
		_disc.rotation_degrees = Vector3(-90, 0, 0)
		_disc.position.y = 0.02
	add_child(_disc)
	_particles = CPUParticles3D.new()
	_particles.amount = 24
	_particles.lifetime = 1.4
	var pm := SphereMesh.new()
	pm.radius = 0.05
	pm.height = 0.1
	pm.radial_segments = 4
	pm.rings = 2
	_particles.mesh = pm
	_particles.material_override = LevelKit.mat(color.lightened(0.3), 3.0)
	_particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	_particles.emission_ring_radius = radius * 0.9
	_particles.emission_ring_inner_radius = radius * 0.7
	_particles.emission_ring_height = 0.05
	_particles.emission_ring_axis = Vector3.UP if flat else Vector3.BACK
	_particles.direction = Vector3.UP
	_particles.spread = 25.0
	_particles.gravity = Vector3(0, 0.6, 0)
	_particles.initial_velocity_min = 0.2
	_particles.initial_velocity_max = 0.8
	add_child(_particles)


func set_active(v: bool) -> void:
	active = v
	visible = v
	_fired = false


func _process(delta: float) -> void:
	_t += delta
	_ring.rotation.y = 0.0
	if flat:
		_ring.rotation.y = _t * 0.6
	else:
		_ring.rotation.z = _t * 0.8
	var s := 1.0 + sin(_t * 3.0) * 0.03
	_ring.scale = Vector3(s, s, s)
	if not active or not touch_enter or _fired:
		return
	var p := Game.player as Node3D
	if p == null or Game.input_locked:
		return
	var center := global_position if flat else global_position
	var d := (p.global_position + Vector3.UP * 0.6).distance_to(center)
	if d < radius * 0.9:
		_fired = true
		entered.emit()


func _disc_shader() -> Shader:
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, shadows_disabled;
uniform vec4 tint : source_color = vec4(1.0, 0.8, 0.4, 1.0);
void fragment() {
	vec2 p = UV - vec2(0.5);
	float r = length(p) * 2.0;
	float a = atan(p.y, p.x);
	float sw = sin(a * 5.0 - r * 9.0 + TIME * 4.0) * 0.5 + 0.5;
	float glow = smoothstep(1.0, 0.0, r);
	vec3 col = mix(tint.rgb, vec3(1.0), sw * 0.5 * glow);
	ALBEDO = col * (0.35 + sw * 0.65) * glow * 1.4;
	ALPHA = glow;
}
"""
	return sh
