class_name ClawTarget
extends Node3D
## NMClaw で触れられる対象（仕様 §14.2 ClawTarget）。
## 可動物は物理計算で運ばず、決められたソケット・補間移動で動かす（仕様 §5.3）。

signal grabbed
signal hold_started
signal released

@export var display_name := "対象"
var grab_enabled := true
## クローの先端が付く位置（ローカル座標）
var claw_offset := Vector3.ZERO
## 0 より大きいと、保持中はこの距離より離れられない（その場で支える対象）
var leash := 0.0
## 保持中の移動速度の倍率
var move_factor := 0.45
## 照準範囲の追加距離
var extra_range := 0.0


func _enter_tree() -> void:
	add_to_group("claw_target")


func can_grab() -> bool:
	return grab_enabled and is_visible_in_tree()


func can_keep_holding() -> bool:
	return true


func claw_point() -> Vector3:
	return to_global(claw_offset)


func on_grab(_claw: Node) -> void:
	grabbed.emit()


func on_hold_start(_claw: Node) -> void:
	hold_started.emit()


func hold_process(_delta: float, _claw: Node) -> void:
	pass


func on_release(_claw: Node) -> void:
	released.emit()
