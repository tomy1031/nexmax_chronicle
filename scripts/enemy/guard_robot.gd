class_name GuardRobot
extends CharacterBody3D
## 2086年の小型警備ロボット（仕様 §8）。破壊ではなく機能停止が中心。
## 正面の盾は ClawTarget。クローで引きはがすと短時間ひるみ、その間に基本攻撃で機能停止する。
## （仮実装：詳細は差し替え予定）

signal shut_down

## true を返す間だけプレイヤーを狙う（闘技場の外では反応しない）
var arena_check: Callable = func() -> bool: return true
var patrol: Array[Vector3] = []
var _disabled := false


static func create(parent: Node, pos: Vector3, p_patrol: Array[Vector3] = []) -> GuardRobot:
	var r := GuardRobot.new()
	r.position = pos
	r.patrol = p_patrol
	parent.add_child(r)
	return r


func _ready() -> void:
	add_to_group("enemy")


func is_disabled() -> bool:
	return _disabled


func on_player_attack(_player: Node) -> void:
	pass
