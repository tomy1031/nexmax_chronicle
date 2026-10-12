extends EraBase
## 1726年 大坂・仕掛け横丁（仕様 §9 の 9〜21分 / P2・P3）。
## からくり人形を追って源兵衛へ → 外れた大歯車を NMClaw で軸へ戻す（配置）
## → 大歯車を支え、源兵衛が歯止めを調整、おはるの合図で離す（協力・判断）→ 水が引き、飛び石が現れる。

const GATE_X := 12.0
const AXLE := Vector3(12.0, 2.2, 6.0)
const BOARD_OPEN_Y := 3.7
const BOARD_CLOSED_Y := -1.5
const WATER_UP := -0.35
const WATER_DOWN_HIGH := -0.3
const WATER_DOWN_LOW := -1.5
const GEAR_RADIUS := 1.3
const GEAR_HOME := Vector3(6.2, 1.0, 10.4)

const C_WOOD := Color(0.55, 0.38, 0.24)
const C_WOOD_DARK := Color(0.36, 0.24, 0.16)
const C_PLASTER := Color(0.93, 0.89, 0.8)
const C_ROOF := Color(0.24, 0.27, 0.34)
const C_STONE := Color(0.62, 0.6, 0.56)
const C_GROUND := Color(0.64, 0.52, 0.38)

var genbei: Npc
var oharu: Npc
var doll: Npc
var gear: SocketGear
var gate_hold: ClawTarget
var board: Node3D
var water_down: MeshInstance3D
var spray: CPUParticles3D
var logic := GatePuzzleLogic.new()
var puzzle_active := false

var _down_level := WATER_DOWN_HIGH
var _boats: Array[Dictionary] = []
var _boat_root: Node3D
var _was_danger := false
var _doll_guiding := false
var _gear_hint_done := false
var _wheel: Node3D
var _hold_bark_done := false
var _shake_t := 0.0
var _gear_angle := 0.0
var _rope: MeshInstance3D
var _ratchet_wheel: Node3D


func _init() -> void:
	era = TimelineState.ERA_EDO
	music_theme = "edo"


# ================================================================ ワールド

func _build_world() -> void:
	sun = LevelKit.environment(self, Color(0.3, 0.52, 0.86), Color(1.0, 0.83, 0.64), Color(0.42, 0.36, 0.3),
			Color(1.0, 0.9, 0.74), 1.25, Vector3(-52, 150, 0), 0.68, Color(1.0, 0.86, 0.7, 1.0))
	_down_level = WATER_DOWN_LOW if TimelineState.gate_repaired else WATER_DOWN_HIGH

	_build_ground()
	_build_canal()
	_build_street()
	_build_workshop()
	_build_gate()
	_build_warehouse()
	_build_north_bank()
	_build_backdrop()
	_build_crystals()

	# 帰還地点（到着地点）。2026年の IDO 標識と同じ街区
	var ring := Portal.create(self, Vector3(14.8, 0.03, 12.8), Color(0.45, 0.9, 1.0), 1.1, true)
	ring.touch_enter = false
	var ret := Interactable.create(self, Vector3(14.8, 0.0, 12.8), "2026年へ帰還する（帰還地点）", _on_return_point, 1.6, 1.6)
	targets["return_point"] = ret

	add_spawn("edo_arrive", Vector3(14.8, 0.1, 12.8), 62.0)
	add_spawn("default", Vector3(14.8, 0.1, 12.8), 62.0)

	_build_npcs()


func _build_ground() -> void:
	# 南岸（通り）と北岸
	LevelKit.box(self, Vector3(-1, -1.5, 14.0), Vector3(74, 3.0, 20.0), C_GROUND)
	LevelKit.box(self, Vector3(-1, -1.5, -15.0), Vector3(74, 3.0, 22.0), C_GROUND.darkened(0.05))
	# 石畳の帯
	for i in 18:
		var x := -34.0 + i * 3.9
		LevelKit.box(self, Vector3(x, 0.01, 12.5), Vector3(3.7, 0.04, 3.2), Color(0.6, 0.55, 0.48).lerp(Color(0.52, 0.5, 0.47), fmod(i * 0.37, 1.0)), false)
	# 範囲の見えない壁
	LevelKit.wall(self, Vector3(-37, 3, 0), Vector3(1, 12, 60))
	LevelKit.wall(self, Vector3(35, 3, 0), Vector3(1, 12, 60))
	LevelKit.wall(self, Vector3(0, 3, 25.5), Vector3(74, 12, 1))
	LevelKit.wall(self, Vector3(0, 3, -26.5), Vector3(74, 12, 1))


func _build_canal() -> void:
	# 水路の底と石垣
	LevelKit.box(self, Vector3(0, -3.2, 0), Vector3(80, 0.4, 8.4), Color(0.3, 0.3, 0.28))
	for sz in [-1.0, 1.0]:
		LevelKit.box(self, Vector3(-1, -1.5, 4.25 * sz), Vector3(74, 3.0, 0.5), C_STONE, true)
		for i in 24:
			var x := -36.0 + i * 3.1
			LevelKit.box(self, Vector3(x, -0.6, 4.02 * sz), Vector3(1.4, 0.5, 0.08), C_STONE.darkened(0.12 + fmod(i * 0.29, 1.0) * 0.08), false)
	# 水面：上流（屋根付き水路側）と下流
	LevelKit.water(self, Vector3(26.0, WATER_UP, 0), Vector2(28, 8.0), Color(0.06, 0.28, 0.42), Color(0.3, 0.68, 0.78), Vector2(-0.25, 0.0))
	water_down = LevelKit.water(self, Vector3(-14.0, _down_level, 0), Vector2(52, 8.0), Color(0.06, 0.28, 0.42), Color(0.3, 0.68, 0.78),
			Vector2(-0.6, 0.0) if not TimelineState.gate_repaired else Vector2(-0.05, 0.0))
	# 南岸の欄干（水門の周りは開ける）
	for i in 22:
		var x := -34.0 + i * 2.0
		if x > 7.0 and x < 17.0:
			continue
		if x > -3.0 and x < 3.0:
			continue
		LevelKit.box(self, Vector3(x, 0.45, 4.7), Vector3(0.14, 0.9, 0.14), Color(0.62, 0.2, 0.16), false)
	for seg in [[-34.0, -3.0], [3.0, 7.0]]:
		var a: float = seg[0]
		var b: float = seg[1]
		LevelKit.box(self, Vector3((a + b) * 0.5, 0.85, 4.7), Vector3(b - a, 0.1, 0.12), Color(0.7, 0.24, 0.18), false)
	LevelKit.wall(self, Vector3(-18.5, 0.8, 4.7), Vector3(31, 1.6, 0.3))
	LevelKit.wall(self, Vector3(5.0, 0.8, 4.7), Vector3(4, 1.6, 0.3))

	# 石段（2026年にも残る古い石段）と、水が引くと現れる下の石の通路（x -11〜0）
	for i in 3:
		var top := -0.25 - i * 0.25
		LevelKit.box(self, Vector3(2.0 - i * 0.8, top - 0.5, 3.6), Vector3(0.8, 1.0, 0.8), C_STONE.lightened(0.05), true)
	LevelKit.box(self, Vector3(-5.5, -1.05, 3.6), Vector3(11.0, 0.3, 0.8), C_STONE.darkened(0.05), true)

	# 飛び石（水が引くと渡れる）
	for i in 4:
		var z := 3.0 - i * 2.0
		LevelKit.cyl(self, Vector3(-4.0, -1.0, z), 0.62, 0.3, Color(0.55, 0.53, 0.5), true, Vector3.ZERO, 10)


func _build_street() -> void:
	# 通り沿いの町家（南側、正面は北＝水路側）
	var shops := [
		[-31.0, "宿", Color(0.2, 0.32, 0.55)],
		[-25.0, "呉服", Color(0.55, 0.2, 0.3)],
		[-19.0, "茶屋", Color(0.25, 0.45, 0.32)],
		[-2.0, "団子", Color(0.6, 0.35, 0.18)],
		[4.0, "酒", Color(0.2, 0.3, 0.5)],
		[10.0, "米", Color(0.45, 0.38, 0.2)],
	]
	for s in shops:
		_machiya(self, Vector3(s[0], 0, 21.5), 5.4, s[1], s[2])
	for s in [[22.0, "油", Color(0.5, 0.3, 0.15)], [28.5, "道具", Color(0.2, 0.35, 0.45)]]:
		_machiya(self, Vector3(s[0], 0, 21.5), 5.4, s[1], s[2])
	# 縦の幟「仕掛け横丁」
	_banner(Vector3(-22.0, 0, 16.5), "仕掛け横丁", Color(0.75, 0.18, 0.15))
	_banner(Vector3(1.0, 0, 16.5), "からくり", Color(0.18, 0.25, 0.5))
	# 提灯と柳・桜
	for i in 8:
		var x := -32.0 + i * 6.0
		LevelKit.cyl(self, Vector3(x, 1.4, 5.4), 0.07, 2.8, C_WOOD_DARK)
		LevelKit.box(self, Vector3(x, 2.8, 5.65), Vector3(0.08, 0.08, 0.6), C_WOOD_DARK, false)
		LevelKit.lantern(self, Vector3(x, 2.35, 5.9), Color(1.0, 0.42, 0.28) if i % 2 == 0 else Color(1.0, 0.85, 0.55))
	for x in [-28.0, -12.0, 6.0]:
		LevelKit.sakura(self, Vector3(x, 0, 7.0), 1.0)
	# 木箱と俵（足場遊び：屋根の上に結晶）
	_crate(Vector3(-16.0, 0.45, 17.6), 0.9)
	_crate(Vector3(-16.9, 0.45, 18.3), 0.9)
	_crate(Vector3(-16.5, 1.35, 18.4), 0.9)
	LevelKit.box(self, Vector3(-19.0, 2.55, 19.3), Vector3(4.2, 0.2, 2.2), C_WOOD_DARK)   # 低い庇の上
	_crate(Vector3(7.2, 0.45, 15.8), 0.9)
	_crate(Vector3(8.0, 0.45, 16.5), 0.9)
	# 俵
	for i in 3:
		LevelKit.cyl(self, Vector3(-4.5 + i * 0.75, 0.35, 16.8), 0.35, 0.9, Color(0.85, 0.75, 0.45), true, Vector3(90, 0, 0), 10)


func _machiya(parent: Node3D, pos: Vector3, w: float, sign_text: String, noren: Color) -> void:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	var d := 5.0
	LevelKit.box(n, Vector3(0, 1.3, 0), Vector3(w, 2.6, d), C_WOOD)
	LevelKit.box(n, Vector3(0, 3.5, 0.3), Vector3(w * 0.96, 1.8, d - 0.6), C_PLASTER)
	LevelKit.roof(n, Vector3(0, 2.75, -0.3), w + 0.9, d + 1.6, 0.5, C_ROOF)
	LevelKit.roof(n, Vector3(0, 4.75, 0.3), w + 0.6, d + 0.6, 1.1, C_ROOF)
	# 格子と入口
	LevelKit.box(n, Vector3(0, 1.1, -d * 0.5 - 0.02), Vector3(w * 0.5, 2.2, 0.06), Color(0.15, 0.1, 0.08), false)
	for i in 6:
		LevelKit.box(n, Vector3(-w * 0.45 + i * 0.18, 1.2, -d * 0.5 - 0.06), Vector3(0.06, 1.8, 0.06), C_WOOD_DARK, false)
	# 暖簾
	for i in 3:
		LevelKit.box(n, Vector3(-0.6 + i * 0.62, 1.95, -d * 0.5 - 0.12), Vector3(0.58, 0.9, 0.04), noren, false)
	LevelKit.label(n, sign_text, Vector3(0, 1.95, -d * 0.5 - 0.16), 72, Color(0.98, 0.96, 0.9), false, Vector3(0, 180, 0))
	# 看板
	LevelKit.box(n, Vector3(w * 0.32, 3.6, -d * 0.5 + 0.15), Vector3(1.4, 0.7, 0.1), C_WOOD_DARK, false)
	LevelKit.label(n, sign_text, Vector3(w * 0.32, 3.6, -d * 0.5 + 0.08), 56, Color(1.0, 0.9, 0.6), false, Vector3(0, 180, 0))
	LevelKit.lantern(n, Vector3(-w * 0.42, 2.35, -d * 0.5 - 0.4), Color(1.0, 0.4, 0.26))


func _banner(pos: Vector3, text: String, color: Color) -> void:
	LevelKit.cyl(self, pos + Vector3(0, 2.4, 0), 0.06, 4.8, C_WOOD_DARK)
	LevelKit.box(self, pos + Vector3(0.45, 2.7, 0), Vector3(0.85, 3.2, 0.05), color, false)
	LevelKit.vlabel(self, text, pos + Vector3(0.45, 2.7, -0.04), 64, Color(1, 0.97, 0.9), Vector3(0, 180, 0))
	LevelKit.vlabel(self, text, pos + Vector3(0.45, 2.7, 0.04), 64, Color(1, 0.97, 0.9))


func _crate(pos: Vector3, s: float) -> void:
	LevelKit.box(self, pos, Vector3(s, s, s), Color(0.66, 0.5, 0.32))
	LevelKit.box(self, pos + Vector3(0, 0, -s * 0.51), Vector3(s * 0.9, 0.08, 0.02), C_WOOD_DARK, false)
	LevelKit.box(self, pos + Vector3(0, 0, -s * 0.51), Vector3(0.08, s * 0.9, 0.02), C_WOOD_DARK, false)


func _build_workshop() -> void:
	# 源兵衛の工房（からくり屋）
	var n := Node3D.new()
	n.position = Vector3(-10.0, 0, 21.8)
	add_child(n)
	var w := 8.4
	var d := 5.6
	LevelKit.box(n, Vector3(0, 0.05, 0), Vector3(w, 0.1, d), Color(0.5, 0.4, 0.3), false)
	LevelKit.box(n, Vector3(0, 1.7, d * 0.5 - 0.15), Vector3(w, 3.4, 0.3), C_WOOD)          # 奥の壁
	LevelKit.box(n, Vector3(-w * 0.5 + 0.15, 1.7, 0), Vector3(0.3, 3.4, d), C_WOOD)
	LevelKit.box(n, Vector3(w * 0.5 - 0.15, 1.7, 0), Vector3(0.3, 3.4, d), C_WOOD)
	for x in [-w * 0.5 + 0.2, -1.4, 1.4, w * 0.5 - 0.2]:
		LevelKit.box(n, Vector3(x, 1.7, -d * 0.5 + 0.2), Vector3(0.3, 3.4, 0.3), C_WOOD_DARK)
	LevelKit.box(n, Vector3(0, 3.6, 0), Vector3(w + 0.2, 0.5, d + 0.2), C_WOOD_DARK)
	LevelKit.box(n, Vector3(0, 4.6, 0.3), Vector3(w, 1.6, d - 0.6), C_PLASTER)
	LevelKit.roof(n, Vector3(0, 6.0, 0.3), w + 1.0, d + 1.0, 1.3, C_ROOF)
	LevelKit.roof(n, Vector3(0, 3.95, -0.6), w + 1.2, d + 1.2, 0.45, C_ROOF)
	# 大看板「源兵衛」と歯車の紋
	LevelKit.box(n, Vector3(0, 4.6, -d * 0.5 + 0.2), Vector3(4.6, 1.2, 0.16), Color(0.72, 0.56, 0.36))
	LevelKit.label(n, "源兵衛", Vector3(-0.4, 4.6, -d * 0.5 + 0.1), 120, Color(0.2, 0.12, 0.08), false, Vector3(0, 180, 0))
	var emblem := LevelKit.gear(n, Vector3(1.7, 4.6, -d * 0.5 + 0.08), 0.42, 0.06, Color(0.25, 0.16, 0.1), 8)
	emblem.name = "Emblem"
	# 縦看板「からくり」
	LevelKit.box(n, Vector3(w * 0.5 + 0.5, 2.4, -d * 0.5 + 0.2), Vector3(0.7, 2.6, 0.12), Color(0.68, 0.52, 0.34))
	LevelKit.vlabel(n, "からくり", Vector3(w * 0.5 + 0.5, 2.4, -d * 0.5 + 0.12), 60, Color(0.2, 0.12, 0.08), Vector3(0, 180, 0))
	# 藍の暖簾（白い歯車の紋）
	for i in 4:
		var x := -1.05 + i * 0.7
		LevelKit.box(n, Vector3(x, 2.9, -d * 0.5 + 0.05), Vector3(0.66, 0.85, 0.04), Color(0.14, 0.2, 0.42), false)
	var nemb := LevelKit.gear(n, Vector3(0, 2.92, -d * 0.5 + 0.0), 0.22, 0.02, Color(0.95, 0.95, 0.9), 8)
	nemb.name = "NorenEmblem"
	# 中：作業台・棚・小さなからくり・吊るした歯車
	LevelKit.box(n, Vector3(-1.8, 0.5, 0.9), Vector3(2.6, 1.0, 1.1), C_WOOD_DARK)
	LevelKit.box(n, Vector3(2.6, 1.4, 2.2), Vector3(2.4, 2.8, 0.6), C_WOOD_DARK)
	for i in 3:
		for j in 3:
			var p := Vector3(1.8 + i * 0.75, 0.75 + j * 0.85, 1.9)
			LevelKit.box(n, p, Vector3(0.3, 0.42, 0.3), Color(0.8, 0.6, 0.4).darkened(0.1 * j))
			LevelKit.sphere(n, p + Vector3(0, 0.32, 0), 0.14, Color(0.96, 0.9, 0.8))
	for i in 3:
		var g := LevelKit.gear(n, Vector3(-2.8 + i * 1.3, 2.6, 1.2), 0.35 + i * 0.08, 0.1, Color(0.7, 0.55, 0.3), 8)
		g.rotation.z = i * 0.4
	LevelKit.lantern(n, Vector3(-w * 0.5 - 0.3, 2.6, -d * 0.5 - 0.2), Color(1.0, 0.85, 0.5))
	LevelKit.lantern(n, Vector3(w * 0.5 + 1.0, 3.4, -d * 0.5 - 0.2), Color(1.0, 0.42, 0.28))
	targets["workshop"] = n


func _build_gate() -> void:
	# からくり水門：柱・梁・堰板・大歯車の軸受・歯止め台
	for sz in [-1.0, 1.0]:
		LevelKit.box(self, Vector3(GATE_X, 1.4, 4.65 * sz), Vector3(0.9, 8.8, 0.9), C_WOOD_DARK)
		LevelKit.box(self, Vector3(GATE_X, 5.9, 4.65 * sz), Vector3(1.1, 0.3, 1.1), Color(0.3, 0.2, 0.14), false)
	LevelKit.box(self, Vector3(GATE_X, 5.8, 0), Vector3(1.0, 0.6, 10.4), C_WOOD_DARK)
	LevelKit.box(self, Vector3(GATE_X, 6.3, 0), Vector3(1.4, 0.3, 11.0), Color(0.32, 0.22, 0.15), false)
	LevelKit.cyl(self, Vector3(GATE_X, 6.25, 2.6), 0.32, 0.4, Color(0.4, 0.3, 0.2), false, Vector3(0, 0, 90))  # 滑車
	board = Node3D.new()
	board.position = Vector3(GATE_X, BOARD_CLOSED_Y if TimelineState.gate_repaired else BOARD_OPEN_Y, 0)
	add_child(board)
	LevelKit.box(board, Vector3.ZERO, Vector3(0.36, 3.2, 8.5), Color(0.5, 0.35, 0.22))
	for i in 4:
		LevelKit.box(board, Vector3(-0.2, -1.2 + i * 0.8, 0), Vector3(0.06, 0.12, 8.5), C_WOOD_DARK, false)
	# 綱（梁の滑車から堰板へ。長さは毎フレーム合わせる）
	var rm := BoxMesh.new()
	rm.size = Vector3(0.07, 1.0, 0.07)
	_rope = LevelKit.mesh(self, rm, Vector3(GATE_X, 5.0, 2.6), LevelKit.mat(Color(0.85, 0.78, 0.6)))

	# 南岸の軸受台
	LevelKit.box(self, Vector3(GATE_X, 1.15, 5.25), Vector3(0.9, 2.3, 0.4), C_WOOD_DARK)                # 軸受（歯車の奥）
	LevelKit.box(self, Vector3(GATE_X, 2.2, 5.4), Vector3(0.25, 0.25, 1.6), Color(0.3, 0.25, 0.2), false)  # 軸
	LevelKit.box(self, Vector3(GATE_X, 0.04, 7.2), Vector3(3.6, 0.08, 2.2), C_WOOD_DARK)                   # 台座
	var sock := Node3D.new()
	sock.name = "GearSocket"
	sock.position = AXLE
	add_child(sock)
	var sockets: Array[Node3D] = [sock]

	# 歯止め台（源兵衛が調整する）
	var ratchet := Node3D.new()
	ratchet.position = Vector3(14.0, 0, 7.0)
	add_child(ratchet)
	LevelKit.box(ratchet, Vector3(0, 0.6, 0), Vector3(0.9, 1.2, 0.9), C_WOOD)
	var small := LevelKit.gear(ratchet, Vector3(0, 1.45, 0), 0.4, 0.12, Color(0.7, 0.55, 0.28), 8)
	small.name = "RatchetWheel"
	small.rotation.y = PI * 0.5
	_ratchet_wheel = small
	LevelKit.box(ratchet, Vector3(-0.5, 1.6, 0), Vector3(0.7, 0.12, 0.12), Color(0.3, 0.3, 0.32), false)
	LevelKit.label(ratchet, "歯止め", Vector3(0, 2.25, 0), 40, Color(1, 0.95, 0.8), true, Vector3.ZERO, Color(0, 0, 0, 0.7))

	# 外れた大歯車（P2：つかんで軸へ運ぶ）
	gear = SocketGear.new()
	gear.display_name = "大歯車"
	add_child(gear)
	var vis := LevelKit.gear(gear, Vector3.ZERO, GEAR_RADIUS, 0.36, Color(0.58, 0.4, 0.24), 12, Color(0.48, 0.32, 0.2))
	vis.name = "Visual"
	if TimelineState.gear_placed:
		gear.global_transform = sock.global_transform
		gear.setup(vis, sockets, GEAR_RADIUS)
		gear.grab_enabled = false
	else:
		# 外れて木箱に立てかけられた大歯車（面が見えるよう斜めに）
		gear.global_transform = Transform3D(Basis(Vector3.UP, deg_to_rad(-70)) * Basis(Vector3.RIGHT, deg_to_rad(28)), GEAR_HOME)
		_crate(GEAR_HOME + Vector3(0.7, -0.55, 0.9), 0.9)
		gear.setup(vis, sockets, GEAR_RADIUS)
	gear.placed.connect(_on_gear_placed)
	targets["gear"] = gear

	# 保持する大歯車（P3：協力パズル）
	gate_hold = ClawTarget.new()
	gate_hold.display_name = "大歯車（支える）"
	gate_hold.position = AXLE
	gate_hold.claw_offset = Vector3(0, GEAR_RADIUS * 0.75, 0.3)
	gate_hold.leash = 3.8
	gate_hold.move_factor = 0.3
	gate_hold.grab_enabled = TimelineState.gear_placed and not TimelineState.gate_repaired
	add_child(gate_hold)
	gate_hold.hold_started.connect(_on_gate_hold_started)
	gate_hold.released.connect(_on_gate_released)
	targets["gate_gear"] = gate_hold

	# 開いたままの水門から吹き出す水しぶき
	spray = CPUParticles3D.new()
	spray.position = Vector3(GATE_X - 0.6, -0.2, 0)
	spray.amount = 90
	spray.lifetime = 0.9
	var sm := SphereMesh.new()
	sm.radius = 0.07
	sm.height = 0.14
	sm.radial_segments = 6
	sm.rings = 3
	spray.mesh = sm
	spray.material_override = LevelKit.mat(Color(0.92, 0.97, 1.0, 0.85), 0.3)
	spray.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	spray.emission_box_extents = Vector3(0.2, 0.2, 3.6)
	spray.direction = Vector3(-1, 0.5, 0)
	spray.spread = 25.0
	spray.initial_velocity_min = 2.0
	spray.initial_velocity_max = 4.0
	spray.gravity = Vector3(0, -6, 0)
	spray.scale_amount_min = 0.6
	spray.scale_amount_max = 1.4
	spray.emitting = not TimelineState.gate_repaired
	add_child(spray)

	_boat_root = Node3D.new()
	add_child(_boat_root)


func _build_warehouse() -> void:
	# 上流の屋根付き水路（プレイヤーからは中が見えない＝おはるの見張りが必要）
	var n := Node3D.new()
	n.position = Vector3(25.0, 0, 0)
	add_child(n)
	var w := 13.0
	LevelKit.box(n, Vector3(0, 3.5, -6.8), Vector3(w, 7.0, 4.4), C_PLASTER)
	LevelKit.box(n, Vector3(0, 3.5, 6.8), Vector3(w, 7.0, 4.4), C_PLASTER)
	LevelKit.box(n, Vector3(0, 0.8, -6.8), Vector3(w + 0.1, 1.6, 4.5), Color(0.2, 0.2, 0.22), false)
	LevelKit.box(n, Vector3(0, 0.8, 6.8), Vector3(w + 0.1, 1.6, 4.5), Color(0.2, 0.2, 0.22), false)
	LevelKit.box(n, Vector3(0, 5.1, 0), Vector3(w, 3.8, 9.2), C_PLASTER)          # 水路の上の壁
	LevelKit.box(n, Vector3(-w * 0.5 + 0.02, 1.6, 0), Vector3(0.1, 3.2, 8.0), Color(0.05, 0.05, 0.06), false)  # 暗い口
	LevelKit.box(n, Vector3(0, -1.6, 0), Vector3(w, 0.2, 8.0), Color(0.05, 0.05, 0.06), false)
	LevelKit.roof(n, Vector3(0, 7.9, 0), w + 1.2, 18.6, 1.8, C_ROOF)
	# 西面の窓（おはるはここから中の水路を見られる）
	for z in [-6.0, 6.0]:
		LevelKit.box(n, Vector3(-w * 0.5 - 0.02, 4.8, z), Vector3(0.06, 1.0, 1.4), Color(0.16, 0.12, 0.1), false)
	# おはるの見張り台（西面のバルコニー）
	LevelKit.box(self, Vector3(17.6, 4.3, 6.6), Vector3(1.6, 0.25, 4.4), C_WOOD)
	for z in [4.5, 8.7]:
		LevelKit.box(self, Vector3(16.85, 4.85, z), Vector3(0.1, 0.9, 0.1), Color(0.62, 0.2, 0.16), false)
	LevelKit.box(self, Vector3(16.85, 5.25, 6.6), Vector3(0.1, 0.1, 4.3), Color(0.7, 0.24, 0.18), false)
	for z in [4.6, 8.6]:
		LevelKit.box(self, Vector3(16.95, 2.15, z), Vector3(0.18, 4.3, 0.18), C_WOOD_DARK, false)
	# はしご
	for i in 9:
		LevelKit.box(self, Vector3(17.0, 0.4 + i * 0.48, 9.3), Vector3(0.6, 0.06, 0.06), C_WOOD_DARK, false)
	for x in [16.72, 17.28]:
		LevelKit.box(self, Vector3(x, 2.2, 9.3), Vector3(0.07, 4.4, 0.07), C_WOOD_DARK, false)
	LevelKit.lantern(self, Vector3(17.0, 5.9, 4.6), Color(1.0, 0.85, 0.5))


func _build_north_bank() -> void:
	# 白壁の蔵
	for x in [-26.0, -18.0, 2.0, 22.0]:
		var n := Node3D.new()
		n.position = Vector3(x, 0, -17.0)
		add_child(n)
		LevelKit.box(n, Vector3(0, 0.7, 0), Vector3(6.0, 1.4, 5.0), Color(0.22, 0.22, 0.25))
		LevelKit.box(n, Vector3(0, 2.6, 0), Vector3(6.0, 2.4, 5.0), C_PLASTER)
		LevelKit.roof(n, Vector3(0, 4.4, 0), 6.8, 5.8, 1.2, C_ROOF)
		LevelKit.box(n, Vector3(0, 2.5, 2.52), Vector3(1.0, 1.0, 0.06), Color(0.2, 0.2, 0.22), false)
	# 水車
	_wheel = Node3D.new()
	_wheel.position = Vector3(-10.0, 1.2, -5.0)
	add_child(_wheel)
	var wv := LevelKit.gear(_wheel, Vector3.ZERO, 2.2, 0.5, Color(0.5, 0.36, 0.22), 14, Color(0.4, 0.28, 0.18))
	wv.rotation.y = PI * 0.5
	LevelKit.box(self, Vector3(-10.0, 1.4, -6.9), Vector3(1.0, 2.8, 2.6), C_WOOD)
	# 鳥居と小さな祠
	var t := Node3D.new()
	t.position = Vector3(10.0, 0, -12.0)
	add_child(t)
	var red := Color(0.85, 0.22, 0.15)
	LevelKit.cyl(t, Vector3(-1.4, 1.6, 0), 0.16, 3.2, red, true)
	LevelKit.cyl(t, Vector3(1.4, 1.6, 0), 0.16, 3.2, red, true)
	LevelKit.box(t, Vector3(0, 3.3, 0), Vector3(4.0, 0.25, 0.3), red, false)
	LevelKit.box(t, Vector3(0, 2.8, 0), Vector3(3.2, 0.16, 0.2), red, false)
	LevelKit.box(t, Vector3(0, 1.0, -3.0), Vector3(1.6, 2.0, 1.4), C_WOOD)
	LevelKit.roof(t, Vector3(0, 2.3, -3.0), 2.2, 2.0, 0.7, C_ROOF)
	for x in [-24.0, -6.0, 16.0, 28.0]:
		LevelKit.sakura(self, Vector3(x, 0, -8.0), 1.1)
	for i in 5:
		LevelKit.lantern(self, Vector3(-28.0 + i * 12.0, 2.3, -5.4), Color(1.0, 0.85, 0.55))
		LevelKit.cyl(self, Vector3(-28.0 + i * 12.0, 1.4, -5.6), 0.07, 2.8, C_WOOD_DARK)


func _build_backdrop() -> void:
	# 遠景の城（北）と山
	var c := Node3D.new()
	c.position = Vector3(6.0, 0, -95.0)
	add_child(c)
	LevelKit.box(c, Vector3(0, 6, 0), Vector3(34, 12, 26), Color(0.55, 0.53, 0.5), false)
	var tiers := [[22.0, 6.0], [17.0, 5.0], [12.5, 4.5], [8.5, 4.0]]
	var y := 12.0
	for tr in tiers:
		LevelKit.box(c, Vector3(0, y + tr[1] * 0.5, 0), Vector3(tr[0], tr[1], tr[0] * 0.75), Color(0.95, 0.94, 0.9), false)
		LevelKit.roof(c, Vector3(0, y + tr[1] + 0.8, 0), tr[0] + 3.0, tr[0] * 0.75 + 3.0, 2.2, Color(0.3, 0.55, 0.5))
		y += tr[1] + 1.0
	LevelKit.box(c, Vector3(0, y + 1.0, 0), Vector3(1.4, 1.4, 1.4), Color(0.95, 0.8, 0.3), false, Vector3.ZERO, 0.6)
	for i in 7:
		var x := -120.0 + i * 40.0
		LevelKit.cone(self, Vector3(x, 0, -160.0 - (i % 2) * 20.0), 40.0 + (i % 3) * 10.0, 40.0 + (i % 2) * 18.0, Color(0.45, 0.6, 0.55), 6)
	for i in 6:
		LevelKit.sakura(self, Vector3(-30.0 + i * 13.0, 0, -40.0 - (i % 2) * 6.0), 1.6)
	# 西の赤い太鼓橋（遠景）
	var b := Node3D.new()
	b.position = Vector3(-46.0, 0, 0)
	add_child(b)
	for i in 7:
		var a := -0.6 + i * 0.2
		LevelKit.box(b, Vector3(0, 1.4 + cos(a * 2.0) * 1.0, sin(a) * 6.0), Vector3(3.0, 0.3, 1.8), Color(0.75, 0.2, 0.15), false, Vector3(rad_to_deg(-a), 0, 0))


func _build_crystals() -> void:
	var pts := [
		Vector3(-30.0, 1.0, 9.0), Vector3(-19.0, 3.4, 19.3), Vector3(-16.5, 2.6, 18.4),
		Vector3(7.6, 1.6, 16.1), Vector3(-1.0, -0.4, 3.55), Vector3(-7.0, -0.4, 3.55),
		Vector3(-4.0, -0.2, -1.0), Vector3(-20.0, 1.0, -10.0), Vector3(10.0, 1.0, -9.5),
		Vector3(24.0, 1.0, -9.0),
	]
	for i in pts.size():
		Crystal.create(self, "edo_c%d" % i, pts[i])


# ================================================================ 人物

func _build_npcs() -> void:
	var at_gate := TimelineState.met_genbei
	if at_gate:
		genbei = Npc.create(self, "genbei", Vector3(14.7, 0, 7.9), 90.0)
		oharu = Npc.create(self, "oharu", Vector3(17.5, 4.45, 6.6), 90.0)
	else:
		genbei = Npc.create(self, "genbei", Vector3(-9.0, 0, 18.4), 0.0)
		oharu = Npc.create(self, "oharu", Vector3(-11.4, 0, 18.6), 0.0)
	targets["genbei"] = genbei
	_update_talks()

	doll = Npc.create(self, "doll", Vector3(10.5, 0, 12.6) if not TimelineState.met_genbei else Vector3(-8.0, 0, 18.0), 90.0)
	doll.face_player = true

	# 町の人
	var v1 := Npc.create(self, "villager", Vector3(-26.0, 0, 15.5), 200.0)
	v1.face_player = true
	v1.set_talk("話す", func() -> void: Hud.bark("町人", "水門が壊れてから、舟も人も難儀しとるんや……"), 2.2)
	var v2 := Npc.create(self, "villager", Vector3(2.0, 0, 15.0), 160.0)
	v2.set_talk("話す", func() -> void: Hud.bark("町人", "源兵衛はんの工房は、通りの真ん中あたりやで。"), 2.2)


func _update_talks() -> void:
	if TimelineState.gate_repaired:
		genbei.set_talk("話す　源兵衛", func() -> void: say("genbei_after"))
		oharu.set_talk("話す　おはる", func() -> void: say("oharu_after"), 3.5)
	elif TimelineState.met_genbei:
		genbei.set_talk("話す　源兵衛", func() -> void:
			if TimelineState.gear_placed:
				say("gate_retry_hint")
			else:
				say("genbei_gear_hint"))
		oharu.clear_talk()
	else:
		genbei.set_talk("話す　源兵衛", _on_talk_genbei_first)
		oharu.set_talk("話す　おはる", _on_talk_genbei_first)


# ================================================================ 物語

func _start_story() -> void:
	checkpoint("edo_arrive", false)
	if not TimelineState.met_genbei:
		await say("edo_arrive_first")
		doll.emote("♪", 2.0)
		Hud.hint("からくり人形が歩き出した。ついて行こう", 4.0)
		_doll_guiding = true
		_guide_doll()
	elif TimelineState.gear_placed and not TimelineState.gate_repaired:
		_begin_puzzle()


func _guide_doll() -> void:
	var path := [Vector3(8.0, 0, 13.0), Vector3(0.0, 0, 13.2), Vector3(-6.0, 0, 14.6), Vector3(-7.6, 0, 17.6)]
	doll.play("walk")
	for pt in path:
		# プレイヤーが離れすぎたら待つ
		while is_inside_tree() and player and player.global_position.distance_to(doll.global_position) > 9.0:
			doll.play("idle")
			await get_tree().create_timer(0.3).timeout
		if not is_inside_tree():
			return
		await doll.walk_to([pt], 2.0)
	doll.play("idle")
	doll.emote("！", 1.5)
	genbei.emote("！", 1.5)
	_doll_guiding = false


func _on_talk_genbei_first() -> void:
	if TimelineState.met_genbei:
		return
	await say("genbei_first")
	TimelineState.met_genbei = true
	refresh_objective()
	_update_talks()
	checkpoint("edo_arrive", false)
	Hud.hint("水門へ向かおう（目標のダイヤ）", 4.0)
	_walk_to_gate()


func _walk_to_gate() -> void:
	# おはるは、はしごの下まで歩いたら見張り台へ上がる
	oharu.arrived.connect(func() -> void: oharu.teleport(Vector3(17.5, 4.45, 6.6), 90.0), CONNECT_ONE_SHOT)
	oharu.walk_to([Vector3(-11.0, 0, 15.0), Vector3(6.0, 0, 13.0), Vector3(16.5, 0, 10.6), Vector3(17.0, 0, 9.8)], 3.6)
	await genbei.walk_to([Vector3(-9.0, 0, 15.0), Vector3(6.0, 0, 12.0), Vector3(14.7, 0, 9.0), Vector3(14.7, 0, 7.9)], 3.2)
	genbei.rotation_degrees.y = 90.0


func _on_gear_placed(_s: Node3D) -> void:
	TimelineState.mark_metric_time("claw_first_success_time")
	Sfx.play("success")
	Hud.toast("大歯車が軸にはまった！", "good")
	_shake_t = 0.4
	await get_tree().create_timer(0.8).timeout
	TimelineState.gear_placed = true
	refresh_objective()
	await say("gear_placed")
	checkpoint("edo_arrive", false)
	_begin_puzzle()


func _begin_puzzle() -> void:
	puzzle_active = true
	gate_hold.grab_enabled = true
	_update_talks()
	Hud.hint("右クリック（Q）で構え、大歯車をつかんで支えよう", 5.0)
	_update_companions()


func _on_gate_hold_started() -> void:
	if not puzzle_active:
		return
	logic.grab()
	if not _hold_bark_done:
		_hold_bark_done = true
		Hud.bark("源兵衛", "よし、そのまま支えといてくれ！ 今、歯止めを入れる！", 3.0)
	elif logic.phase == GatePuzzleLogic.Phase.WAIT_SIGNAL:
		Hud.bark("おはる", "合図するまで、待っててな！", 2.5)
	Hud.hint("支えたまま待とう。離す時は左クリック（E）", 4.0)


func _on_gate_released() -> void:
	if not puzzle_active:
		return
	var r := logic.release()
	match r:
		GatePuzzleLogic.Result.TOO_EARLY:
			TimelineState.add_metric("release_too_early")
			Sfx.play("fail")
			Hud.toast("離すのが早すぎる：歯止めの調整中", "bad")
			Hud.bark("源兵衛", "まだや！ 歯止めが入るまで支えてくれ！", 3.0)
			_board_slip(0.7, true)
		GatePuzzleLogic.Result.PERSON_IN_DANGER:
			TimelineState.add_metric("release_person_danger")
			Sfx.play("ratchet")
			Sfx.play("fail", 1.0, -4.0)
			Hud.toast("早すぎる：舟が水門の下を通っている", "bad")
			Hud.bark("おはる", "あかん！ 人がおる！", 2.4)
			_board_slip(0.18, false)
			_startle_boat()
			await get_tree().create_timer(2.4).timeout
			Hud.bark("源兵衛", "歯止めが効いたから助かったわ……。もう一回つかんで、合図を待つんや。", 3.6)
		GatePuzzleLogic.Result.SUCCESS:
			_on_puzzle_success()
	_update_companions()


func _on_puzzle_success() -> void:
	puzzle_active = false
	gate_hold.grab_enabled = false
	Game.input_locked = true
	Hud.set_companions([])
	Sfx.play("success")
	Hud.toast("水門が閉まる！", "good", 2.4)
	# 堰板が歯止めで一段ずつ下りる
	var steps := 6
	for i in steps:
		var y := lerpf(BOARD_OPEN_Y, BOARD_CLOSED_Y, float(i + 1) / steps)
		var tw := create_tween()
		tw.tween_property(board, "position:y", y, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		var g := create_tween()
		g.tween_method(_set_gear_angle, _gear_angle, _gear_angle + 0.5, 0.32)
		Sfx.play("click", 1.0 + i * 0.05)
		await tw.finished
	spray.emitting = false
	_clear_boats()
	Sfx.play("water")
	var wt := create_tween()
	wt.tween_method(_set_down_level, _down_level, WATER_DOWN_LOW, 3.0).set_trans(Tween.TRANS_SINE)
	await reveal(Vector3(-0.5, 3.4, 9.5), Vector3(-4.0, -1.0, 0.0), 3.0, "水が引いて、飛び石が現れた！")
	(water_down.material_override as ShaderMaterial).set_shader_parameter("flow", Vector2(-0.05, 0.0))
	genbei.play("cheer")
	oharu.play("cheer")
	await say("gate_success")
	genbei.play("idle")
	oharu.play("idle")
	TimelineState.gate_repaired = true
	TimelineState.genbei_drawing_found = true
	Hud.toast("源兵衛の水門絵図を手に入れた", "good", 3.0)
	_update_talks()
	refresh_objective()
	checkpoint("edo_arrive")
	Game.input_locked = false


func _on_return_point() -> void:
	if not TimelineState.gate_repaired:
		var i := await Hud.choose("帰還地点", "まだ水門は直っていない。2026年へ戻る？", ["2026年へ戻る", "やめる"])
		if i != 0:
			return
	TimeTravel.travel_to(TimelineState.ERA_PRESENT, "present_ido")


# ================================================================ 毎フレーム

func _process(delta: float) -> void:
	if _rope and board:
		var top := 6.1
		var bottom := board.position.y + 1.6
		_rope.position.y = (top + bottom) * 0.5
		_rope.scale.y = maxf(0.05, top - bottom)
	if _wheel:
		_wheel.rotation.z += delta * (0.6 if not TimelineState.gate_repaired else 0.25)
	if puzzle_active:
		var was_phase := logic.phase
		if logic.tick(delta):
			Sfx.play("click")
			Sfx.play("lock", 0.8)
			Hud.bark("源兵衛", "歯止めは入った！ あとは、おはるの合図で離すんや！", 3.2)
		var danger := logic.is_danger()
		if logic.phase == GatePuzzleLogic.Phase.WAIT_SIGNAL:
			if danger and (not _was_danger or was_phase != GatePuzzleLogic.Phase.WAIT_SIGNAL):
				Hud.bark("おはる", "待って！　そこに人がいる！", 3.0)
				oharu.play("fan_wait")
				oharu.emote("×", 2.0)
			elif not danger and _was_danger:
				Hud.bark("おはる", "今は離して！", 3.0)
				Sfx.play("lock", 1.3)
				oharu.play("fan_go")
				oharu.emote("！", 2.5)
		else:
			oharu.play("idle" if logic.phase != GatePuzzleLogic.Phase.ADJUSTING else "point")
		var adjusting := logic.phase == GatePuzzleLogic.Phase.ADJUSTING and logic.holding
		genbei.play("hammer" if adjusting else "idle")
		if adjusting and _ratchet_wheel:
			_ratchet_wheel.rotation.z += delta * 3.0
		_was_danger = danger
		_sync_boats(delta)
		_update_companions()
		# 保持中の大歯車は堰板の重みで震える
		if logic.holding and logic.phase == GatePuzzleLogic.Phase.ADJUSTING:
			_shake_t = maxf(_shake_t, 0.05)
	if _shake_t > 0.0 and gear and gear.visual:
		_shake_t -= delta
		gear.visual.position = Vector3(randf_range(-0.03, 0.03), randf_range(-0.03, 0.03), 0)
	elif gear and gear.visual and gear.is_placed():
		gear.visual.position = Vector3.ZERO

	# 源兵衛に近づいたら、歯車運びのヒント（1回）
	if TimelineState.met_genbei and not TimelineState.gear_placed and not _gear_hint_done and player:
		if player.global_position.distance_to(Vector3(GATE_X, 0, 9.0)) < 7.0 and genbei.global_position.distance_to(Vector3(14.7, 0, 7.9)) < 1.0:
			_gear_hint_done = true
			say("genbei_gear_hint")


func _update_companions() -> void:
	if not puzzle_active:
		return
	var g := {"id": "genbei", "name": "源兵衛", "icon": "●", "progress": logic.progress}
	match logic.phase:
		GatePuzzleLogic.Phase.WAIT_GRAB:
			g.status = "大歯車を支えて" if logic.progress <= 0.0 else "支えが外れた！"
			g.alert = logic.progress > 0.0
		GatePuzzleLogic.Phase.ADJUSTING:
			g.status = "調整中"
		GatePuzzleLogic.Phase.WAIT_SIGNAL:
			g.status = "歯止めよし"
		_:
			g.status = "完了"
	var o := {"id": "oharu", "name": "おはる", "progress": -1.0}
	o.status = logic.signal_text()
	if logic.phase == GatePuzzleLogic.Phase.WAIT_SIGNAL:
		o.icon = "×" if logic.is_danger() else "◎"
		o.alert = not logic.is_danger()
	else:
		o.icon = "○"
	Hud.set_companions([g, o])


func _set_gear_angle(a: float) -> void:
	_gear_angle = a
	if gear and gear.visual:
		gear.visual.rotation.z = a


func _set_down_level(v: float) -> void:
	_down_level = v
	if water_down:
		water_down.position.y = v


func _board_slip(amount: float, recover: bool) -> void:
	var start := board.position.y
	var tw := create_tween()
	tw.tween_property(board, "position:y", start - amount, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_method(_set_gear_angle, _gear_angle, _gear_angle + amount * 0.8, 0.18)
	tw.tween_callback(func() -> void: Sfx.play("click", 0.8))
	if recover:
		tw.tween_interval(0.5)
		tw.tween_property(board, "position:y", BOARD_OPEN_Y, 0.9).set_trans(Tween.TRANS_SINE)
		tw.parallel().tween_method(_set_gear_angle, _gear_angle + amount * 0.8, _gear_angle, 0.9)


# ================================================================ 舟（人）

func _sync_boats(delta: float) -> void:
	var used := {}
	for x in logic.boats:
		var best := -1
		var best_d := 4.0
		for i in _boats.size():
			if used.has(i) or not _boats[i].active:
				continue
			var d := absf(float(_boats[i].x) - x)
			if d < best_d:
				best_d = d
				best = i
		if best < 0:
			best = _spawn_boat_visual()
		used[best] = true
		var b: Dictionary = _boats[best]
		b.x = x
		b.active = true
		var node: Node3D = b.node
		node.visible = true
		var level := WATER_UP if x > GATE_X else _down_level
		node.position = Vector3(x, level + sin(Time.get_ticks_msec() * 0.003 + x) * 0.04, 0.4)
		node.rotation.z = sin(Time.get_ticks_msec() * 0.002 + x) * 0.03
	for i in _boats.size():
		if not used.has(i):
			_boats[i].active = false
			(_boats[i].node as Node3D).visible = false


func _spawn_boat_visual() -> int:
	var n := Node3D.new()
	_boat_root.add_child(n)
	LevelKit.box(n, Vector3(0, 0.05, 0), Vector3(3.6, 0.45, 1.3), Color(0.5, 0.36, 0.22), false)
	LevelKit.box(n, Vector3(-2.0, 0.15, 0), Vector3(0.6, 0.35, 0.9), Color(0.45, 0.32, 0.2), false, Vector3(0, 0, 18))
	LevelKit.box(n, Vector3(2.0, 0.15, 0), Vector3(0.6, 0.35, 0.9), Color(0.45, 0.32, 0.2), false, Vector3(0, 0, -18))
	LevelKit.box(n, Vector3(0.9, 0.55, 0), Vector3(0.7, 0.6, 0.7), Color(0.66, 0.5, 0.32), false)
	LevelKit.cyl(n, Vector3(0.1, 0.55, 0.2), 0.3, 0.7, Color(0.85, 0.75, 0.45), false, Vector3(90, 0, 0), 10)
	var man := Npc.create(n, "boatman", Vector3(-0.9, 0.25, 0), 90.0)
	man.face_player = false
	man.play("sit")
	LevelKit.cyl(n, Vector3(-1.6, 1.0, 0.3), 0.04, 2.6, C_WOOD_DARK, false, Vector3(25, 0, 0))   # 竿
	_boats.append({"node": n, "x": 0.0, "active": true, "man": man})
	return _boats.size() - 1


func _startle_boat() -> void:
	for b in _boats:
		if b.active and float(b.x) >= GatePuzzleLogic.DANGER_MIN_X and float(b.x) <= GatePuzzleLogic.DANGER_MAX_X:
			(b.man as Npc).emote("！", 1.5)


func _clear_boats() -> void:
	logic.boats.clear()
	for b in _boats:
		var node: Node3D = b.node
		var tw := create_tween()
		tw.tween_property(node, "scale", Vector3.ZERO, 0.6)
		tw.tween_callback(func() -> void: node.visible = false)


# ================================================================ 水

func water_level_at(pos: Vector3) -> float:
	if absf(pos.z) < 4.1 and pos.x > -40.0 and pos.x < 40.0:
		return WATER_UP if pos.x > GATE_X else _down_level
	return -INF
