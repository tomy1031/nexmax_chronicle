extends EraBase
## クロー練習場（仕様 §18 ClawPrototype）：NMクローの「補助照準 → つかむ → 保持して運ぶ → 離す」だけを試す小部屋。
## 歯車は物理計算で運ばず、SocketGear の補間移動と固定の軸（ソケット）で動かす（仕様 §5.3）。
## 成功するたびに軸の位置が変わり、3回はめるとクリア。計測値（仕様 §15.1）を表示する。
## 本編のセーブデータを上書きしないよう、この部屋ではセーブしない。
## 検証用: -- --clear で計測パネルを表示する（見た目の確認用）。

const SkyProps := preload("res://scripts/eras/hub/sky_props.gd")
const HubBuilder := preload("res://scripts/eras/hub/hub_builder.gd")
const ProtoCard := preload("res://scripts/eras/hub/claw_proto_card.gd")

const ROUNDS := 3
const GEAR_RADIUS := 0.85
const HOME_POS := Vector3(-1.5, 1.15, 1.0)
const HOME_YAW := 22.0
const C_CYAN := Color(0.35, 0.9, 1.0)
const C_GOLD := Color(1.0, 0.82, 0.3)
const C_BAD := Color(1.0, 0.45, 0.3)
## 軸（ソケット）の候補。成功するたびに次の軸へ移る。yaw は軸の向き（歯車の面の向き）。
const SOCKETS := [
	{"name": "北の壁の軸", "pos": Vector3(0.0, 1.55, -6.35), "yaw": 0.0, "kind": "wall"},
	{"name": "東の台の軸", "pos": Vector3(4.6, 1.45, -1.6), "yaw": -90.0, "kind": "stand"},
	{"name": "西の台の軸", "pos": Vector3(-4.6, 1.45, -3.8), "yaw": 90.0, "kind": "stand"},
]

var _gear: SocketGear
var _anchor: Node3D
var _round := 0
var _active := 0
var _sockets: Array[Node3D] = []
var _socket_fx: Array[Node3D] = []
var _lamps: Array[MeshInstance3D] = []
var _drops := 0
var _round_times: Array[float] = []
var _round_start := 0.0
var _session_start := 0.0
var _busy := false
var _card: ProtoCard
var _ring: MeshInstance3D
var _ring_mat: StandardMaterial3D
var _gear_mats: Array[StandardMaterial3D] = []
var _aim_label: Label3D
var _exit_target: Node3D
var _flash_t := 0.0
var _celebrate_t := 0.0
var _t := 0.0
var _prev_era := TimelineState.ERA_FUTURE


func _init() -> void:
	# HUD 表示用の時代。TimelineState.current_era は入る前の値に戻す（_build_world）。
	era = TimelineState.ERA_PRESENT
	music_theme = "hub"


func _enter_tree() -> void:
	_prev_era = TimelineState.current_era


func _process(delta: float) -> void:
	_t += delta
	_flash_t = maxf(0.0, _flash_t - delta)
	_update_gear_fx(delta)
	if _card and player:
		var step := 0
		if player.claw.is_holding():
			step = 2
		elif player.claw.is_aiming():
			step = 1
		_card.set_step(step)
	for i in _socket_fx.size():
		var fx := _socket_fx[i]
		if fx.visible:
			fx.scale = Vector3.ONE * (1.0 + sin(_t * 4.0) * 0.04)


# ================================================================ ワールド

func _build_world() -> void:
	TimelineState.current_era = _prev_era
	_session_start = TimelineState.play_time
	_round_start = _session_start
	sun = LevelKit.environment(self, Color(0.3, 0.55, 0.92), Color(0.95, 0.86, 0.74), Color(0.6, 0.66, 0.85),
			Color(1.0, 0.9, 0.74), 1.1, Vector3(-52, 30, 0), 0.75, Color(0.9, 0.86, 0.82))
	_build_room()
	_build_sockets()
	_build_progress_board()
	_build_exit()
	_build_outside()
	_set_active_socket(0)
	_spawn_gear(false)
	_card = ProtoCard.new()
	add_child(_card)
	if Game.debug_args.has("nohud"):
		_card.visible = false
	add_spawn("proto_start", Vector3(0, 0.05, 4.8), 0.0)
	add_spawn("default", Vector3(0, 0.05, 4.8), 0.0)
	# 動かない部品を材質ごとに1つのメッシュへまとめる（Web版のドローコール対策）
	HubBuilder.merge_by_color(self)
	LevelKit.merge_static(self)
	if Game.debug_args.has("clear"):
		get_tree().create_timer(1.0).timeout.connect(_show_clear)


func _show_era_card() -> bool:
	# 大きな「2026年」の表示は出さず、場所の表示だけ練習場にする
	if "era_label" in Hud and Hud.era_label:
		Hud.era_label.text = "試作　クロー練習場"
	return false


func _start_story() -> void:
	Hud.toast("クロー練習場", "info", 2.2)
	Hud.hint("右クリック長押し（または Q）で構えて、光る歯車をねらおう", 6.0)


func refresh_objective() -> void:
	if _round >= ROUNDS:
		Hud.set_objective("練習クリア！", "もう一度練習するか、出口（F）からタイトルへ")
		if marker:
			marker.target = _exit_target
		return
	var holding := _is_holding_gear()
	var sub := "光る%sの近くで、左クリック（E）で離す" % SOCKETS[_active].name if holding \
			else "右クリックで構え → 左クリックでつかむ"
	Hud.set_objective("歯車を軸にはめよう（%d/%d）" % [_round, ROUNDS], sub)
	if marker:
		marker.target = _anchor if holding else _gear


func _is_holding_gear() -> bool:
	return player != null and _gear != null and is_instance_valid(_gear) and player.claw.held == _gear


# ---------------------------------------------------------------- 部屋

func _build_room() -> void:
	# 床：木の板（MultiMesh で1回の描画）と当たり判定
	HubBuilder.solid(self, Vector3(0, -0.2, 0), Vector3(14.8, 0.4, 14.8))
	var plank_xf: Array = []
	var plank_col: Array = []
	for i in 14:
		plank_xf.append(Transform3D(Basis.from_scale(Vector3(0.98, 0.1, 14.4)), Vector3(-6.5 + i, -0.05, 0)))
		plank_col.append(Color(0.78, 0.6, 0.42) if i % 2 == 0 else Color(0.72, 0.54, 0.38))
	SkyProps.multimesh(self, BoxMesh.new(), SkyProps.tint_mat(0.0, 0.7), plank_xf, false, plank_col)
	# 練習エリアの線（黄色）とスタート位置の円
	var line_mat := LevelKit.mat(Color(1.0, 0.82, 0.25), 0.4, 0.6)
	var lm := BoxMesh.new()
	lm.size = Vector3(1, 1, 1)
	for seg in [[Vector3(0, 0.01, -5.9), Vector3(11.8, 0.02, 0.1)], [Vector3(0, 0.01, 5.9), Vector3(11.8, 0.02, 0.1)],
			[Vector3(-5.9, 0.01, 0), Vector3(0.1, 0.02, 11.8)], [Vector3(5.9, 0.01, 0), Vector3(0.1, 0.02, 11.8)]]:
		LevelKit.mesh(self, lm, seg[0], line_mat, Vector3.ZERO, seg[1])
	HubBuilder.torus(self, Vector3(0, 0.02, 4.8), 0.9, 0.05, LevelKit.mat(C_CYAN, 1.6, 0.4), Vector3.ZERO, 32, 4)
	var start := LevelKit.label(self, "スタート", Vector3(0, 0.03, 5.95), 48, Color(0.35, 0.9, 1.0), false, Vector3(-90, 0, 0))
	start.pixel_size = 0.006
	# 歯車置き場の印
	HubBuilder.torus(self, Vector3(HOME_POS.x, 0.02, HOME_POS.z), 1.2, 0.05, LevelKit.mat(C_GOLD, 1.4, 0.4), Vector3.ZERO, 32, 4)
	# 壁（下は木の腰板、上はクリーム色）
	var cream := Color(0.93, 0.89, 0.8)
	var wood := Color(0.6, 0.43, 0.3)
	for w in [[Vector3(0, 0, -7.2), Vector3(14.8, 0, 0.4)], [Vector3(0, 0, 7.2), Vector3(14.8, 0, 0.4)],
			[Vector3(-7.2, 0, 0), Vector3(0.4, 0, 14.8)], [Vector3(7.2, 0, 0), Vector3(0.4, 0, 14.8)]]:
		var p: Vector3 = w[0]
		var s: Vector3 = w[1]
		LevelKit.box(self, p + Vector3(0, 1.6, 0), Vector3(s.x, 3.2, s.z), cream)
		LevelKit.box(self, p + Vector3(0, 0.5, 0) - p.normalized() * 0.03, Vector3(maxf(s.x - 0.1, 0.45), 1.0, maxf(s.z - 0.1, 0.45)), wood, false)
		LevelKit.box(self, p + Vector3(0, 3.25, 0), Vector3(s.x + 0.1, 0.16, s.z + 0.1), wood, false)
	# 窓（空が見える明るいガラス）
	for wz in [-3.2, 2.0]:
		for sx in [-1.0, 1.0]:
			_window(Vector3(6.98 * sx, 1.95, wz), 90.0 * sx)
	# 天井の梁と吊りランプ
	for bz in [-3.5, 0.0, 3.5]:
		LevelKit.box(self, Vector3(0, 3.35, bz), Vector3(14.4, 0.22, 0.26), wood, false)
	for lp in [Vector3(-2.5, 3.35, -1.75), Vector3(2.5, 3.35, 1.75)]:
		HubBuilder.hanging_lamp(self, lp, 0.6, true)
	# 看板
	HubBuilder.sign_board(self, Vector3(-3.6, 2.45, -6.95), "クロー練習場", "NMClaw Training", C_CYAN, 2.9)
	# 作業台・工具・木箱・飾りの歯車
	LevelKit.box(self, Vector3(-6.4, 0.45, 3.2), Vector3(1.0, 0.9, 2.6), Color(0.7, 0.52, 0.36))
	LevelKit.box(self, Vector3(-6.65, 1.6, 3.2), Vector3(0.06, 1.0, 2.2), Color(0.55, 0.42, 0.3), false)
	var tools := [Color(0.95, 0.35, 0.3), Color(0.3, 0.6, 1.0), Color(1.0, 0.8, 0.25)]
	for i in 6:
		LevelKit.box(self, Vector3(-6.6, 1.55, 2.35 + i * 0.34), Vector3(0.04, 0.4 + (i % 3) * 0.1, 0.07), tools[i % 3], false)
	for c in [[Vector3(6.3, 0.35, 4.6), 0.7, 0.0], [Vector3(6.2, 0.3, 3.6), 0.6, 20.0], [Vector3(6.35, 0.95, 4.55), 0.5, 10.0], [Vector3(-6.2, 0.35, -5.9), 0.7, 15.0]]:
		var crate := LevelKit.box(self, c[0], Vector3.ONE * c[1], Color(0.74, 0.56, 0.36))
		crate.rotation_degrees.y = c[2]
	LevelKit.gear(self, Vector3(3.2, 2.2, 6.97), 0.7, 0.12, Color(0.75, 0.62, 0.4), 10)
	LevelKit.gear(self, Vector3(4.3, 1.55, 6.97), 0.45, 0.12, Color(0.6, 0.66, 0.75), 8)
	LevelKit.gear(self, Vector3(-4.5, 2.0, 6.97), 0.6, 0.12, Color(0.75, 0.62, 0.4), 10)
	for p in [Vector3(-6.3, 0, -6.3), Vector3(6.3, 0, -6.3), Vector3(-6.3, 0, 6.3)]:
		HubBuilder.plant(self, p, 0.85)


func _window(pos: Vector3, yaw: float) -> void:
	var n := Node3D.new()
	n.position = pos
	n.rotation_degrees.y = yaw
	add_child(n)
	var frame := BoxMesh.new()
	frame.size = Vector3(1.9, 1.4, 0.08)
	LevelKit.mesh(n, frame, Vector3.ZERO, LevelKit.mat(Color(0.95, 0.95, 0.95)))
	var glass := QuadMesh.new()
	glass.size = Vector2(1.7, 1.2)
	var g := LevelKit.mesh(n, glass, Vector3(0, 0, -0.05), LevelKit.mat(Color(0.62, 0.84, 1.0), 0.9, 0.2), Vector3(0, 180, 0))
	g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var bar := BoxMesh.new()
	bar.size = Vector3(0.06, 1.2, 0.1)
	LevelKit.mesh(n, bar, Vector3(0, 0, -0.04), LevelKit.mat(Color(0.95, 0.95, 0.95)))


# ---------------------------------------------------------------- 軸（ソケット）

func _build_sockets() -> void:
	var metal := Color(0.62, 0.66, 0.74)
	for i in SOCKETS.size():
		var d: Dictionary = SOCKETS[i]
		var pos: Vector3 = d.pos
		var s := Node3D.new()
		s.name = "Socket%d" % i
		s.position = pos
		s.rotation_degrees.y = d.yaw
		add_child(s)
		_sockets.append(s)
		# 軸の土台：壁の円板、または台の柱（歯車の奥側）
		if d.kind == "wall":
			LevelKit.cyl(s, Vector3(0, 0, -0.6), 1.05, 0.12, Color(0.8, 0.78, 0.74), false, Vector3(90, 0, 0), 24)
			HubBuilder.torus(s, Vector3(0, 0, -0.53), 1.05, 0.05, LevelKit.mat(Color(0.85, 0.66, 0.36), 0.0, 0.35, 0.6), Vector3(90, 0, 0), 32, 6)
		else:
			LevelKit.box(s, Vector3(0, -0.5, -0.72), Vector3(0.62, 1.95, 0.42), Color(0.82, 0.8, 0.76))
			LevelKit.box(s, Vector3(0, -1.42, -0.5), Vector3(1.2, 0.12, 1.2), Color(0.55, 0.58, 0.64), false)
			var stripe := LevelKit.box(s, Vector3(0, 0.3, -0.5), Vector3(0.64, 0.08, 0.02), C_GOLD, false)
			(stripe as MeshInstance3D).material_override = LevelKit.mat(C_GOLD, 1.0, 0.4)
		LevelKit.cyl(s, Vector3(0, 0, -0.27), 0.12, 0.6, metal, false, Vector3(90, 0, 0), 12)
		LevelKit.cyl(s, Vector3(0, 0, 0.05), 0.17, 0.06, metal.darkened(0.3), false, Vector3(90, 0, 0), 12)
		# 今の軸だけに出す光（床の輪・軸の輪・ラベル）
		var fx := Node3D.new()
		fx.name = "ActiveFx"
		fx.add_to_group("dynamic")
		s.add_child(fx)
		var glow := HubBuilder.torus(fx, Vector3(0, 0, 0.0), 0.32, 0.05, LevelKit.mat(C_CYAN, 3.0, 0.3), Vector3(90, 0, 0), 24, 6)
		glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var floor_ring := HubBuilder.torus(fx, Vector3(0, -pos.y + 0.03, 0.0), 1.1, 0.06, LevelKit.mat(C_CYAN, 2.4, 0.3), Vector3.ZERO, 40, 4)
		floor_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var col := CylinderMesh.new()
		col.top_radius = 0.95
		col.bottom_radius = 1.05
		col.height = 3.0
		col.radial_segments = 20
		col.rings = 1
		col.cap_top = false
		col.cap_bottom = false
		var beam := LevelKit.mesh(fx, col, Vector3(0, -pos.y + 1.5, 0), HubBuilder.holo_material(C_CYAN, Color(0, 0, 0), 0.35))
		beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var lab := LevelKit.label(fx, "ここにはめる", Vector3(0, 1.3, 0), 52, Color(0.7, 0.97, 1.0), true, Vector3.ZERO, Color(0.02, 0.06, 0.16, 0.9))
		lab.pixel_size = 0.007
		lab.no_depth_test = true
		_socket_fx.append(fx)


func _set_active_socket(i: int) -> void:
	_active = i
	for k in _socket_fx.size():
		_socket_fx[k].visible = k == i


func _build_progress_board() -> void:
	# 北の壁の進み具合ランプ（成功するたびに1つ灯る）
	var board := Node3D.new()
	board.position = Vector3(3.4, 2.45, -6.97)
	add_child(board)
	var back := BoxMesh.new()
	back.size = Vector3(2.4, 0.9, 0.06)
	LevelKit.mesh(board, back, Vector3.ZERO, LevelKit.mat(Color(0.08, 0.12, 0.24)))
	var frame := BoxMesh.new()
	frame.size = Vector3(2.52, 1.02, 0.04)
	LevelKit.mesh(board, frame, Vector3(0, 0, -0.03), LevelKit.mat(C_GOLD, 1.2, 0.4))
	var title := LevelKit.label(board, "成功ランプ", Vector3(0, 0.27, 0.04), 36, Color(1.0, 0.9, 0.6))
	title.pixel_size = 0.006
	var sm := SphereMesh.new()
	sm.radius = 0.16
	sm.height = 0.32
	sm.radial_segments = 12
	sm.rings = 6
	for i in ROUNDS:
		var mi := LevelKit.mesh(board, sm, Vector3(-0.7 + i * 0.7, -0.12, 0.06), LevelKit.mat(Color(0.3, 0.32, 0.4), 0.0, 0.4))
		mi.add_to_group("dynamic")
		_lamps.append(mi)


func _light_lamp(i: int, on: bool = true) -> void:
	if i < 0 or i >= _lamps.size():
		return
	_lamps[i].material_override = LevelKit.mat(C_GOLD, 3.0, 0.3) if on else LevelKit.mat(Color(0.3, 0.32, 0.4), 0.0, 0.4)


func _build_exit() -> void:
	var door := Node3D.new()
	door.position = Vector3(5.2, 0, 6.97)
	door.rotation_degrees.y = 180.0
	add_child(door)
	var frame := BoxMesh.new()
	frame.size = Vector3(1.7, 2.5, 0.1)
	LevelKit.mesh(door, frame, Vector3(0, 1.25, 0), LevelKit.mat(Color(0.9, 0.9, 0.92)))
	var panel := BoxMesh.new()
	panel.size = Vector3(1.4, 2.3, 0.08)
	LevelKit.mesh(door, panel, Vector3(0, 1.15, 0.03), LevelKit.mat(Color(0.35, 0.55, 0.75)))
	var sign_mesh := BoxMesh.new()
	sign_mesh.size = Vector3(1.0, 0.4, 0.05)
	LevelKit.mesh(door, sign_mesh, Vector3(0, 2.75, 0.02), LevelKit.mat(Color(0.25, 0.85, 0.45), 1.6, 0.4))
	var l := LevelKit.label(door, "出口", Vector3(0, 2.75, 0.06), 56, Color.WHITE, false, Vector3.ZERO, Color(0.0, 0.3, 0.1, 0.9))
	l.pixel_size = 0.006
	var it := Interactable.create(self, Vector3(5.2, 0, 6.1), "タイトルへ戻る", func() -> void: Game.goto_title(), 1.7, 1.8)
	it.name = "ExitToTitle"
	_exit_target = Node3D.new()
	_exit_target.position = Vector3(5.2, 0.6, 6.5)
	add_child(_exit_target)


func _build_outside() -> void:
	SkyProps.islands(self, 61, 6, 26.0, 45.0, -6.0, 8.0, 2.0, 4.5, 0.0, TAU, false)
	SkyProps.clouds(self, 62, 16, 40.0, 120.0, -20.0, 10.0, 4.0, 9.0)


# ---------------------------------------------------------------- 歯車

func _spawn_gear(pop: bool) -> void:
	_anchor = Node3D.new()
	_anchor.name = "Anchor%d" % _round
	_sockets[_active].add_child(_anchor)
	_gear = SocketGear.new()
	_gear.name = "PracticeGear"
	_gear.display_name = "大歯車"
	_gear.position = HOME_POS
	_gear.rotation_degrees.y = HOME_YAW
	add_child(_gear)
	var vis := LevelKit.gear(_gear, Vector3.ZERO, GEAR_RADIUS, 0.3, Color(0.86, 0.6, 0.3), 10, Color(0.95, 0.76, 0.42))
	# この歯車だけの材質にして、照準中などに光らせる
	_gear_mats.clear()
	for mi in vis.find_children("*", "MeshInstance3D", true, false):
		var m := ((mi as MeshInstance3D).material_override as StandardMaterial3D).duplicate() as StandardMaterial3D
		m.emission_enabled = true
		m.emission = C_GOLD
		m.emission_energy_multiplier = 0.0
		(mi as MeshInstance3D).material_override = m
		_gear_mats.append(m)
	_ring_mat = StandardMaterial3D.new()
	_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_mat.albedo_color = Color(C_GOLD, 0.0)
	_ring = HubBuilder.torus(_gear, Vector3.ZERO, GEAR_RADIUS * 1.16, 0.045, _ring_mat, Vector3(90, 0, 0), 40, 6)
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_aim_label = LevelKit.label(_gear, "左クリック ／ E でつかむ", Vector3(0, 1.35, 0), 44, Color(0.75, 0.97, 1.0), true, Vector3.ZERO, Color(0.02, 0.06, 0.16, 0.9))
	_aim_label.pixel_size = 0.0065
	_aim_label.no_depth_test = true
	_aim_label.visible = false
	var socks: Array[Node3D] = [_anchor]
	_gear.setup(vis, socks, GEAR_RADIUS)
	_gear.snap_radius = 2.4
	_gear.carry_height = 1.5
	_gear.placed.connect(_on_placed)
	_gear.grabbed.connect(refresh_objective)
	_gear.released.connect(_on_released, CONNECT_DEFERRED)
	if pop:
		vis.scale = Vector3.ONE * 0.05
		create_tween().tween_property(vis, "scale", Vector3.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## つかめる／ねらっている／保持中／失敗の違いを、輪と発光で見せる（仕様 §18）。
func _update_gear_fx(delta: float) -> void:
	if _gear == null or not is_instance_valid(_gear) or _ring_mat == null:
		return
	var claw: ClawController = player.claw if player else null
	var aimed := claw != null and claw.aimed == _gear
	var held := claw != null and claw.held == _gear
	var grabbable := _gear.can_grab() and not _busy
	var col := C_GOLD
	var alpha := 0.0
	var energy := 0.0
	var ring_scale := 1.0
	if held:
		col = C_CYAN
		energy = 0.35
	elif aimed and grabbable:
		col = C_CYAN
		alpha = 0.85 + 0.15 * sin(_t * 14.0)
		energy = 0.55 + 0.25 * sin(_t * 14.0)
		ring_scale = 1.0 + 0.05 * sin(_t * 14.0)
	elif grabbable:
		alpha = 0.35 + 0.25 * sin(_t * 3.0)
		energy = 0.1 + 0.08 * sin(_t * 3.0)
	if _flash_t > 0.0:
		col = C_BAD
		alpha = 0.9 * _flash_t / 0.6
		energy = 0.9 * _flash_t / 0.6
	if _celebrate_t > 0.0:
		_celebrate_t -= delta
		col = C_GOLD
		energy = 0.8
		if _gear.visual:
			_gear.visual.rotation.z += delta * 5.0
	_ring_mat.albedo_color = Color(col, alpha)
	_ring.visible = alpha > 0.01
	_ring.scale = Vector3.ONE * ring_scale
	for m in _gear_mats:
		m.emission = col
		m.emission_energy_multiplier = energy
	_aim_label.visible = aimed and grabbable


func _on_released() -> void:
	if _gear == null or not is_instance_valid(_gear):
		return
	if not _gear.is_placed():
		# 軸から遠くで離した：歯車は SocketGear が補間で元の場所へ戻す（2秒以内に再挑戦できる）
		_drops += 1
		_flash_t = 0.6
	refresh_objective()


func _on_placed(_s: Node3D) -> void:
	if _busy:
		return
	_busy = true
	TimelineState.mark_metric_time("claw_first_success_time")
	_round_times.append(TimelineState.play_time - _round_start)
	_round += 1
	Sfx.play("success")
	Hud.toast("成功！ %d / %d" % [_round, ROUNDS], "good", 2.0)
	Hud.flash(Color(1.0, 0.9, 0.5, 0.25), 0.3)
	_burst(_anchor.global_position)
	_light_lamp(_round - 1)
	_celebrate_t = 1.4
	refresh_objective()
	if _card and _round == 1:
		_card.set_compact(true)
	await get_tree().create_timer(1.5).timeout
	if not is_inside_tree():
		return
	if _round >= ROUNDS:
		_busy = false
		_show_clear()
		return
	await _next_round()
	_busy = false


## 歯車を元の場所へ補間で戻し、次の軸へ切り替える。
func _next_round() -> void:
	var old := _gear
	var old_anchor := _anchor
	var from := old.global_transform
	var to := old.home
	var tw := create_tween()
	tw.tween_method(func(k: float) -> void: old.global_transform = from.interpolate_with(to, k), 0.0, 1.0, 0.6) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	await tw.finished
	if not is_inside_tree():
		return
	old.queue_free()
	old_anchor.queue_free()
	_set_active_socket((_active + 1) % SOCKETS.size())
	_spawn_gear(false)
	_round_start = TimelineState.play_time
	Sfx.play("click", 0.9)
	Hud.hint("軸の位置が変わった！ 光っている%sを探そう" % SOCKETS[_active].name, 4.0)
	refresh_objective()


func _burst(pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = 40
	p.lifetime = 1.0
	p.explosiveness = 0.9
	var m := SphereMesh.new()
	m.radius = 0.06
	m.height = 0.12
	m.radial_segments = 6
	m.rings = 3
	p.mesh = m
	p.material_override = LevelKit.mat(C_GOLD, 3.0, 0.3)
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.6
	p.direction = Vector3.UP
	p.spread = 180.0
	p.gravity = Vector3(0, -4.0, 0)
	p.initial_velocity_min = 2.0
	p.initial_velocity_max = 4.5
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.4
	add_child(p)
	p.global_position = pos
	p.emitting = true
	get_tree().create_timer(1.6).timeout.connect(p.queue_free)


# ---------------------------------------------------------------- クリアと計測

func _show_clear() -> void:
	var first := float(TimelineState.metrics.get("claw_first_success_time", -1.0))
	var first_rel := first - _session_start if first >= 0.0 else -1.0
	var grabs := int(TimelineState.metrics.get("claw_grabs", 0))
	var mis := int(TimelineState.metrics.get("claw_misgrabs", 0))
	var total := TimelineState.play_time - _session_start
	var times := PackedStringArray()
	for i in _round_times.size():
		times.append("%d回目 %.1f秒" % [i + 1, _round_times[i]])
	print("CLAW_PROTO_RESULT first_success=%.1fs grabs=%d misgrabs=%d far_drops=%d total=%.1fs rounds=[%s]" % [
			first_rel, grabs, mis, _drops, total, ", ".join(times)])
	var rows := [
		["はじめて成功するまで", "%.1f 秒" % first_rel if first_rel >= 0.0 else "―"],
		["つかんだ回数", "%d 回" % grabs],
		["つかみ損ね（対象なしで左クリック）", "%d 回" % mis],
		["軸から遠くで離した回数", "%d 回" % _drops],
		["各回のタイム", " ／ ".join(times) if not times.is_empty() else "―"],
		["合計時間", "%.1f 秒" % total],
	]
	var bb := "[center][color=#ffd040][b]%d回とも軸にはめられた！[/b][/color][/center]\n\n[table=2]" % ROUNDS
	for r in rows:
		bb += "[cell padding=8,5,28,5][color=#a8bcd8]%s[/color][/cell][cell padding=8,5,8,5][b]%s[/b][/cell]" % [r[0], r[1]]
	bb += "[/table]\n\n[center][font_size=15][color=#8ea0c8]※テスト観察シート（仕様 §15.1）向けの計測値です[/color][/font_size][/center]"
	if _card:
		_card.visible = false
	var idx: int = await Hud.show_panel("練習クリア！", bb, ["もう一度練習する", "タイトルへ戻る"])
	if idx == 1:
		Game.goto_title()
		return
	_restart()


func _restart() -> void:
	TimelineState.metrics["claw_first_success_time"] = -1.0
	TimelineState.metrics["claw_grabs"] = 0
	TimelineState.metrics["claw_misgrabs"] = 0
	_drops = 0
	_round = 0
	_round_times.clear()
	_session_start = TimelineState.play_time
	_round_start = _session_start
	for i in _lamps.size():
		_light_lamp(i, false)
	if _gear and is_instance_valid(_gear):
		_gear.queue_free()
	if _anchor and is_instance_valid(_anchor):
		_anchor.queue_free()
	_set_active_socket(0)
	_spawn_gear(true)
	if _card:
		_card.visible = not Game.debug_args.has("nohud")
		_card.set_compact(false)
	refresh_objective()
	Hud.toast("もう一度！", "info", 1.6)
