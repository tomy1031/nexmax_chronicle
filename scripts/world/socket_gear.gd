class_name SocketGear
extends ClawTarget
## つかんで運び、軸（ソケット）の近くで離すと設置される歯車（P2 / 仕様 §5.4「配置」）。
## 遠くで離すと元の場所へ補間で戻り、すぐ再挑戦できる。

signal placed(socket: Node3D)

var home: Transform3D
var sockets: Array[Node3D] = []
var snap_radius := 2.6
var visual: Node3D
var carry_height := 1.5
var _ghosts: Array[Node3D] = []
var _carried := false
var _spin := 0.0
var _near: Node3D = null
var _settled_on: Node3D = null


func setup(p_visual: Node3D, p_sockets: Array[Node3D], gear_radius: float) -> void:
	visual = p_visual
	sockets = p_sockets
	home = global_transform
	claw_offset = Vector3(0, 0, 0)
	for s in sockets:
		var ghost := LevelKit.gear(s, Vector3.ZERO, gear_radius, 0.3, Color(0.4, 0.9, 1.0, 0.28), 10)
		for mi in ghost.find_children("*", "MeshInstance3D", true, false):
			(mi as MeshInstance3D).material_override = LevelKit.unshaded(Color(0.4, 0.9, 1.0, 0.25))
			(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		ghost.visible = false
		_ghosts.append(ghost)


func is_placed() -> bool:
	return _settled_on != null


func reset_to_home() -> void:
	_settled_on = null
	grab_enabled = true
	global_transform = home


func on_grab(claw: Node) -> void:
	super.on_grab(claw)
	_carried = true
	for g in _ghosts:
		g.visible = true


func hold_process(delta: float, claw: Node) -> void:
	var target: Vector3 = claw.hold_point(carry_height)
	global_position = global_position.lerp(target, 1.0 - exp(-9.0 * delta))
	# 運ぶ間は縦向きにしてプレイヤー側へ面を向ける
	var to_player: Vector3 = (claw.player.global_position - global_position)
	to_player.y = 0.0
	if to_player.length() > 0.1:
		var want := Basis.looking_at(-to_player.normalized(), Vector3.UP)
		global_basis = global_basis.slerp(want, 1.0 - exp(-6.0 * delta)).orthonormalized()
	_spin += delta * 1.5
	if visual:
		visual.rotation.z = _spin
	_near = _nearest_socket()
	for i in sockets.size():
		var g := _ghosts[i]
		var hot := sockets[i] == _near
		g.scale = Vector3.ONE * (1.0 + (0.06 * sin(Time.get_ticks_msec() * 0.012) if hot else 0.0))
		for mi in g.find_children("*", "MeshInstance3D", true, false):
			(mi as MeshInstance3D).material_override = LevelKit.unshaded(Color(1.0, 0.9, 0.35, 0.5) if hot else Color(0.4, 0.9, 1.0, 0.22))
	if _near:
		Hud.hint("ここで左クリック（E）で離すと、軸にはまる", 0.3)


func on_release(claw: Node) -> void:
	super.on_release(claw)
	_carried = false
	for g in _ghosts:
		g.visible = false
	var s := _nearest_socket()
	var tw := create_tween()
	if s:
		grab_enabled = false
		_settled_on = s
		tw.tween_method(func(t: float) -> void: global_transform = global_transform.interpolate_with(s.global_transform, t), 0.0, 1.0, 0.35)
		tw.tween_callback(func() -> void:
			global_transform = s.global_transform
			if visual:
				visual.rotation.z = 0.0
			Sfx.play("gear_place")
			placed.emit(s))
	else:
		grab_enabled = false
		Sfx.play("misfire", 0.8)
		Hud.hint("軸から遠すぎる。光る位置の近くで離そう", 3.0)
		var from := global_transform
		tw.tween_method(func(t: float) -> void: global_transform = from.interpolate_with(home, t), 0.0, 1.0, 0.55) \
				.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
		tw.tween_callback(func() -> void:
			global_transform = home
			grab_enabled = true)


func _nearest_socket() -> Node3D:
	var best: Node3D = null
	var best_d := snap_radius
	for s in sockets:
		var d := s.global_position.distance_to(global_position)
		if d < best_d:
			best_d = d
			best = s
	return best
