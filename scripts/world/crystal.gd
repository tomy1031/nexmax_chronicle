class_name Crystal
extends Node3D
## 時の結晶。触れると集まり、エネルギーが少し回復する。取得状態は保存される。

var crystal_id := ""
var _gem: MeshInstance3D
var _t := 0.0
var _base_y := 0.0


static func create(parent: Node, id: String, pos: Vector3) -> Crystal:
	if TimelineState.crystals.has(id):
		return null
	var c := Crystal.new()
	c.crystal_id = id
	c.position = pos
	parent.add_child(c)
	return c


func _ready() -> void:
	_base_y = position.y
	_t = randf() * TAU
	_gem = MeshInstance3D.new()
	_gem.mesh = LevelKit.diamond_mesh(0.22)
	_gem.material_override = LevelKit.mat(Color(1.0, 0.85, 0.25), 1.8, 0.3)
	_gem.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_gem)


func _process(delta: float) -> void:
	_t += delta
	_gem.rotation.y += delta * 2.2
	position.y = _base_y + sin(_t * 2.5) * 0.12
	var p := Game.player as Node3D
	if p and p.global_position.distance_to(global_position - Vector3(0, 0.5, 0)) < 1.15:
		_collect(p)


func _collect(p: Node3D) -> void:
	if TimelineState.collect_crystal(crystal_id):
		Sfx.play("crystal", randf_range(0.95, 1.08))
		if p.has_method("add_energy"):
			p.call("add_energy", 0.25)
		Hud.set_crystals(TimelineState.crystal_count())
	set_process(false)
	var tw := create_tween()
	tw.tween_property(self, "scale", Vector3.ONE * 1.8, 0.12)
	tw.tween_property(self, "scale", Vector3.ZERO, 0.15)
	tw.tween_callback(queue_free)
