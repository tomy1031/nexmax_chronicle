class_name ObjectiveMarker
extends Node3D
## 次の目標の位置を示す黄色いダイヤ（壁越しにも見える）と距離表示。

var target: Node3D = null
var offset := Vector3(0, 2.6, 0)
var _gem: MeshInstance3D
var _label: Label3D
var _t := 0.0


func _ready() -> void:
	top_level = true
	_gem = MeshInstance3D.new()
	_gem.mesh = LevelKit.diamond_mesh(0.28)
	_gem.material_override = LevelKit.unshaded(Color(1.0, 0.82, 0.2, 0.95), true)
	_gem.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_gem)
	_label = LevelKit.label(self, "", Vector3(0, 0.6, 0), 40, Color(1.0, 0.95, 0.7), true)
	_label.no_depth_test = true
	_label.outline_size = 8
	_label.outline_modulate = Color(0, 0, 0, 0.8)
	_label.fixed_size = true
	_label.pixel_size = 0.0009
	_label.render_priority = 11


func _process(delta: float) -> void:
	_t += delta
	var p := Game.player as Node3D
	if target == null or not is_instance_valid(target) or not target.is_visible_in_tree() or p == null:
		visible = false
		return
	var pos := target.global_position + offset
	var d := p.global_position.distance_to(target.global_position)
	visible = d > 3.2
	global_position = pos + Vector3(0, sin(_t * 2.5) * 0.15, 0)
	_gem.rotation.y += delta * 2.0
	# 遠くても見える大きさに
	var s := clampf(d / 14.0, 1.0, 3.0)
	_gem.scale = Vector3.ONE * s
	_label.text = "%dm" % int(d)
