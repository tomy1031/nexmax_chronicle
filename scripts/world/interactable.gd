class_name Interactable
extends Node3D
## F で調べる／話す対象。近くの1つだけプロンプトを出す（仕様 §5.2）。

signal interacted

@export var prompt_text := "調べる"
@export var radius := 2.4
var enabled := true
var label_offset := Vector3(0, 2.0, 0)


func _enter_tree() -> void:
	add_to_group("interactable")


func interact() -> void:
	interacted.emit()


static func create(parent: Node, pos: Vector3, text: String, callback: Callable, p_radius: float = 2.4, offset_y: float = 2.0) -> Interactable:
	var it := Interactable.new()
	it.position = pos
	it.prompt_text = text
	it.radius = p_radius
	it.label_offset = Vector3(0, offset_y, 0)
	it.interacted.connect(callback)
	parent.add_child(it)
	return it
