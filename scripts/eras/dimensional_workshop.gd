extends EraBase
## 異次元拠点（仕様 §7）：ネクマックスの時空装置に付属する、整備用の小さな浮遊工房。
## 修理台（回復）・装備ラック（クロー交換）・記録盤（三つの時代の記録）・実験台（準備中）と、2つの扉。
## 到着するとチェックポイントとして自動保存する（仕様 §17）。初回だけ案内の会話を出す。
## 検証用: -- --open=records|equip で、到着後にそのパネルを開く。

const HubBuilder := preload("res://scripts/eras/hub/hub_builder.gd")
const SkyProps := preload("res://scripts/eras/hub/sky_props.gd")

const R := 11.0                       # 床の半径
const EMBLEM := Vector2(0.0, 4.6)     # 床の紋章の中心（x, z）
const C_CYAN := Color(0.35, 0.82, 1.0)
const C_GOLD := Color(1.0, 0.72, 0.3)
const C_PURPLE := Color(0.72, 0.5, 1.0)
const C_1726 := Color(1.0, 0.68, 0.32)
const C_2026 := Color(0.42, 0.78, 1.0)
const C_2086 := Color(0.72, 0.55, 1.0)

const CLAW_NAMES := {"claw_standard": "標準クロー", "claw_long": "ロングクロー"}
const BOT_LINES := [
	"ピコッ。修理台は何度でも使えます！",
	"ピポ？ クローの交換は、となりの装備ラックで。",
	"記録盤には、三つの時代の記録が集まります。",
	"扉の先は、安全なチェックポイントにつながっています。",
]

var _rack_pads := {}          # 装備ID -> 光る台
var _rack_claws := {}         # 装備ID -> 展示のクロー
var _equipped_label: Label3D
var _arm_base: Node3D
var _arm_upper: Node3D
var _arm_fore: Node3D
var _recover_root: Node3D
var _bot: Npc
var _bot_line := 0
var _t := 0.0
var _heal_anim := 0.0


func _init() -> void:
	era = TimelineState.ERA_HUB
	music_theme = "hub"


func _process(delta: float) -> void:
	_t += delta
	_animate_arm(delta)
	if _bot:
		_bot.position.y = 0.55 + sin(_t * 2.2) * 0.08


# ================================================================ ワールド

func _build_world() -> void:
	sun = LevelKit.environment(self, Color(0.27, 0.5, 0.9), Color(0.98, 0.84, 0.68), Color(0.6, 0.66, 0.85),
			Color(1.0, 0.86, 0.66), 1.05, Vector3(-46, 38, 0), 0.7, Color(0.92, 0.84, 0.8))
	_build_platform()
	_build_canopy()
	HubBuilder.holo_globe(self, Vector3.ZERO)
	var screens := [
		[C_1726, "1726", "江戸・大坂", false],
		[C_2026, "2026", "なんば", false],
		[C_2086, "2086", "ナンバタウン", not TimelineState.drawing_confirmed],
	]
	for i in screens.size():
		var s: Array = screens[i]
		HubBuilder.era_screen(self, Vector3(0, 3.1, 0), 2.75, TAU * i / 3.0 + 0.4, s[0], s[1], s[2], s[3])
	var gl := OmniLight3D.new()
	gl.position = Vector3(0, 3.0, 0)
	gl.light_color = Color(0.45, 0.85, 1.0)
	gl.light_energy = 1.2
	gl.omni_range = 6.0
	add_child(gl)

	_build_recover(-78.0, 8.2)
	_build_equip(78.0, 8.2)
	_build_records(132.0, 8.0)
	_build_lab(-132.0, 8.0)
	targets["future_gate"] = _build_gate(-27.0, TimelineState.drawing_confirmed, C_2086, "2086年 ナンバタウン",
			"未来への扉", "2086年 ナンバタウンへ", _use_future_gate, "FutureGate")
	targets["present_gate"] = _build_gate(27.0, true, C_2026, "2026年 なんば",
			"最後のチェックポイントへ", "2026年 なんばへ（最後のチェックポイント）", _use_present_gate, "PresentGate")
	_build_decor()
	_build_sky()

	add_spawn("hub_start", Vector3(0, 0.05, 6.55), 0.0)
	add_spawn("default", Vector3(0, 0.05, 6.55), 0.0)
	# 動かない部品を材質ごとに1つのメッシュへまとめてドローコールを減らす
	HubBuilder.merge_by_color(self)
	LevelKit.merge_static(self)
	if Game.debug_args.has("open"):
		get_tree().create_timer(3.5).timeout.connect(_debug_open)


func _start_story() -> void:
	var first := int(TimelineState.metrics.get("hub_visits", 0)) == 0
	TimelineState.add_metric("hub_visits")
	checkpoint("hub_start")
	if first:
		var lines: Array = DialogueDB.lines("hub_first")
		# 未来の座標が戻っていない時は、最後の「扉が使えます」を言わない
		if not TimelineState.drawing_confirmed and lines.size() > 2:
			lines = lines.slice(0, 2)
		await Hud.say(lines)


func _debug_open() -> void:
	match str(Game.debug_args.get("open", "")):
		"records":
			_use_records()
		"equip":
			_use_equip()


# ---------------------------------------------------------------- 床と柵

func _build_platform() -> void:
	# 床（当たり判定つき）と模様
	LevelKit.cyl(self, Vector3(0, -0.4, 0), R, 0.8, Color(0.72, 0.68, 0.62), true, Vector3.ZERO, 48)
	HubBuilder.floor_pattern(self, R, EMBLEM, 1.45)
	# 床の裏側：機械の胴と光る輪、下の岩
	LevelKit.cyl(self, Vector3(0, -1.6, 0), 7.6, 1.6, Color(0.7, 0.7, 0.74), false, Vector3.ZERO, 32, R)
	HubBuilder.torus(self, Vector3(0, -2.4, 0), 7.5, 0.12, LevelKit.mat(C_CYAN, 2.4, 0.4), Vector3.ZERO, 48, 6)
	LevelKit.cone(self, Vector3(0, -5.4, 0), 7.2, 6.0, Color(0.56, 0.47, 0.42), 12, Vector3(180, 0, 0))
	var core := LevelKit.sphere(self, Vector3(0, -8.3, 0), 0.8, Color(0.5, 0.9, 1.0), Vector3.ONE, 12)
	core.material_override = LevelKit.mat(Color(0.5, 0.9, 1.0), 3.0, 0.3)
	# ふち（丸い縁石）・光の線・手すり
	var curb := HubBuilder.torus(self, Vector3(0, 0.08, 0), R - 0.1, 0.32, LevelKit.mat(Color(0.88, 0.84, 0.76), 0.0, 0.5), Vector3.ZERO, 64, 8)
	curb.scale = Vector3(1, 0.55, 1)
	HubBuilder.torus(self, Vector3(0, 0.2, 0), R - 0.42, 0.03, LevelKit.mat(C_CYAN, 2.5, 0.4), Vector3.ZERO, 64, 4)
	HubBuilder.torus(self, Vector3(0, 1.05, 0), R - 0.1, 0.05, LevelKit.mat(Color(0.86, 0.66, 0.36), 0.0, 0.35, 0.6), Vector3.ZERO, 64, 6)
	var post := CylinderMesh.new()
	post.top_radius = 0.04
	post.bottom_radius = 0.05
	post.height = 0.95
	post.radial_segments = 6
	post.rings = 1
	var xf: Array = []
	for i in 72:
		var a := TAU * i / 72.0
		xf.append(Transform3D(Basis.IDENTITY, Vector3(sin(a) * (R - 0.1), 0.55, -cos(a) * (R - 0.1))))
	SkyProps.multimesh(self, post, LevelKit.mat(Color(0.86, 0.66, 0.36), 0.0, 0.35, 0.6), xf)
	# 見えない壁（外へ落ちない）
	var n := 28
	for i in n:
		var th := 360.0 * i / n
		var w := LevelKit.wall(self, HubBuilder.polar(th, R + 0.15, 2.5), Vector3(TAU * (R + 0.15) / n * 1.15, 6.0, 0.4))
		w.rotation.y = -deg_to_rad(th)


# ---------------------------------------------------------------- 柱と天井の骨組み

func _build_canopy() -> void:
	var white := Color(0.9, 0.85, 0.78)
	var pillar_angles := [0.0, 55.0, 105.0, 155.0, -155.0, -105.0, -55.0]
	for th in pillar_angles:
		var p := HubBuilder.polar(th, R - 0.15)
		LevelKit.cyl(self, p + Vector3(0, 3.3, 0), 0.32, 6.6, white, true, Vector3.ZERO, 12)
		LevelKit.cyl(self, p + Vector3(0, 0.25, 0), 0.45, 0.5, Color(0.8, 0.62, 0.38), false, Vector3.ZERO, 12)
		var band := LevelKit.cyl(self, p + Vector3(0, 2.4, 0), 0.34, 0.12, C_CYAN, false, Vector3.ZERO, 12)
		(band as MeshInstance3D).material_override = LevelKit.mat(C_CYAN, 2.0, 0.4)
	HubBuilder.torus(self, Vector3(0, 6.6, 0), R - 0.15, 0.24, LevelKit.mat(white, 0.0, 0.5), Vector3.ZERO, 64, 8)
	HubBuilder.torus(self, Vector3(0, 6.3, 0), R - 0.15, 0.04, LevelKit.mat(C_GOLD, 2.0, 0.4), Vector3.ZERO, 64, 4)
	# 天井の中央の輪と梁（空が見える骨組み）
	HubBuilder.torus(self, Vector3(0, 7.7, 0), 3.4, 0.2, LevelKit.mat(white, 0.0, 0.5), Vector3.ZERO, 48, 8)
	HubBuilder.torus(self, Vector3(0, 7.45, 0), 3.4, 0.04, LevelKit.mat(C_CYAN, 2.2, 0.4), Vector3.ZERO, 48, 4)
	var beam := BoxMesh.new()
	for th in pillar_angles:
		var a := HubBuilder.polar(th, 3.4, 7.7)
		var b := HubBuilder.polar(th, R - 0.15, 6.6)
		beam.size = Vector3(0.22, 0.26, a.distance_to(b))
		var mi := LevelKit.mesh(self, beam, (a + b) * 0.5, LevelKit.mat(white, 0.0, 0.5))
		mi.look_at((a + b) * 0.5 + (b - a), Vector3.UP)
	# 吊りランプ（4つだけ灯りを付ける）
	var lamp_angles := [55.0, -55.0, 155.0, -155.0, 0.0, 105.0, -105.0]
	for i in lamp_angles.size():
		var th: float = lamp_angles[i]
		var p := HubBuilder.polar(th, 6.6, 7.7 - (6.6 - 3.4) / (R - 3.55) * 1.1)
		HubBuilder.hanging_lamp(self, p, 2.2 + (i % 2) * 0.5, i < 4)
	# 梁から垂れるつる草と葉の茂み
	var rng := RandomNumberGenerator.new()
	rng.seed = 17
	var vine_xf: Array = []
	var vine_col: Array = []
	var leaf_xf: Array = []
	var leaf_col: Array = []
	for i in 46:
		var th := rng.randf() * 360.0
		var l := rng.randf_range(0.8, 2.6)
		var p := HubBuilder.polar(th, R - 0.15 + rng.randf_range(-0.2, 0.2), 6.5 - l * 0.5)
		vine_xf.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(0.07, l, 0.07)), p))
		vine_col.append(Color(0.28, 0.58, 0.28).lightened(rng.randf_range(0.0, 0.2)))
		if i % 2 == 0:
			var q := HubBuilder.polar(th + rng.randf_range(-3, 3), R - 0.15, 6.75)
			var s := rng.randf_range(0.35, 0.6)
			leaf_xf.append(Transform3D(Basis.from_scale(Vector3(s * 1.4, s, s * 1.2)), q))
			leaf_col.append(Color(0.32, 0.62, 0.3).lightened(rng.randf_range(0.0, 0.18)))
	var bm := BoxMesh.new()
	SkyProps.multimesh(self, bm, SkyProps.tint_mat(), vine_xf, false, vine_col)
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 8
	sm.rings = 4
	SkyProps.multimesh(self, sm, SkyProps.tint_mat(), leaf_xf, false, leaf_col)


# ---------------------------------------------------------------- 修理台（回復）

func _build_recover(theta: float, r: float) -> void:
	var st := HubBuilder.station_root(self, theta, r, "Recover")
	_recover_root = st
	var white := Color(0.95, 0.95, 0.97)
	LevelKit.box(st, Vector3(0, 1.6, -1.3), Vector3(4.0, 3.2, 0.3), Color(0.93, 0.9, 0.85))
	LevelKit.box(st, Vector3(0.45, 1.95, -1.12), Vector3(2.3, 1.15, 0.06), Color(0.72, 0.56, 0.4), false)
	# 工具（壁の板に掛ける）
	var tool_xf: Array = []
	var tool_col: Array = []
	var tool_palette := [Color(0.95, 0.35, 0.3), Color(0.3, 0.6, 1.0), Color(1.0, 0.8, 0.25), Color(0.8, 0.82, 0.86)]
	for i in 9:
		var h := 0.35 + (i % 3) * 0.12
		tool_xf.append(Transform3D(Basis.from_scale(Vector3(0.07, h, 0.05)), Vector3(-0.45 + i * 0.22, 1.95 + 0.25 - h * 0.5, -1.06)))
		tool_col.append(tool_palette[i % tool_palette.size()])
	SkyProps.multimesh(st, BoxMesh.new(), SkyProps.tint_mat(0.0, 0.5), tool_xf, false, tool_col)
	# 修理ベッド
	LevelKit.box(st, Vector3(0.35, 0.4, -0.1), Vector3(2.4, 0.8, 1.2), white)
	var pad := LevelKit.box(st, Vector3(0.35, 0.84, -0.1), Vector3(2.1, 0.08, 0.95), C_CYAN, false)
	(pad as MeshInstance3D).material_override = LevelKit.mat(Color(0.4, 0.85, 1.0), 0.9, 0.4)
	var strip := LevelKit.box(st, Vector3(0.35, 0.62, 0.51), Vector3(2.42, 0.06, 0.04), C_CYAN, false)
	(strip as MeshInstance3D).material_override = LevelKit.mat(C_CYAN, 2.4, 0.4)
	# ロボットアーム（台の左）
	LevelKit.cyl(st, Vector3(-1.5, 0.5, -0.55), 0.32, 1.0, white, true, Vector3.ZERO, 14)
	_arm_base = Node3D.new()
	_arm_base.add_to_group("dynamic")
	_arm_base.position = Vector3(-1.5, 1.0, -0.55)
	st.add_child(_arm_base)
	LevelKit.cyl(_arm_base, Vector3(0, 0.1, 0), 0.24, 0.2, Color(0.35, 0.38, 0.45), false, Vector3.ZERO, 12)
	var ring := LevelKit.cyl(_arm_base, Vector3(0, 0.21, 0), 0.25, 0.05, Color(1.0, 0.7, 0.25), false, Vector3.ZERO, 12)
	(ring as MeshInstance3D).material_override = LevelKit.mat(Color(1.0, 0.7, 0.25), 1.2, 0.4)
	_arm_upper = Node3D.new()
	_arm_upper.position = Vector3(0, 0.25, 0)
	_arm_base.add_child(_arm_upper)
	LevelKit.sphere(_arm_upper, Vector3.ZERO, 0.16, Color(0.35, 0.38, 0.45), Vector3.ONE, 10)
	LevelKit.box(_arm_upper, Vector3(0, 0.45, 0), Vector3(0.2, 0.9, 0.2), white, false)
	LevelKit.box(_arm_upper, Vector3(0, 0.45, 0.105), Vector3(0.12, 0.6, 0.02), Color(1.0, 0.62, 0.2), false)
	_arm_fore = Node3D.new()
	_arm_fore.position = Vector3(0, 0.9, 0)
	_arm_upper.add_child(_arm_fore)
	LevelKit.sphere(_arm_fore, Vector3.ZERO, 0.13, Color(0.35, 0.38, 0.45), Vector3.ONE, 10)
	LevelKit.box(_arm_fore, Vector3(0, 0.38, 0), Vector3(0.16, 0.76, 0.16), white, false)
	LevelKit.box(_arm_fore, Vector3(-0.07, 0.86, 0), Vector3(0.05, 0.2, 0.08), Color(0.35, 0.38, 0.45), false)
	LevelKit.box(_arm_fore, Vector3(0.07, 0.86, 0), Vector3(0.05, 0.2, 0.08), Color(0.35, 0.38, 0.45), false)
	var tip := LevelKit.sphere(_arm_fore, Vector3(0, 0.8, 0), 0.06, C_CYAN, Vector3.ONE, 8)
	tip.material_override = LevelKit.mat(C_CYAN, 3.0, 0.3)
	_arm_upper.rotation.z = -0.55
	_arm_fore.rotation.z = -1.1
	HubBuilder.sign_board(st, Vector3(0, 3.7, -1.1), "回復", "Recover", C_CYAN)
	HubBuilder.holo_panel(st, Vector3(1.65, 1.35, -1.1), Vector2(0.55, 0.42), C_CYAN)
	HubBuilder.holo_panel(st, Vector3(-0.55, 1.2, -1.1), Vector2(0.42, 0.32), Color(0.5, 1.0, 0.7))
	Interactable.create(st, Vector3(0.35, 0, 1.35), "修理台で回復する", _use_recover, 2.4, 1.9)
	# 整備ボット（修理台のそばで浮かぶ）
	_bot = Npc.create(self, "helper_bot", st.to_global(Vector3(2.15, 0.55, 0.5)), rad_to_deg(st.rotation.y))
	_bot.set_talk("整備ボットと話す", _talk_bot, 1.8)


func _use_recover() -> void:
	if player:
		player.heal_full()
	Sfx.play("heal")
	Hud.toast("HPが全回復した", "good")
	_heal_anim = 1.4
	if player:
		_heal_burst(player.global_position)
	Hud.bark("整備ボット", "ピコッ。修理完了です！", 2.4)


func _heal_burst(pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = 36
	p.lifetime = 1.3
	p.explosiveness = 0.25
	var m := SphereMesh.new()
	m.radius = 0.06
	m.height = 0.12
	m.radial_segments = 6
	m.rings = 3
	p.mesh = m
	p.material_override = LevelKit.mat(Color(0.5, 1.0, 0.75), 3.0, 0.3)
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	p.emission_ring_axis = Vector3.UP
	p.emission_ring_radius = 0.75
	p.emission_ring_inner_radius = 0.5
	p.emission_ring_height = 0.1
	p.direction = Vector3.UP
	p.spread = 12.0
	p.gravity = Vector3(0, 0.6, 0)
	p.initial_velocity_min = 1.0
	p.initial_velocity_max = 2.2
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.3
	add_child(p)
	p.global_position = pos + Vector3(0, 0.2, 0)
	p.emitting = true
	get_tree().create_timer(2.0).timeout.connect(p.queue_free)


func _animate_arm(delta: float) -> void:
	if _arm_base == null:
		return
	_heal_anim = maxf(0.0, _heal_anim - delta)
	if _heal_anim > 0.0:
		# 修理中：ベッドの上を素早く行き来する
		_arm_base.rotation.y = sin(_t * 7.0) * 0.45
		_arm_fore.rotation.z = lerpf(_arm_fore.rotation.z, -1.35 + sin(_t * 10.0) * 0.15, 1.0 - exp(-10.0 * delta))
	else:
		_arm_base.rotation.y = sin(_t * 0.6) * 0.35
		_arm_upper.rotation.z = -0.55 + sin(_t * 0.9) * 0.08
		_arm_fore.rotation.z = lerpf(_arm_fore.rotation.z, -1.1 + sin(_t * 1.3) * 0.12, 1.0 - exp(-4.0 * delta))


func _talk_bot() -> void:
	Sfx.play("talk", 1.4)
	if _bot:
		_bot.emote("！", 1.0)
	Hud.bark("整備ボット", BOT_LINES[_bot_line % BOT_LINES.size()], 3.2)
	_bot_line += 1


# ---------------------------------------------------------------- 装備ラック

func _build_equip(theta: float, r: float) -> void:
	var st := HubBuilder.station_root(self, theta, r, "Equip")
	var wood := Color(0.64, 0.47, 0.33)
	var light := Color(0.9, 0.87, 0.82)
	LevelKit.box(st, Vector3(0, 1.5, -0.6), Vector3(3.5, 3.0, 0.15), wood, false)
	HubBuilder.solid(st, Vector3(0, 1.5, -0.35), Vector3(3.6, 3.0, 0.75))
	for sx in [-1.0, 1.0]:
		LevelKit.box(st, Vector3(1.68 * sx, 1.5, -0.3), Vector3(0.15, 3.0, 0.62), light, false)
	LevelKit.box(st, Vector3(0, 0.15, -0.3), Vector3(3.4, 0.3, 0.62), light, false)
	for y in [1.05, 1.95, 2.9]:
		LevelKit.box(st, Vector3(0, y, -0.3), Vector3(3.3, 0.08, 0.6), light, false)
		var edge := LevelKit.box(st, Vector3(0, y - 0.02, 0.0), Vector3(3.3, 0.03, 0.03), C_GOLD, false)
		(edge as MeshInstance3D).material_override = LevelKit.mat(C_GOLD, 1.6, 0.4)
	# 上段：ヘルメットや靴の飾り（そうびの雰囲気）
	var deco := [[Color(1.0, 0.8, 0.25), -1.1], [Color(0.95, 0.35, 0.3), -0.35], [Color(0.4, 0.55, 0.95), 0.4]]
	for d in deco:
		var helm := LevelKit.sphere(st, Vector3(d[1], 2.17, -0.3), 0.22, d[0], Vector3(1.0, 0.85, 1.0), 12)
		helm.material_override = LevelKit.mat(d[0], 0.0, 0.3, 0.2)
		var visor := LevelKit.sphere(st, Vector3(d[1], 2.17, -0.12), 0.12, Color(0.15, 0.2, 0.3), Vector3(1.3, 0.6, 0.6), 8)
		visor.material_override = LevelKit.mat(Color(0.3, 0.8, 1.0), 1.0, 0.2)
	for bx in [1.1, 1.42]:
		LevelKit.box(st, Vector3(bx, 2.08, -0.25), Vector3(0.28, 0.18, 0.4), Color(0.4, 0.8, 1.0), false)
	# 下段：部品の箱
	for i in 3:
		LevelKit.box(st, Vector3(-1.0 + i * 1.0, 0.5, -0.3), Vector3(0.7, 0.42, 0.45), [Color(0.55, 0.7, 0.85), Color(0.85, 0.6, 0.4), Color(0.6, 0.8, 0.6)][i], false)
	# 中段：2つのクロー
	var claws := [
		["claw_standard", -0.75, C_CYAN, 0.5, "標準クロー\n距離 5m・ひるみ長め"],
		["claw_long", 0.7, Color(1.0, 0.62, 0.3), 0.85, "ロングクロー\n距離 7.5m・ひるみ短め"],
	]
	for c in claws:
		var x: float = c[1]
		var pad := LevelKit.box(st, Vector3(x, 1.11, -0.25), Vector3(1.3, 0.04, 0.48), C_GOLD, false)
		(pad as MeshInstance3D).material_override = LevelKit.mat(C_GOLD, 2.2, 0.4)
		pad.add_to_group("dynamic")
		_rack_pads[c[0]] = pad
		var m := HubBuilder.claw_model(st, Vector3(x, 1.45, -0.22), c[2], c[3])
		m.rotation_degrees = Vector3(0, 0, 12)
		_rack_claws[c[0]] = m
		var tag := LevelKit.label(st, c[4], Vector3(x, 0.86, 0.04), 30, Color.WHITE, false, Vector3.ZERO, Color(0.05, 0.08, 0.18, 0.9))
		tag.pixel_size = 0.0055
	_equipped_label = LevelKit.label(st, "装備中", Vector3(0, 1.82, -0.1), 40, Color(1.0, 0.85, 0.3), false, Vector3.ZERO, Color(0.1, 0.06, 0.0, 0.9))
	_equipped_label.pixel_size = 0.006
	HubBuilder.sign_board(st, Vector3(0, 3.75, -0.55), "そうび", "Equip", C_GOLD)
	Interactable.create(st, Vector3(0, 0, 1.3), "装備ラックを使う", _use_equip, 2.4, 1.9)
	_update_rack()


func _update_rack() -> void:
	var cur := TimelineState.equipment
	for id in _rack_pads:
		(_rack_pads[id] as Node3D).visible = id == cur
	var m: Node3D = _rack_claws.get(cur)
	if m and _equipped_label:
		_equipped_label.position = Vector3(m.position.x, 1.82, -0.1)


func _use_equip() -> void:
	var cur := TimelineState.equipment
	var body := "[center]現在の装備：[color=#ffd040][b]%s[/b][/color][/center]\n\n" % CLAW_NAMES.get(cur, cur)
	body += "[color=#5fd8ff][b]標準クロー[/b][/color]　距離 5m ／ ひるませ時間 長め ／ 重い物も安定\n"
	body += "[color=#ffa850][b]ロングクロー[/b][/color]　距離 7.5m ／ ひるませ時間 短め\n\n"
	body += "[color=#a8bcd8]装備できるクローは1つ。得意なことが違うので、場面に合わせて選ぼう。[/color]"
	var opts := [
		"標準クローを装備する" + ("（装備中）" if cur == "claw_standard" else ""),
		"ロングクローを装備する" + ("（装備中）" if cur == "claw_long" else ""),
		"やめる",
	]
	var idx: int = await Hud.choose("装備ラック", body, opts)
	var want := ""
	match idx:
		0:
			want = "claw_standard"
		1:
			want = "claw_long"
	if want == "":
		return
	if want == cur:
		Hud.toast("%sを装備しています" % CLAW_NAMES[want], "info", 2.0)
		return
	TimelineState.set_flag("equipment", want)
	Sfx.play("gear_place")
	Hud.toast("%sを装備した" % CLAW_NAMES[want], "good")
	_update_rack()
	checkpoint("hub_start")


# ---------------------------------------------------------------- 記録盤

func _records() -> Array:
	var t := TimelineState
	return [
		{"year": "1726", "era": "江戸", "title": "源兵衛の水門絵図", "open": t.genbei_drawing_found, "color": C_1726,
			"text": "歯止めで大歯車を止め、人が通り過ぎてから離す仕組み。おはるの写しが町の記録に残った。"},
		{"year": "2026", "era": "現代", "title": "マツイの構想メモ：保持と解除の安全機構", "open": t.drawing_confirmed, "color": C_2026,
			"text": "『つかむ力より、安全に離す仕組みを』。300年前の絵図から生まれた、NMクローの設計方針。"},
		{"year": "2086", "era": "未来", "title": "保守路の記録", "open": t.met_sora, "color": C_2086,
			"text": "閉鎖されていた保守路に空中回廊が開通。受けつがれた安全機構で、人の通れる道が残された。"},
	]


func _build_records(theta: float, r: float) -> void:
	var st := HubBuilder.station_root(self, theta, r, "Records")
	LevelKit.box(st, Vector3(0, 1.55, -0.95), Vector3(3.7, 3.1, 0.15), Color(0.9, 0.88, 0.92))
	LevelKit.box(st, Vector3(0, 0.45, -0.3), Vector3(3.0, 0.9, 0.9), Color(0.3, 0.33, 0.46))
	var strip := LevelKit.box(st, Vector3(0, 0.88, 0.16), Vector3(3.02, 0.04, 0.05), C_PURPLE, false)
	(strip as MeshInstance3D).material_override = LevelKit.mat(C_PURPLE, 2.2, 0.4)
	var keys := LevelKit.box(st, Vector3(0, 0.92, -0.2), Vector3(1.3, 0.04, 0.35), Color(0.6, 0.5, 1.0), false)
	(keys as MeshInstance3D).material_override = LevelKit.mat(Color(0.6, 0.5, 1.0), 0.8, 0.4)
	var recs := _records()
	for i in 3:
		var rec: Dictionary = recs[i]
		var x := -1.15 + i * 1.15
		var tint: Color = rec.color
		HubBuilder.holo_panel(st, Vector3(x, 1.85, -0.6), Vector2(1.0, 0.72), tint, [12.0, 0.0, -12.0][i])
		var yl := LevelKit.label(st, rec.year, Vector3(x, 2.02, -0.55), 56, tint.lightened(0.4), false, Vector3(0, [12.0, 0.0, -12.0][i], 0), Color(0.02, 0.04, 0.12, 0.9))
		yl.pixel_size = 0.0055
		var tl := LevelKit.label(st, _short_title(rec) if rec.open else "？？？", Vector3(x, 1.72, -0.55), 30, Color.WHITE if rec.open else Color(0.6, 0.65, 0.8), false, Vector3(0, [12.0, 0.0, -12.0][i], 0), Color(0.02, 0.04, 0.12, 0.9))
		tl.pixel_size = 0.0055
	# 本の山とスタンドの灯り
	var book_cols := [Color(0.85, 0.3, 0.3), Color(0.3, 0.5, 0.85), Color(0.95, 0.8, 0.3), Color(0.4, 0.7, 0.45)]
	for i in 5:
		var b := LevelKit.box(st, Vector3(1.85, 0.08 + i * 0.13, 0.25), Vector3(0.55 - (i % 2) * 0.08, 0.12, 0.4), book_cols[i % 4], false)
		b.rotation_degrees.y = i * 9.0
	LevelKit.cyl(st, Vector3(-1.9, 0.75, 0.0), 0.04, 1.5, Color(0.3, 0.28, 0.26))
	var lamp := LevelKit.sphere(st, Vector3(-1.9, 1.55, 0.0), 0.2, Color(1.0, 0.85, 0.55), Vector3.ONE, 10)
	lamp.material_override = LevelKit.mat(Color(1.0, 0.85, 0.55), 2.5, 0.4)
	HubBuilder.sign_board(st, Vector3(0, 3.55, -0.85), "記録", "Research", C_PURPLE)
	Interactable.create(st, Vector3(0, 0, 1.25), "記録盤を見る", _use_records, 2.4, 1.9)


func _short_title(rec: Dictionary) -> String:
	match str(rec.year):
		"1726":
			return "水門絵図"
		"2026":
			return "構想メモ"
	return "保守路の記録"


func _use_records() -> void:
	Sfx.play("click")
	var recs := _records()
	var all_open := true
	var bb := "[table=3]"
	for rec in recs:
		var c: Color = rec.color
		var open: bool = rec.open
		all_open = all_open and open
		bb += "[cell expand=1 bg=#0c1630 border=#%s padding=12,10,12,10]" % c.darkened(0.2).to_html(false)
		bb += "[center][font_size=30][color=#%s]%s[/color][/font_size]  [color=#%s]%s[/color][/center]\n" % [
				c.lightened(0.25).to_html(false), rec.year, c.lightened(0.5).to_html(false), rec.era]
		if open:
			bb += "[center][b]「%s」[/b][/center]\n[font_size=16]%s[/font_size]" % [rec.title, rec.text]
		else:
			bb += "[center][b][color=#8a96b8]？？？[/color][/b][/center]\n[font_size=16][color=#8a96b8]%s[/color][/font_size]" % \
					("未確認" if rec.year == "2086" else "まだ記録が見つかっていない。")
		bb += "[/cell]"
	bb += "[/table]\n"
	if all_open:
		bb += "\n[center][color=#ffd040][b]源兵衛の絵図 → おはるの写し → マツイの安全機構 → 2086年の保守路[/b][/color][/center]"
		bb += "\n[center][color=#a8bcd8]過去の工夫が、時代をこえて未来の道を開いた。[/color][/center]"
	else:
		bb += "\n[center][color=#a8bcd8]まだつながりの見えない記録がある……。時代をめぐって手がかりを集めよう。[/color][/center]"
	await Hud.show_panel("記録盤 ― 三つの時代の記録", bb, ["閉じる"])


# ---------------------------------------------------------------- 実験台（準備中）

func _build_lab(theta: float, r: float) -> void:
	var st := HubBuilder.station_root(self, theta, r, "Lab")
	LevelKit.box(st, Vector3(0, 0.42, -0.25), Vector3(2.5, 0.84, 1.1), Color(0.72, 0.73, 0.77))
	var cloth := LevelKit.sphere(st, Vector3(0, 1.15, -0.25), 0.6, Color(0.66, 0.72, 0.84), Vector3(1.45, 0.7, 1.0), 12)
	cloth.material_override = LevelKit.mat(Color(0.66, 0.72, 0.84), 0.0, 0.95)
	# 立入禁止のしま模様の柵
	for sx in [-1.45, 1.45]:
		LevelKit.cyl(st, Vector3(sx, 0.45, 0.85), 0.06, 0.9, Color(0.3, 0.3, 0.32))
	for i in 7:
		var c := Color(1.0, 0.8, 0.15) if i % 2 == 0 else Color(0.12, 0.12, 0.14)
		LevelKit.box(st, Vector3(-1.24 + i * 0.413, 0.82, 0.85), Vector3(0.413, 0.14, 0.06), c, false)
	for sx in [-1.2, 1.2]:
		LevelKit.cyl(st, Vector3(sx, 1.25, -0.95), 0.05, 2.5, Color(0.5, 0.52, 0.58))
	HubBuilder.sign_board(st, Vector3(0, 2.75, -0.95), "実験台（準備中）", "Coming soon", Color(0.6, 0.66, 0.78), 3.4)
	Interactable.create(st, Vector3(0, 0, 1.6), "実験台を調べる", _use_lab, 2.3, 1.9)


func _use_lab() -> void:
	Sfx.play("click", 0.8)
	Hud.toast("準備中（後続の試作で追加）", "info", 2.4)


# ---------------------------------------------------------------- 扉

func _build_gate(theta: float, active: bool, color: Color, title: String, sub: String, prompt: String, cb: Callable, node_name: String) -> Node3D:
	var g := HubBuilder.station_root(self, theta, 8.7, node_name)
	LevelKit.cyl(g, Vector3(0, 0.05, 0), 2.0, 0.1, Color(0.9, 0.9, 0.93), false, Vector3.ZERO, 24)
	HubBuilder.torus(g, Vector3(0, 0.11, 0), 1.85, 0.04, LevelKit.mat(color, 2.0, 0.4), Vector3.ZERO, 40, 4)
	var frame_mat := LevelKit.mat(Color(0.93, 0.93, 0.96), 0.0, 0.35, 0.35)
	HubBuilder.torus(g, Vector3(0, 2.15, 0), 1.8, 0.15, frame_mat, Vector3(90, 0, 0), 48, 10)
	HubBuilder.torus(g, Vector3(0, 2.15, 0.12), 1.8, 0.035, LevelKit.mat(color, 2.4 if active else 0.3, 0.4), Vector3(90, 0, 0), 48, 4)
	for sx in [-1.0, 1.0]:
		LevelKit.box(g, Vector3(1.3 * sx, 0.55, 0), Vector3(0.34, 1.0, 0.46), Color(0.85, 0.85, 0.9))
	var label_col := color.lightened(0.45)
	if active:
		Portal.create(g, Vector3(0, 2.15, 0), color, 1.6, false, 0.0)
	else:
		var disc := LevelKit.cyl(g, Vector3(0, 2.15, 0), 1.66, 0.04, Color(0.1, 0.12, 0.2), false, Vector3(90, 0, 0), 32)
		(disc as MeshInstance3D).material_override = LevelKit.mat(Color(0.12, 0.13, 0.22), 0.0, 0.8)
		var q := LevelKit.label(g, "？", Vector3(0, 2.15, 0.05), 180, Color(0.55, 0.6, 0.75))
		q.pixel_size = 0.008
		sub = "座標が未復元"
		label_col = Color(1.0, 0.65, 0.45)
	var tl := LevelKit.label(g, title, Vector3(0, 4.5, 0), 64, Color.WHITE, false, Vector3.ZERO, color.darkened(0.6))
	tl.pixel_size = 0.0075
	var sl := LevelKit.label(g, sub, Vector3(0, 4.05, 0), 44, label_col, false, Vector3.ZERO, Color(0.03, 0.05, 0.14, 0.9))
	sl.pixel_size = 0.0065
	Interactable.create(g, Vector3(0, 0, 2.2), prompt if active else "座標が未復元（調べる）", cb, 2.3, 1.7)
	var tgt := Node3D.new()
	tgt.name = "MarkerTarget"
	tgt.position = Vector3(0, 2.4, 0)
	g.add_child(tgt)
	return tgt


func _use_future_gate() -> void:
	if not TimelineState.drawing_confirmed:
		Sfx.play("misfire", 0.8)
		Hud.toast("座標が未復元", "bad", 2.2)
		Hud.hint("未来の座標はまだ戻っていない。2026年で記録を確かめよう", 4.0)
		return
	TimeTravel.travel_to(TimelineState.ERA_FUTURE, "future_return")


func _use_present_gate() -> void:
	TimeTravel.travel_to(TimelineState.ERA_PRESENT, "present_portal")


# ---------------------------------------------------------------- 居心地のよい小物

func _build_decor() -> void:
	# ソファとローテーブル（南東寄り）
	var so := HubBuilder.station_root(self, 162.0, 9.3, "Sofa")
	var cream := Color(0.97, 0.93, 0.86)
	var orange := Color(0.95, 0.55, 0.3)
	LevelKit.box(so, Vector3(0, 0.25, 0), Vector3(2.6, 0.5, 0.95), cream)
	LevelKit.box(so, Vector3(0, 0.7, -0.38), Vector3(2.6, 0.75, 0.25), orange, false)
	for sx in [-1.0, 1.0]:
		LevelKit.box(so, Vector3(1.38 * sx, 0.45, 0), Vector3(0.22, 0.6, 0.95), orange, false)
	for sx in [-0.6, 0.6]:
		LevelKit.sphere(so, Vector3(sx, 0.62, -0.15), 0.26, Color(1.0, 0.98, 0.95), Vector3(1.2, 0.8, 0.6), 10)
	LevelKit.cyl(so, Vector3(0, 0.42, 1.15), 0.5, 0.06, Color(0.75, 0.55, 0.38), false, Vector3.ZERO, 16)
	LevelKit.cyl(so, Vector3(0, 0.2, 1.15), 0.08, 0.4, Color(0.6, 0.45, 0.32))
	LevelKit.cyl(so, Vector3(0.15, 0.5, 1.1), 0.07, 0.12, Color(1.0, 1.0, 1.0))
	# 鉢植えとフロアランプ
	for th in [-48.0, 48.0, -102.0, 102.0, 148.0, -160.0, 176.0]:
		HubBuilder.plant(self, HubBuilder.polar(th, 10.2), 0.9 + absf(sin(th)) * 0.25)
	for th in [-145.0, 120.0]:
		var p := HubBuilder.polar(th, 9.9)
		LevelKit.cyl(self, p + Vector3(0, 0.9, 0), 0.05, 1.8, Color(0.3, 0.28, 0.26))
		var shade := LevelKit.cone(self, p + Vector3(0, 1.95, 0), 0.32, 0.35, Color(1.0, 0.85, 0.6), 10)
		shade.material_override = LevelKit.mat(Color(1.0, 0.85, 0.6), 1.8, 0.5)
	# 北の柱に大きな時計の紋（時の工房らしさ）
	var clock := Node3D.new()
	clock.position = HubBuilder.polar(0.0, R - 0.6, 4.8)
	add_child(clock)
	var face := LevelKit.cyl(clock, Vector3.ZERO, 0.85, 0.08, Color(0.97, 0.95, 0.9), false, Vector3(90, 0, 0), 24)
	face.position.z = 0.0
	HubBuilder.torus(clock, Vector3(0, 0, 0.05), 0.85, 0.05, LevelKit.mat(C_GOLD, 1.6, 0.4), Vector3(90, 0, 0), 32, 4)
	var hand := SkyProps.motion(clock, Vector3(0, 0, 0.07))
	hand.spin = Vector3(0, 0, -0.5)
	LevelKit.box(hand, Vector3(0, 0.3, 0), Vector3(0.06, 0.6, 0.02), Color(0.15, 0.3, 0.6), false)
	var hand2 := SkyProps.motion(clock, Vector3(0, 0, 0.08))
	hand2.spin = Vector3(0, 0, -0.06)
	LevelKit.box(hand2, Vector3(0, 0.2, 0), Vector3(0.08, 0.4, 0.02), Color(0.15, 0.3, 0.6), false)


# ---------------------------------------------------------------- 外の空

func _build_sky() -> void:
	SkyProps.islands(self, 41, 10, 22.0, 44.0, -9.0, 7.0, 1.8, 4.5, 0.0, TAU, false)
	SkyProps.islands(self, 52, 8, 55.0, 95.0, -4.0, 20.0, 4.0, 8.0, 0.0, TAU, false)
	SkyProps.clouds(self, 13, 22, 26.0, 90.0, -24.0, -12.0, 4.0, 8.0)
	SkyProps.clouds(self, 14, 20, 100.0, 170.0, -10.0, 18.0, 5.0, 10.0)
	SkyProps.future_city(self, HubBuilder.polar(38.0, 135.0, -4.0), 24.0, 23)
	var rift := SkyProps.rift(self, HubBuilder.polar(-35.0, 160.0, 30.0), 40.0, Color(1.0, 0.7, 0.35), Color(0.6, 0.45, 1.0), 0.45)
	rift.name = "DistantRift"
