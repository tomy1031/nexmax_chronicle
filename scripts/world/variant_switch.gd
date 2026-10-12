class_name VariantSwitch
extends Node3D
## 時代改変で切り替わる場所（仕様 §4.3）。
## anchor_id ごとに、あらかじめ作った複数の状態（variant_id）を表示・当たり判定ごと切り替える。

@export var anchor_id := ""
var variants := {}
var current := ""


func add_variant(variant_id: String) -> Node3D:
	var n := Node3D.new()
	n.name = "Variant_%s" % variant_id
	add_child(n)
	variants[variant_id] = n
	return n


func set_variant(variant_id: String) -> void:
	current = variant_id
	for k in variants:
		_set_active(variants[k], k == variant_id)


static func _set_active(n: Node3D, on: bool) -> void:
	n.visible = on
	n.process_mode = Node.PROCESS_MODE_INHERIT if on else Node.PROCESS_MODE_DISABLED
	# 調べる対象・クロー対象は is_visible_in_tree() で判定されるので、表示の切替で無効になる
	for cs in n.find_children("*", "CollisionShape3D", true, false):
		(cs as CollisionShape3D).set_deferred("disabled", not on)
