extends EraBase
## 2086年「ナンバタウン」（仕様 §4.2 段階D / §9 序章の0〜2分と27〜32分）。
## 冒頭（intro_done = false）：都市管理AI「ルート」の経路閉鎖から逃げる → 閉鎖中の保守路を見せる
##   → 時の裂け目に入って2026年へ。
## 帰還後（intro_done = true）：future_route_open（= drawing_confirmed）なら保守路に空中回廊が開き、
##   冒頭と同じ構図で変化を見せる（§3.4 / §9.1）。ソラと出会い、警備ロボ2体を機能停止させ、
##   セントラルタワーへ向かう光の地点でゴール。
## 共通の配置：水路は X 方向（水面 y ≈ -3）、遊ぶ場所は y = 4 の高架。canal_01（x = 12）が保守路。

const Decor := preload("res://scripts/eras/future/future_decor.gd")
const ChaseRoute := preload("res://scripts/eras/future/chase_route.gd")

## 閉鎖中／開通後の保守路を見せるカメラ。冒頭と帰還で必ず同じ構図にする（仕様 §9.1）。
const CAM_POS := Vector3(0.0, 13.0, 12.0)
const CAM_LOOK := Vector3(11.0, 3.0, -8.0)

const FLOOR_Y := 4.0
const ARENA := Rect2(-4.0, -28.0, 27.0, 13.7)    # 戦闘範囲：x -4..23（東の封鎖壁まで）, z -28..-14.3
const BARRIER_X := 23.0
const GATE_Z := 0.4
const GOAL_POS := Vector3(26.0, 4.0, -21.0)
const RIFT_POS := Vector3(19.6, 5.75, 8.0)
const HUB_POS := Vector3(18.6, 4.0, 11.8)
const SORA_BRIDGE := Vector3(11.3, 4.0, -5.0)
const SORA_POST := Vector3(13.4, 4.0, -12.6)
const SORA_CHEER := Vector3(20.5, 4.0, -18.5)
const TOWER_POS := Vector3(72.0, -3.0, -38.0)
const STATUE_POS := Vector3(-3.0, 7.5, -34.5)
const ROBOT_SPOTS := [
	[Vector3(3.0, 4.05, -21.0), [Vector3(0.0, 4.0, -22.5), Vector3(7.0, 4.0, -25.5)]],
	[Vector3(17.0, 4.05, -20.0), [Vector3(14.5, 4.0, -18.0), Vector3(20.5, 4.0, -21.5)]],
]
const CRYSTALS := [
	Vector3(-25.5, 5.0, 8.0), Vector3(-21.5, 5.0, 6.9), Vector3(-17.0, 6.3, 8.0),
	Vector3(-11.0, 5.0, 9.1), Vector3(-6.0, 5.0, 8.0), Vector3(-1.0, 5.0, 6.9), Vector3(2.5, 5.0, 9.0),
	Vector3(20.5, 5.0, 12.6), Vector3(5.5, 5.0, 1.4), Vector3(12.0, 5.0, -8.0),
	Vector3(-2.6, 5.0, -26.6), Vector3(21.5, 5.0, -15.4), Vector3(26.8, 5.0, -26.5),
]

var route: Node3D                 # chase_route.gd
var gate_switch: VariantSwitch
var robots: Array[GuardRobot] = []
var sora: Npc = null
var rift: Portal = null
var hub_portal: Portal = null
var goal: Portal = null

var _chasing := false
var _chase_done := false
var _rift_entered := false
var _goal_reached := false
var _sora_talking := false
var _sora_bark_cd := 0.0
var _stun_taught := false
var _cleared_handled := false
var _intro_goal: Node3D
var _barrier_wall: StaticBody3D
var _barrier_holo: MeshInstance3D
var _barrier_label: Label3D
var _barrier_lights: Array[MeshInstance3D] = []
var _tower_rings: Node3D
var _sky_rift: Portal = null
var _cars: Array[Dictionary] = []
var _t := 0.0


func _init() -> void:
	era = TimelineState.ERA_FUTURE
	music_theme = "future"
	kill_y = 0.5


# ================================================================ ワールド

func _build_world() -> void:
	sun = LevelKit.environment(self, Color(0.18, 0.42, 0.88), Color(0.92, 0.9, 0.86), Color(0.58, 0.52, 0.44),
			Color(1.0, 0.93, 0.8), 1.35, Vector3(-52, -62, 0), 0.55, Color(0.8, 0.86, 0.95))
	var deco := Node3D.new()
	deco.name = "Backdrop"
	add_child(deco)
	_build_canal(deco)
	_build_city(deco)
	Decor.statue(deco, STATUE_POS, 33.0, 1.55)
	_build_statue_base(deco)
	var tower := Node3D.new()
	tower.name = "CentralTower"
	add_child(tower)
	_tower_rings = Decor.central_tower(tower, TOWER_POS)
	_tower_rings.set_meta("no_merge", true)
	_tower_rings.add_to_group("dynamic")
	for isl in [[Vector3(-30, 28, -72), 8.0], [Vector3(22, 36, -84), 10.0], [Vector3(92, 30, 2), 9.0],
			[Vector3(-62, 24, 40), 7.0], [Vector3(40, 27, 62), 8.0], [Vector3(-4, 44, -60), 6.0]]:
		LevelKit.floating_island(deco, isl[0], isl[1])

	route = ChaseRoute.new()
	route.name = "ChaseRoute"
	add_child(route)
	route.call("build")

	var plat := Node3D.new()
	plat.name = "Platforms"
	add_child(plat)
	_build_south_platform(plat)
	_build_north_platform(plat)
	_build_gate_frame(plat)

	gate_switch = VariantSwitch.new()
	gate_switch.anchor_id = "canal_01_future"
	gate_switch.name = "Gate_canal_01"
	add_child(gate_switch)
	_build_gate_sealed(gate_switch.add_variant("A"))
	_build_gate_corridor(gate_switch.add_variant("B"))

	Decor.merge_static(deco, false)
	Decor.merge_static(tower, false)
	Decor.merge_static(plat, true)
	for k in gate_switch.variants:
		Decor.merge_static(gate_switch.variants[k], true)
	Decor.merge_static(route, true)
	var open := TimelineState.intro_done and TimelineState.future_route_open
	gate_switch.set_variant("B" if open else "A")

	_build_barrier()
	_build_goal()
	_build_robots()
	_build_cars()
	for i in CRYSTALS.size():
		Crystal.create(self, "future_c%d" % (i + 1), CRYSTALS[i])

	# 始点：後ろのカメラが出発点の門（ホログラム）より手前に収まる位置
	add_spawn("future_intro", Vector3(-29.6, 4.2, 8.0), -90.0)
	add_spawn("future_return", Vector3(8.0, 4.2, 9.0), -24.0)
	add_spawn("future_arena", Vector3(12.0, 4.2, -15.6), 0.0)
	add_spawn("default", spawns["future_return"][0] if TimelineState.intro_done else spawns["future_intro"][0],
			spawns["future_return"][1] if TimelineState.intro_done else spawns["future_intro"][1])

	_intro_goal = Node3D.new()
	_intro_goal.position = Vector3(9.0, FLOOR_Y, 8.0)
	add_child(_intro_goal)
	targets["intro_goal"] = _intro_goal
	targets["goal"] = goal

	if not TimelineState.intro_done:
		_sky_rift = Portal.create(self, Vector3(66.0, 30.0, 12.0), Color(1.0, 0.68, 0.3), 10.0, false, 84.0)
	else:
		_setup_return_state(open)
	# 残りの動かない部品をまとめる（動く物は "dynamic" グループ・スクリプト付きノードで保護されている）
	LevelKit.merge_static(self)
	_apply_debug_demo()


func _setup_return_state(open: bool) -> void:
	# 異次元拠点への光の輪（安全な南の足場。保守路が閉じていても行き詰まらない）
	hub_portal = Portal.create(self, HUB_POS, Color(0.5, 1.0, 0.9), 1.0, true)
	Interactable.create(self, HUB_POS, "異次元拠点へ", _go_hub, 2.2, 1.4)
	var l := LevelKit.label(self, "異次元拠点", HUB_POS + Vector3(0, 2.3, 0), 40, Color(0.7, 1.0, 0.95), true, Vector3.ZERO, Color(0, 0.15, 0.2, 0.8))
	l.pixel_size = 0.008
	if not open:
		return
	if TimelineState.met_sora:
		var at := SORA_CHEER if TimelineState.is_robot_combat_cleared() else SORA_POST
		sora = Npc.create(self, "sora", at, 180.0)
		sora.set_talk("話す", _talk_sora_hint)
		_update_companion()
	else:
		sora = Npc.create(self, "sora", SORA_BRIDGE, 180.0)
		sora.play("wave")
	targets["sora"] = sora


func _build_canal(deco: Node3D) -> void:
	LevelKit.box(deco, Vector3(0, -7.0, 0), Vector3(1200, 1.0, 1200), Color(0.3, 0.44, 0.32), false)
	LevelKit.water(deco, Vector3(0, -3.0, 0), Vector2(170, 8.4), Color(0.04, 0.34, 0.55), Color(0.3, 0.82, 0.95), Vector2(0.12, 0.0))
	for sz in [-1.0, 1.0]:
		LevelKit.box(deco, Vector3(0, -4.6, sz * 4.7), Vector3(170, 4.4, 1.0), Decor.C_STONE, false)
		LevelKit.box(deco, Vector3(0, -3.0, sz * 10.5), Vector3(170, 1.4, 11.0), Decor.C_SAND, false)
		Decor.glow_box(deco, Vector3(0, -2.25, sz * 5.25), Vector3(170, 0.1, 0.14), Decor.C_CYAN, 1.6)
		# 下の遊歩道の並木
		var x := -60.0
		while x < 70.0:
			LevelKit.tree(deco, Vector3(x + sz * 3.0, -2.3, sz * 7.2), 1.1)
			x += 13.0
	# 小舟
	for b in [[Vector3(-14.0, -2.9, 1.6), 0.0], [Vector3(22.0, -2.9, -1.8), 180.0]]:
		var n := Node3D.new()
		n.position = b[0]
		n.rotation_degrees.y = b[1]
		deco.add_child(n)
		LevelKit.box(n, Vector3.ZERO, Vector3(3.6, 0.5, 1.5), Decor.C_WHITE, false)
		LevelKit.sphere(n, Vector3(0.3, 0.4, 0), 0.7, Decor.C_GLASS, Vector3(1.4, 0.6, 0.9), 8)
		Decor.glow_box(n, Vector3(0, -0.1, 0), Vector3(3.7, 0.08, 1.55), Decor.C_ORANGE, 1.6)
	# 足場から水路へ落ちる滝
	for w in [Vector3(17.5, 0.4, -0.3), Vector3(-1.0, 0.4, -14.25)]:
		Decor.quad(deco, w, Vector2(6.6, 1.8), Decor.holo_mat(Color(0.55, 0.85, 1.0), 2.0, -1.6, 1.6, 0.0), Vector3(0, 0, 90))
		LevelKit.sphere(deco, Vector3(w.x, -2.75, w.z + 0.9), 1.2, Color(0.95, 0.98, 1.0), Vector3(1.2, 0.3, 0.8), 8)


func _build_city(deco: Node3D) -> void:
	var south := Vector3(0, 0, -1)
	var north := Vector3(0, 0, 1)
	var west := Vector3(-1, 0, 0)
	# 追走路の南（右手）の段々の建物
	Decor.terrace(deco, Vector3(-30, -2.3, 16.5), Vector3(7, 8.5, 6), Decor.C_CREAM, south, Decor.C_ORANGE)
	Decor.terrace(deco, Vector3(-21, -2.3, 17.5), Vector3(8, 5.5, 7), Decor.C_TERRA, south)
	Decor.terrace(deco, Vector3(-12, -2.3, 16.5), Vector3(7, 10.0, 6), Decor.C_SAND, south, Decor.C_TEAL)
	Decor.terrace(deco, Vector3(-3, -2.3, 17.5), Vector3(8, 6.5, 7), Decor.C_WHITE, south)
	Decor.terrace(deco, Vector3(13, -2.3, 21.5), Vector3(14, 5.0, 6), Decor.C_CREAM, south, Decor.C_ORANGE)
	# 水路の北（追走路の左手）
	Decor.terrace(deco, Vector3(-31, -2.3, -11), Vector3(8, 9.0, 7), Decor.C_TERRA, north, Decor.C_TEAL)
	Decor.terrace(deco, Vector3(-21, -2.3, -12), Vector3(7, 7.0, 8), Decor.C_CREAM, north)
	Decor.terrace(deco, Vector3(-13, -2.3, -10.5), Vector3(5, 11.5, 6), Decor.C_SAND, north, Decor.C_ORANGE)
	# 東
	Decor.terrace(deco, Vector3(30, -2.3, 8), Vector3(8, 10.0, 9), Decor.C_TERRA, west, Decor.C_TEAL)
	Decor.terrace(deco, Vector3(33, -2.3, -24), Vector3(6, 8.0, 10), Decor.C_CREAM, west)
	# 高層ビル（遠景）
	var win := Decor.C_CYAN
	for t in [
		[Vector3(-26, -3, -50), Vector3(9, 48, 9), Decor.C_WHITE, win],
		[Vector3(6, -3, -58), Vector3(11, 60, 9), Color(0.66, 0.72, 0.82), Decor.C_AMBER],
		[Vector3(24, -3, -47), Vector3(8, 38, 8), Decor.C_CREAM, win],
		[Vector3(44, -3, -60), Vector3(10, 52, 10), Decor.C_WHITE, Decor.C_AMBER],
		[Vector3(-48, -3, -34), Vector3(8, 34, 8), Decor.C_SAND, win],
		[Vector3(-40, -3, 34), Vector3(9, 40, 9), Decor.C_WHITE, Decor.C_AMBER],
		[Vector3(-18, -3, 41), Vector3(10, 52, 8), Color(0.66, 0.72, 0.82), win],
		[Vector3(4, -3, 35), Vector3(8, 36, 8), Decor.C_CREAM, win],
		[Vector3(26, -3, 39), Vector3(10, 46, 10), Decor.C_WHITE, Decor.C_AMBER],
		[Vector3(47, -3, 27), Vector3(8, 30, 8), Decor.C_SAND, win],
		[Vector3(-66, -3, -8), Vector3(10, 44, 10), Decor.C_WHITE, win],
		[Vector3(-62, -3, 18), Vector3(8, 32, 8), Decor.C_CREAM, Decor.C_AMBER],
		[Vector3(48, -3, 6), Vector3(8, 20, 8), Color(0.66, 0.72, 0.82), win],
		[Vector3(54, -3, -14), Vector3(9, 26, 9), Decor.C_WHITE, Decor.C_AMBER],
		[Vector3(96, -3, -24), Vector3(10, 40, 10), Decor.C_WHITE, win],
		[Vector3(88, -3, -62), Vector3(12, 48, 10), Decor.C_CREAM, Decor.C_AMBER],
	]:
		Decor.tower(deco, t[0], t[1], t[2], t[3])
	# 地平線までの遠い街並み（影なし・色は3種類だけ）
	var far_cols := [Color(0.72, 0.78, 0.86), Color(0.84, 0.8, 0.72), Color(0.62, 0.7, 0.8)]
	for i in 28:
		var a := TAU * i / 28.0 + 0.11
		var dist := 170.0 + 40.0 * Decor._rand01(Vector3(i, 1, 0))
		var h := 18.0 + 46.0 * Decor._rand01(Vector3(i, 2, 0))
		var w := 14.0 + 12.0 * Decor._rand01(Vector3(i, 3, 0))
		LevelKit.box(deco, Vector3(cos(a) * dist, h * 0.5 - 6.0, sin(a) * dist), Vector3(w, h, w * 0.8), far_cols[i % 3], false, Vector3(0, rad_to_deg(-a), 0))
	# 旗
	Decor.banner(deco, Vector3(-26.0, 4.0, 10.45), "なんば", Decor.C_ORANGE, -90.0, true)
	Decor.banner(deco, Vector3(-10.5, 4.0, 10.45), "NAMBA\nTOWN", Decor.C_TEAL, -90.0, false)
	Decor.banner(deco, Vector3(8.6, 4.0, -14.45), "なんば", Decor.C_ORANGE, 0.0, true)
	Decor.banner(deco, Vector3(16.2, 4.0, -14.45), "NAMBA\nTOWN", Decor.C_TEAL, 0.0, false)
	Decor.banner(deco, Vector3(21.5, 4.0, 13.55), "なんば", Decor.C_ORANGE, -90.0, true)


## 胸像の台座と「NAMBA TOWN」の看板（プレイイメージ01準拠）。
func _build_statue_base(deco: Node3D) -> void:
	var b := Node3D.new()
	b.position = STATUE_POS
	b.rotation_degrees.y = 33.0
	deco.add_child(b)
	LevelKit.box(b, Vector3(0, -5.25, 0), Vector3(11, 10.5, 8), Decor.C_SAND, false)
	LevelKit.box(b, Vector3(0, -0.2, 0), Vector3(11.6, 0.5, 8.6), Decor.C_WHITE, false)
	LevelKit.box(b, Vector3(0, -1.7, 4.1), Vector3(7.6, 1.9, 0.4), Color(0.95, 0.9, 0.78), false)
	Decor.glow_box(b, Vector3(0, -2.7, 4.32), Vector3(7.6, 0.1, 0.1), Decor.C_AMBER, 2.0)
	var l := LevelKit.label(b, "NAMBA TOWN", Vector3(0, -1.7, 4.32), 150, Color(0.85, 0.45, 0.12), false, Vector3.ZERO, Color(1, 1, 1, 0.9))
	l.outline_size = 18
	for sx in [-1.0, 1.0]:
		LevelKit.sphere(b, Vector3(4.8 * sx, 0.6, 3.2), 1.1, Decor.C_LEAF, Vector3(1.3, 0.8, 1.0), 8)
		Decor.vine(b, Vector3(4.9 * sx, -0.3, 4.05), 4.0)


func _build_south_platform(plat: Node3D) -> void:
	LevelKit.box(plat, Vector3(13, 3.6, 7), Vector3(18, 0.8, 14), Decor.C_WHITE)
	LevelKit.box(plat, Vector3(13, 2.85, 7), Vector3(16.5, 0.7, 12.5), Decor.C_STEEL, false)
	LevelKit.box(plat, Vector3(13, -0.4, 8), Vector3(3.5, 6.0, 3.5), Decor.C_STEEL, false)
	LevelKit.box(plat, Vector3(13, 4.01, 7), Vector3(15.5, 0.02, 11.5), Decor.C_FLOOR, false)
	_floor_grid(plat, Rect2(5.25, 1.25, 15.5, 11.5))
	Decor.glow_box(plat, Vector3(12, 4.03, 3.4), Vector3(0.14, 0.03, 5.6), Decor.C_CYAN, 1.8)
	Decor.glow_box(plat, Vector3(8.5, 4.03, 6.2), Vector3(7.0, 0.03, 0.14), Decor.C_CYAN, 1.8)
	var c := Decor.C_CYAN
	Decor.railing(plat, Vector3(4, 4, 0), Vector3(4, 4, 6), c)
	Decor.railing(plat, Vector3(4, 4, 10), Vector3(4, 4, 14), c)
	Decor.railing(plat, Vector3(4, 4, 14), Vector3(22, 4, 14), c)
	Decor.railing(plat, Vector3(22, 4, 14), Vector3(22, 4, 0), c)
	Decor.railing(plat, Vector3(4, 4, 0), Vector3(9.2, 4, 0), c)
	Decor.railing(plat, Vector3(14.8, 4, 0), Vector3(22, 4, 0), c)
	_platform_trim(plat, Rect2(4, 0, 18, 14))
	Decor.planter(plat, Vector3(20.2, 4, 2.0), 1.6, true)
	Decor.planter(plat, Vector3(5.8, 4, 12.2), 1.4, false)
	for p in [Vector3(4.5, 4, 0.5), Vector3(21.5, 4, 0.5), Vector3(21.5, 4, 13.5), Vector3(4.5, 4, 13.5)]:
		_lamp(plat, p)


func _build_north_platform(plat: Node3D) -> void:
	LevelKit.box(plat, Vector3(12, 3.6, -21), Vector3(32, 0.8, 14), Decor.C_WHITE)
	LevelKit.box(plat, Vector3(12, 2.85, -21), Vector3(30.5, 0.7, 12.5), Decor.C_STEEL, false)
	for x in [2.0, 22.0]:
		LevelKit.box(plat, Vector3(x, -0.4, -21), Vector3(3.5, 6.0, 3.5), Decor.C_STEEL, false)
	LevelKit.box(plat, Vector3(9.5, 4.01, -21), Vector3(25.5, 0.02, 12), Decor.C_FLOOR, false)
	_floor_grid(plat, Rect2(-3.25, -27.0, 25.5, 12.0))
	var tm := TorusMesh.new()
	tm.inner_radius = 4.4
	tm.outer_radius = 4.7
	tm.rings = 32
	tm.ring_segments = 4
	LevelKit.mesh(plat, tm, Vector3(9.5, 4.0, -21), LevelKit.glow(Decor.C_CYAN, 1.6), Vector3.ZERO, Vector3(1.0, 0.1, 1.0))
	var c := Decor.C_CYAN
	Decor.railing(plat, Vector3(-4, 4, -14), Vector3(9.9, 4, -14), c)
	Decor.railing(plat, Vector3(14.1, 4, -14), Vector3(28, 4, -14), c)
	Decor.railing(plat, Vector3(-4, 4, -28), Vector3(28, 4, -28), c)
	Decor.railing(plat, Vector3(-4, 4, -28), Vector3(-4, 4, -14), c)
	Decor.railing(plat, Vector3(28, 4, -28), Vector3(28, 4, -14), c)
	_platform_trim(plat, Rect2(-4, -28, 32, 14))
	# 植え込み（ロボの突進を止める遮へい物にもなる）
	Decor.planter(plat, Vector3(5.5, 4, -17.6), 1.6, true)
	Decor.planter(plat, Vector3(17.0, 4, -24.6), 1.6, true)
	for p in [Vector3(-3.5, 4, -27.5), Vector3(22.5, 4, -27.5), Vector3(-3.5, 4, -14.5), Vector3(27.5, 4, -27.5)]:
		_lamp(plat, p)


## 足場の縁：側面の橙の光の帯と、縁から垂れ下がる蔦（プレイイメージ01/10の雰囲気）。
func _platform_trim(parent: Node3D, r: Rect2) -> void:
	var cx := r.get_center().x
	var cz := r.get_center().y
	for sz in [-1.0, 1.0]:
		Decor.glow_box(parent, Vector3(cx, 3.45, cz + sz * (r.size.y * 0.5 + 0.03)), Vector3(r.size.x - 0.4, 0.12, 0.06), Decor.C_AMBER, 1.8)
	for sx in [-1.0, 1.0]:
		Decor.glow_box(parent, Vector3(cx + sx * (r.size.x * 0.5 + 0.03), 3.45, cz), Vector3(0.06, 0.12, r.size.y - 0.4), Decor.C_AMBER, 1.8)
	var x := r.position.x + 1.6
	var i := 0
	while x < r.end.x - 1.0:
		if x < 9.5 or x > 14.5:
			for sz in [-1.0, 1.0]:
				if (i + int(sz)) % 3 != 0:
					Decor.vine(parent, Vector3(x, 3.9, cz + sz * (r.size.y * 0.5 + 0.12)), 1.6 + 1.8 * Decor._rand01(Vector3(x, sz, cz)))
		x += 2.3
		i += 1


## 床の目地（材質1つにまとまるので描画負荷は小さい）。r は XZ の範囲。
func _floor_grid(parent: Node3D, r: Rect2) -> void:
	var x := r.position.x + 2.0
	while x < r.end.x - 0.5:
		LevelKit.box(parent, Vector3(x, 4.025, r.get_center().y), Vector3(0.06, 0.02, r.size.y), Decor.C_FLOOR_LINE, false)
		x += 2.5
	var z := r.position.y + 2.0
	while z < r.end.y - 0.5:
		LevelKit.box(parent, Vector3(r.get_center().x, 4.025, z), Vector3(r.size.x, 0.02, 0.06), Decor.C_FLOOR_LINE, false)
		z += 2.5


func _lamp(parent: Node3D, p: Vector3) -> void:
	LevelKit.cyl(parent, p + Vector3(0, 1.4, 0), 0.08, 2.8, Decor.C_STEEL, false, Vector3.ZERO, 8)
	var head := LevelKit.sphere(parent, p + Vector3(0, 2.9, 0), 0.24, Decor.C_AMBER, Vector3.ONE, 8)
	head.material_override = LevelKit.glow(Color(1.0, 0.85, 0.55), 2.4)


## 保守路の門（両方の状態で共通の枠：同じ構図で「中身だけが変わった」と分かるように）。
func _build_gate_frame(plat: Node3D) -> void:
	for x in [9.55, 14.45]:
		LevelKit.box(plat, Vector3(x, 6.6, GATE_Z), Vector3(0.7, 5.2, 0.9), Decor.C_WHITE)
		LevelKit.box(plat, Vector3(x, 4.15, GATE_Z), Vector3(0.95, 0.3, 1.15), Decor.C_STEEL, false)
	LevelKit.box(plat, Vector3(12, 9.5, GATE_Z), Vector3(5.8, 0.85, 1.05), Decor.C_WHITE, false)
	LevelKit.box(plat, Vector3(12, 9.5, GATE_Z + 0.55), Vector3(4.4, 0.6, 0.06), Decor.C_DARK, false)
	var l := LevelKit.label(plat, "保守路", Vector3(12, 9.5, GATE_Z + 0.6), 52, Color(0.95, 0.97, 1.0))
	l.outline_size = 0


func _build_gate_sealed(v: Node3D) -> void:
	var red := Color(1.0, 0.24, 0.12)
	Decor.quad(v, Vector3(12, 6.45, GATE_Z), Vector2(4.2, 4.7), Decor.holo_mat(Color(1.0, 0.3, 0.12), 6.0, 0.8))
	# 形でも分かる「×」（色だけで判別させない：仕様 §12.2）
	for r in [40.0, -40.0]:
		Decor.glow_box(v, Vector3(12, 5.55, GATE_Z + 0.08), Vector3(2.6, 0.22, 0.05), red, 2.6).rotation_degrees.z = r
	LevelKit.label(v, "ROUTE\n保守路 閉鎖中", Vector3(12, 7.6, GATE_Z + 0.1), 50, Color(1.0, 0.95, 0.9), false, Vector3.ZERO, Color(0.55, 0.05, 0.0, 0.95))
	LevelKit.wall(v, Vector3(12, 6.4, GATE_Z), Vector3(4.4, 4.8, 0.4))
	for x in [9.55, 14.45]:
		Decor.glow_box(v, Vector3(x, 6.6, GATE_Z + 0.47), Vector3(0.14, 4.4, 0.05), red, 2.4)
	# 引っ込んだままの橋の根元（間は空いている）
	LevelKit.box(v, Vector3(12, 3.75, -0.5), Vector3(4.0, 0.5, 1.4), Decor.C_STEEL, false)
	LevelKit.box(v, Vector3(12, 3.75, -13.3), Vector3(4.0, 0.5, 1.6), Decor.C_STEEL, false)
	Decor.glow_box(v, Vector3(12, 3.92, -1.2), Vector3(4.0, 0.14, 0.14), red, 2.6)
	Decor.glow_box(v, Vector3(12, 3.92, -12.5), Vector3(4.0, 0.14, 0.14), red, 2.6)
	# 足元の立入禁止表示
	for i in 4:
		Decor.glow_box(v, Vector3(10.6 + i * 0.95, 4.03, 1.6), Vector3(0.5, 0.03, 0.9), Decor.C_AMBER, 1.6).rotation_degrees.y = 35.0


func _build_gate_corridor(v: Node3D) -> void:
	var c := Decor.C_CYAN
	# 空中回廊の床
	LevelKit.box(v, Vector3(12, 3.75, -7.0), Vector3(4.0, 0.5, 14.4), Decor.C_WHITE)
	LevelKit.box(v, Vector3(12, 4.01, -7.0), Vector3(3.2, 0.02, 14.2), Decor.C_FLOOR, false)
	for x in [10.3, 13.7]:
		Decor.glow_box(v, Vector3(x, 4.03, -7.0), Vector3(0.12, 0.03, 14.2), c, 2.2)
	for i in 4:
		var chev := Decor.glow_box(v, Vector3(12, 4.04, -1.5 - i * 3.4), Vector3(1.2, 0.03, 0.18), Color(0.6, 0.95, 1.0), 2.0)
		chev.rotation_degrees.y = 0.0
	Decor.railing(v, Vector3(10.05, 4, 0.2), Vector3(10.05, 4, -14.0), c)
	Decor.railing(v, Vector3(13.95, 4, 0.2), Vector3(13.95, 4, -14.0), c)
	# 回廊を下から支えるアーチ
	var seg := 8
	var z0 := 3.5
	var z1 := -17.5
	for i in seg:
		var a0 := float(i) / seg
		var a1 := float(i + 1) / seg
		var p0 := Vector3(12, lerpf(-2.4, 3.35, sin(a0 * PI)), lerpf(z0, z1, a0))
		var p1 := Vector3(12, lerpf(-2.4, 3.35, sin(a1 * PI)), lerpf(z0, z1, a1))
		var mid := (p0 + p1) * 0.5
		var d := p1 - p0
		var piece := LevelKit.box(v, mid, Vector3(2.4, 0.7, d.length() + 0.1), Decor.C_WHITE, false)
		piece.rotation.x = atan2(d.y, -d.z)
	for z in [z0, z1]:
		LevelKit.box(v, Vector3(12, -2.0, z), Vector3(3.2, 1.4, 2.0), Decor.C_STEEL, false)
	# 開いた門：光が水色に変わり、歯止め式の歯車の紋が灯る
	for x in [9.55, 14.45]:
		Decor.glow_box(v, Vector3(x, 6.6, GATE_Z + 0.47), Vector3(0.14, 4.4, 0.05), c, 2.4)
	var gear := LevelKit.gear(v, Vector3(12, 10.75, GATE_Z), 0.85, 0.22, Color(0.98, 0.78, 0.3), 10)
	gear.rotation_degrees.z = 9.0
	LevelKit.box(v, Vector3(12.95, 11.55, GATE_Z), Vector3(0.18, 0.7, 0.18), Color(0.95, 0.7, 0.3), false, Vector3(0, 0, 38))
	Decor.quad(v, Vector3(12, 8.65, GATE_Z + 0.02), Vector2(3.4, 0.7), Decor.holo_mat(Color(0.3, 0.9, 1.0), 3.0, 0.5, 0.8))
	LevelKit.label(v, "保守路 開通", Vector3(12, 8.65, GATE_Z + 0.06), 40, Color(0.9, 1.0, 1.0), false, Vector3.ZERO, Color(0.0, 0.25, 0.35, 0.9))
	# 由来を記した小さな案内板
	var sign := Node3D.new()
	sign.position = Vector3(7.6, FLOOR_Y, 1.0)
	v.add_child(sign)
	for sx in [-1.0, 1.0]:
		LevelKit.box(sign, Vector3(0.95 * sx, 0.6, 0), Vector3(0.1, 1.2, 0.1), Decor.C_STEEL, false)
	LevelKit.box(sign, Vector3(0, 1.45, 0), Vector3(2.3, 0.85, 0.08), Color(0.1, 0.17, 0.3), false)
	Decor.glow_box(sign, Vector3(0, 1.9, 0.0), Vector3(2.3, 0.05, 0.1), c, 2.0)
	var t := LevelKit.label(sign, "保守路 ― 2031年\n旧水門の歯止め式機構をもとに設計", Vector3(0, 1.45, 0.05), 48, Color(0.92, 0.97, 1.0))
	t.pixel_size = 0.0034


func _build_barrier() -> void:
	var b := Node3D.new()
	b.name = "EastBarrier"
	b.add_to_group("dynamic")
	b.position = Vector3(BARRIER_X, FLOOR_Y, -21.0)
	add_child(b)
	for sz in [-1.0, 1.0]:
		LevelKit.box(b, Vector3(0, 1.9, sz * 6.85), Vector3(0.5, 3.8, 0.5), Decor.C_WHITE)
		var lt := Decor.glow_box(b, Vector3(-0.27, 1.9, sz * 6.85), Vector3(0.05, 3.2, 0.2), Color(1.0, 0.3, 0.15), 2.4)
		_barrier_lights.append(lt)
	_barrier_holo = Decor.quad(b, Vector3(0, 1.75, 0), Vector2(13.4, 3.4), Decor.holo_mat(Color(1.0, 0.32, 0.12), 9.0, 0.7), Vector3(0, 90, 0))
	_barrier_label = LevelKit.label(b, "ROUTE：封鎖中", Vector3(-0.06, 2.0, 0), 72, Color(1.0, 0.95, 0.9), false, Vector3(0, -90, 0), Color(0.55, 0.05, 0.0, 0.9))
	_barrier_wall = LevelKit.wall(b, Vector3(0, 1.6, 0), Vector3(0.4, 3.2, 13.8))
	if TimelineState.is_robot_combat_cleared():
		_open_barrier(true)


func _open_barrier(instant: bool) -> void:
	for cs in _barrier_wall.find_children("*", "CollisionShape3D", true, false):
		(cs as CollisionShape3D).set_deferred("disabled", true)
	for lt in _barrier_lights:
		lt.material_override = LevelKit.glow(Decor.C_CYAN, 2.4)
	if instant:
		_barrier_holo.visible = false
		_barrier_label.visible = false
		return
	Sfx.play("door")
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_barrier_holo, "scale", Vector3(1.0, 0.02, 1.0), 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_property(_barrier_label, "modulate:a", 0.0, 0.5)
	tw.chain().tween_callback(func() -> void:
		_barrier_holo.visible = false
		_barrier_label.visible = false)


func _build_goal() -> void:
	goal = Portal.create(self, GOAL_POS + Vector3(0, 0.03, 0), Color(1.0, 0.85, 0.4), 1.3, true)
	var beam := LevelKit.cyl(goal, Vector3(0, 4.0, 0), 0.9, 8.0, Color(1.0, 0.9, 0.5, 0.25), false, Vector3.ZERO, 12, 0.5) as MeshInstance3D
	beam.material_override = LevelKit.mat(Color(1.0, 0.9, 0.5, 0.22), 1.6)
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var l := LevelKit.label(goal, "セントラルタワーへ", Vector3(0, 2.6, 0), 44, Color(1.0, 0.95, 0.75), true, Vector3.ZERO, Color(0.3, 0.2, 0.0, 0.8))
	l.pixel_size = 0.008


func _build_robots() -> void:
	var bounds := Rect2(ARENA.position + Vector2(0.7, 0.7), ARENA.size - Vector2(1.4, 1.2))
	for i in ROBOT_SPOTS.size():
		var spot: Array = ROBOT_SPOTS[i]
		var pts: Array[Vector3] = []
		for p in spot[1]:
			pts.append(p)
		var r := GuardRobot.create(self, spot[0], pts)
		r.rotation.y = PI
		r.arena_check = _player_in_arena
		r.bounds = bounds
		r.shut_down.connect(_on_robot_down)
		r.shield_blocked.connect(_on_shield_blocked)
		r.stunned.connect(_on_robot_stunned)
		if i < TimelineState.robots_defeated:
			r.power_down(true)
		robots.append(r)
	_update_robot_target()


func _build_cars() -> void:
	var colors := [Color(1.0, 0.55, 0.25), Color(0.95, 0.95, 1.0), Color(0.35, 0.7, 1.0)]
	var paths := [
		[Vector3(10, 16, -6), Vector2(46, 26), 0.11, 0.0],
		[Vector3(-6, 22, -10), Vector2(60, 34), -0.07, 2.0],
		[Vector3(30, 13, 10), Vector2(30, 18), 0.15, 4.0],
	]
	for i in 3:
		var car := Decor.flying_car(self, colors[i])
		car.add_to_group("dynamic")
		_cars.append({"node": car, "c": paths[i][0], "r": paths[i][1], "w": paths[i][2], "a": paths[i][3]})
	_animate_cars(0.0)


# ================================================================ 物語

func _start_story() -> void:
	if not TimelineState.intro_done:
		_run_intro()
	else:
		_run_return()


func _run_intro() -> void:
	Sfx.play("alarm")
	Hud.bark("ルート", "経路閉鎖プロトコルを開始します。", 2.5)
	await get_tree().create_timer(0.7).timeout
	await say("future_intro_start")
	_begin_chase()


func _begin_chase() -> void:
	if _chase_done:
		return
	_chasing = true
	# 前線はプレイヤーの少し後ろから（最初の足元のタイルが沈むまで約2秒）
	route.call("start_closure", minf(player.global_position.x - 5.5, ChaseRoute.X_START - 1.5))
	Sfx.play("alarm", 1.1, -4.0)
	Hud.bark("ルート", "閉鎖を開始します。退避してください。", 3.0)
	Hud.hint("WASDで移動・スペースでジャンプ・Shiftでダッシュ！", 4.0)


## 落下したら追走の最初からやり直す（体力は減らさない）。
func on_player_fell() -> void:
	if TimelineState.intro_done or _chase_done or not _chasing:
		return
	_chasing = false
	route.call("stop_closure")
	await get_tree().create_timer(0.2).timeout
	route.call("reset")
	await get_tree().create_timer(0.15).timeout
	player.yaw = deg_to_rad(-90.0)
	player.model.rotation.y = player.yaw
	await get_tree().create_timer(0.9).timeout
	Hud.hint("Shiftでダッシュ！ スペースでジャンプ", 3.5)
	_begin_chase()


func fall_respawn_position() -> Variant:
	if not TimelineState.intro_done and not _chase_done:
		return spawns["future_intro"][0]
	return null


func is_safe_ground(pos: Vector3) -> bool:
	return route == null or bool(route.call("is_safe_at", pos))


func _on_platform_reached() -> void:
	_chase_done = true
	_chasing = false
	# 閉じた追走路へ戻って落ちないよう、足場の西の入口をふさぐ
	var seal := LevelKit.wall(self, Vector3(4.15, FLOOR_Y + 0.6, 8.0), Vector3(0.3, 1.2, 4.2))
	seal.name = "WestSeal"
	Sfx.play("alarm")
	Hud.bark("ルート", "警告：この先の保守路は閉鎖中です。", 3.0)
	await get_tree().create_timer(0.6).timeout
	await reveal(CAM_POS, CAM_LOOK, 3.0, "")
	await say("future_intro_platform")
	_spawn_rift()


func _spawn_rift() -> void:
	rift = Portal.create(self, RIFT_POS, Color(1.0, 0.62, 0.22), 1.6, false, 90.0)
	rift.touch_enter = true
	rift.entered.connect(_enter_rift)
	rift.scale = Vector3.ONE * 0.05
	create_tween().tween_property(rift, "scale", Vector3.ONE, 0.7).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	Sfx.play("warp", 0.7, -8.0)
	Hud.flash(Color(1.0, 0.75, 0.4, 0.4), 0.4)
	targets["intro_goal"] = rift
	refresh_objective()
	Hud.hint("時の裂け目に飛び込もう！", 4.0)


func _enter_rift() -> void:
	if _rift_entered:
		return
	_rift_entered = true
	Game.input_locked = true
	Hud.flash(Color(1.0, 0.8, 0.5, 0.6), 0.5)
	await say("future_intro_rift")
	TimelineState.intro_done = true
	# 続きは2026年から（TimeTravel は到着時に current_era を設定するが、ここで保存しておく）
	TimelineState.checkpoint = "present_start"
	TimelineState.current_era = TimelineState.ERA_PRESENT
	SaveManager.save_game()
	TimeTravel.travel_to(TimelineState.ERA_PRESENT, "present_start")


func _run_return() -> void:
	var open := TimelineState.future_route_open
	if not open:
		Hud.hint("保守路は閉鎖されたまま……光の輪から異次元拠点へ向かおう", 5.0)
		return
	if TimelineState.met_sora:
		return
	await say("future_return")
	await reveal(CAM_POS, CAM_LOOK, 3.2, "ルートが変化した！")
	if sora and not TimelineState.met_sora:
		sora.emote("！", 1.5)
		sora.set_talk("話す", _talk_sora)
		Hud.hint("回廊の上に誰かいる。近づいて話しかけよう（F）", 4.0)


func _talk_sora() -> void:
	if _sora_talking or sora == null:
		return
	_sora_talking = true
	sora.clear_talk()
	sora.play("idle")
	await say("sora_first")
	TimelineState.met_sora = true
	refresh_objective()
	checkpoint("future_return")
	_update_companion()
	Hud.hint("回廊の先の警備ロボ：盾をクローでつかむ → ひるんだ所を攻撃", 4.5)
	await sora.walk_to([SORA_POST], 3.2)
	sora.face_towards(Vector3(9.0, FLOOR_Y, -21.0))
	sora.set_talk("話す", _talk_sora_hint)
	_sora_talking = false


func _talk_sora_hint() -> void:
	if TimelineState.is_robot_combat_cleared():
		Hud.bark("ソラ", "セントラルタワーへ行こう！ 光の地点の先だよ。", 3.0)
	else:
		await say("sora_combat_hint")


func _go_hub() -> void:
	TimeTravel.travel_to(TimelineState.ERA_HUB, "hub_start")


## 変化を見せる演出の間は目標マーカーを隠す（同じ構図をそのまま見せる）。
func reveal(cam_pos: Vector3, look: Vector3, secs: float, text: String = "") -> void:
	if marker:
		marker.target = null
	await super.reveal(cam_pos, look, secs, text)
	refresh_objective()


func refresh_objective() -> void:
	super.refresh_objective()
	if TimelineState.intro_done and not TimelineState.future_route_open:
		Hud.set_objective("保守路は閉鎖されたまま", "光の輪から異次元拠点へ向かおう")
		if marker:
			marker.target = hub_portal


# ================================================================ 戦闘

func _player_in_arena() -> bool:
	if player == null:
		return false
	var p := player.global_position
	return ARENA.has_point(Vector2(p.x, p.z)) and p.y > FLOOR_Y - 1.0


func _update_robot_target() -> void:
	targets.erase("robots")
	for r in robots:
		if not r.is_disabled():
			targets["robots"] = r
			return


func _on_robot_down() -> void:
	TimelineState.robots_defeated = mini(TimelineState.robots_defeated + 1, TimelineState.ROBOTS_TOTAL)
	_update_robot_target()
	refresh_objective()
	if TimelineState.is_robot_combat_cleared():
		_on_combat_cleared()
	else:
		var left := TimelineState.ROBOTS_TOTAL - TimelineState.robots_defeated
		Hud.toast("機能停止！ あと%d体" % left, "good", 2.0)
		_update_companion()


func _on_combat_cleared() -> void:
	if _cleared_handled:
		return
	_cleared_handled = true
	Sfx.play("success")
	Hud.toast("警備ロボを すべて停止させた！", "good", 2.5)
	await get_tree().create_timer(1.2).timeout
	await say("robots_cleared")
	_open_barrier(false)
	checkpoint("future_return")
	refresh_objective()
	_update_companion()
	if sora:
		sora.clear_talk()
		await sora.walk_to([SORA_CHEER], 3.2)
		sora.play("point")
		sora.face_towards(GOAL_POS)
		sora.set_talk("話す", _talk_sora_hint)


func _on_shield_blocked() -> void:
	if not TimelineState.met_sora or _sora_bark_cd > 0.0:
		return
	_sora_bark_cd = 7.0
	var lines := DialogueDB.lines("sora_combat_hint")
	if not lines.is_empty():
		Hud.bark(str(lines[0].get("speaker", "ソラ")), str(lines[0].get("text", "")), 3.5)


func _on_robot_stunned() -> void:
	if not _stun_taught:
		_stun_taught = true
		Hud.hint("今だ！ 左クリック（E）で攻撃！ 2回当てると機能停止", 3.5)
	if TimelineState.met_sora:
		Hud.bark("ソラ", "今だよ！ 叩いて！", 2.0)
	_update_companion(true)
	get_tree().create_timer(2.5).timeout.connect(func() -> void: _update_companion())


func _update_companion(alert: bool = false) -> void:
	if not TimelineState.met_sora:
		Hud.set_companions([])
		return
	var status := "盾をクローで！"
	if alert:
		status = "今だ！ 攻撃して！"
	elif TimelineState.is_robot_combat_cleared():
		status = "タワーへ行こう"
	Hud.set_companions([{"id": "sora", "name": "ソラ", "status": status, "progress": -1.0, "alert": alert}])


# ================================================================ ゴール

func _on_goal() -> void:
	_goal_reached = true
	Game.input_locked = true
	Sfx.play("success")
	Hud.flash(Color(1.0, 0.95, 0.7, 0.6), 0.6)
	TimelineState.prologue_cleared = true
	SaveManager.save_game()
	await reveal(GOAL_POS + Vector3(-3.0, 3.2, 5.0), TOWER_POS + Vector3(0, 40, 0), 2.8, "ナンバタウンの新しいルートが開いた！")
	Game.input_locked = true
	await Hud.show_ending(_ending_text())


func _ending_text() -> String:
	var m := TimelineState.metrics
	var secs := int(TimelineState.play_time)
	var s := "[center][b]NEXMAX CHRONICLE ― はじまりの未来 ―[/b][/center]\n"
	s += "[color=#ffb070]● 1726年[/color]　源兵衛と力を合わせて、からくり水門を直した\n"
	s += "[color=#7fd8ff]● 2026年[/color]　水門の絵図が記録に残り、マツイ社長の構想に\n"
	s += "[color=#c9a8ff]● 2086年[/color]　閉ざされていた保守路が、空中回廊として開いた\n\n"
	s += "プレイ時間 %d:%02d　／　時の結晶 %d 個　／　時空移動 %d 回\n" % [secs / 60, secs % 60, TimelineState.crystal_count(), int(m.get("time_travels", 0))]
	s += "クロー：つかんだ %d 回・空振り %d 回・早すぎた解除 %d 回　／　落下 %d 回\n\n" % [
		int(m.get("claw_grabs", 0)), int(m.get("claw_misgrabs", 0)), int(m.get("release_too_early", 0)), int(m.get("falls", 0))]
	s += "[center][b][color=#ffd166]第1章『仕掛け横丁の約束』へ つづく[/color][/b][/center]"
	return s


# ================================================================ 毎フレーム

func _process(delta: float) -> void:
	_t += delta
	_sora_bark_cd = maxf(0.0, _sora_bark_cd - delta)
	_animate_cars(delta)
	if _tower_rings:
		_tower_rings.rotation.y += delta * 0.12
	if player == null:
		return
	var pp := player.global_position
	# 追走：安全な足場に着いた
	if _chasing and not _chase_done and pp.x > ChaseRoute.X_END + 0.6 and player.is_on_floor():
		_on_platform_reached()
	# 時の裂け目（Portal の判定の補助：少しずれて通っても入れる）
	if rift and not _rift_entered and not Game.input_locked:
		var d := pp + Vector3.UP * 0.6 - rift.global_position
		if Vector2(d.x, d.z).length() < 1.1 and absf(d.y) < 1.9:
			_enter_rift()
	# ソラ：回廊の上で近づいたら話しかける（素通りさせない）
	if sora and not TimelineState.met_sora and not _sora_talking and sora.talk != null and not Game.input_locked:
		if pp.distance_to(sora.global_position) < 2.7:
			_talk_sora()
	# ゴール
	if goal and not _goal_reached and TimelineState.is_robot_combat_cleared() and not Game.input_locked:
		var g := pp - GOAL_POS
		if Vector2(g.x, g.z).length() < 1.3 and absf(g.y) < 2.0:
			_on_goal()


func _animate_cars(delta: float) -> void:
	for c in _cars:
		c.a = float(c.a) + float(c.w) * delta
		var a: float = c.a
		var r: Vector2 = c.r
		var center: Vector3 = c.c
		var node: Node3D = c.node
		node.position = center + Vector3(cos(a) * r.x, sin(a * 2.0) * 1.5, sin(a) * r.y)
		var vel := Vector3(-sin(a) * r.x, 0.0, cos(a) * r.y) * signf(c.w)
		if vel.length() > 0.01:
			node.rotation.y = atan2(-vel.x, -vel.z)


# ================================================================ 検証用

## --robotdemo=windup|stun|off（スクリーンショット用にロボの状態を固定する）
## --chasedemo=X（閉鎖の前線を x = X から動かす）
func _apply_debug_demo() -> void:
	if Game.debug_args.has("chasedemo"):
		route.call("start_closure", float(Game.debug_args.chasedemo))
	var demo := str(Game.debug_args.get("robotdemo", ""))
	if demo == "" or robots.is_empty():
		return
	await get_tree().create_timer(0.6).timeout
	var r := robots[robots.size() - 1]
	if r.is_disabled():
		return
	match demo:
		"windup":
			r.arena_check = func() -> bool: return false
			r.call("_enter", GuardRobot.State.WINDUP)
			r.set_physics_process(false)
			r.call("_animate", 0.016, 0.0)
		"stun":
			r.on_shield_ripped((r.shield as Node3D).global_transform)
		"off":
			r.power_down(false)
