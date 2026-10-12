extends "res://scripts/world/claw_target.gd"
## 警備ロボの正面の盾（ClawTarget）。NMClaw でつかむと、プレイヤーの方へ引きはがされる（仕様 §5.1「敵の盾」/ §8.2）。
## つかむ → 保持開始で短く引き寄せる → クロー側から自動で解除 → ロボがひるむ。
## 盾の見た目はこのノードの子。はがした盾の残骸はロボが別に作って落とす。

const RIP_TIME := 0.28

var robot: Node = null        # GuardRobot
var home := Transform3D()     # ロボに対するもとの位置
var _ripping := false
var _rip_t := 0.0
var _rip_from := Vector3.ZERO


func _init() -> void:
	display_name = "警備ロボの盾"
	move_factor = 0.3
	extra_range = 0.3


func _ready() -> void:
	home = transform


func can_grab() -> bool:
	return super.can_grab() and robot != null and is_instance_valid(robot) and robot.call("shield_up")


func can_keep_holding() -> bool:
	return robot != null and is_instance_valid(robot)


func on_grab(claw: Node) -> void:
	super.on_grab(claw)
	_ripping = false
	if robot:
		robot.call("on_shield_grabbed")


func on_hold_start(claw: Node) -> void:
	super.on_hold_start(claw)
	_ripping = true
	_rip_t = 0.0
	_rip_from = global_position
	Sfx.play("ratchet", 1.7, -2.0)


## 保持中：盾をプレイヤーの方へ短く引き寄せ、終わったらクロー側から解除する。
func hold_process(delta: float, claw: Node) -> void:
	if not _ripping:
		return
	_rip_t += delta
	var k := clampf(_rip_t / RIP_TIME, 0.0, 1.0)
	var p: Node3D = claw.get("player")
	var to := _rip_from
	if p:
		to = _rip_from.lerp(p.global_position + Vector3.UP * 0.9, 0.45)
	var shake := Vector3(sin(_rip_t * 90.0), cos(_rip_t * 70.0), 0.0) * 0.04 * (1.0 - k)
	global_position = _rip_from.lerp(to, ease(k, 0.35)) + shake
	if _rip_t >= RIP_TIME:
		claw.call("force_release")


func on_release(claw: Node) -> void:
	super.on_release(claw)
	var ripped := _ripping
	_ripping = false
	if robot == null or not is_instance_valid(robot):
		return
	if ripped:
		robot.call("on_shield_ripped", global_transform)
	else:
		robot.call("on_shield_grab_cancelled")
	transform = home


func is_ripping() -> bool:
	return _ripping
