extends Node3D
## 2086年冒頭の追走路（仕様 §9「路面が閉じる未来の危機」/ §9.1「まず道が消えかける様子を見せる」）。
## 幅4m・長さ2mの床タイルを X 方向に並べる。閉鎖の前線（橙のホログラム壁）が進むと、
## 触れたタイルが橙に点滅（約0.6秒）してから沈んで消える。前線は安全な足場（x = X_END）で止まる。
## 途中にジャンプで越える切れ目と、ダッシュのタイミングを教える周期式ホログラムシャッターがある。

const Decor := preload("res://scripts/eras/future/future_decor.gd")

const TOP_Y := 4.0
const Z_MIN := 6.0
const Z_MAX := 10.0
const X_START := -34.0
const X_END := 4.0
const GAP_FROM := -18.0
const GAP_TO := -16.0          # 幅2m：短く押したジャンプ（約2.7m）でも越えられる
const SHUTTER_X := -6.0
const WARN_TIME := 0.6
const FRONT_SPEED := 4.2
const CATCHUP_SPEED := 5.2     # 大きく離された時だけ少し速める（緊張感を保つ）
const CATCHUP_GAP := 16.0
const SHUTTER_OPEN := 2.2
const SHUTTER_WARN := 0.5
const SHUTTER_CLOSED := 1.3

enum TileState { SOLID, WARN, GONE }
enum Shutter { OPEN, WARN, CLOSED }

var closing := false
var front_x := -999.0
var shutter_state := Shutter.OPEN

var _tiles: Array[Dictionary] = []
var _front: Node3D
var _front_fade := 0.0
var _shutter_t := 0.0
var _shutter_panel: MeshInstance3D
var _shutter_shape: CollisionShape3D
var _shutter_label: Label3D
var _shutter_floor: MeshInstance3D
var _t := 0.0

var _m_floor_a: Material
var _m_floor_b: Material
var _m_warn_hi: Material
var _m_warn_lo: Material


func build() -> void:
	_m_floor_a = LevelKit.mat(Color(0.82, 0.77, 0.7))
	_m_floor_b = LevelKit.mat(Color(0.73, 0.68, 0.62))
	_m_warn_hi = LevelKit.glow(Color(1.0, 0.45, 0.1), 2.6)
	_m_warn_lo = LevelKit.mat(Color(0.75, 0.35, 0.15), 0.5)
	var ranges: Array[Vector2] = []
	var x := X_START
	while x < GAP_FROM - 0.01:
		ranges.append(Vector2(x, minf(x + 2.0, GAP_FROM)))
		x += 2.0
	x = GAP_TO
	while x < X_END - 0.01:
		ranges.append(Vector2(x, minf(x + 2.0, X_END)))
		x += 2.0
	for i in ranges.size():
		_tiles.append(_make_tile(ranges[i], i))
	_build_rails()
	_build_start_gate()
	_build_shutter()
	_build_front()
	_build_supports()


func _make_tile(r: Vector2, index: int) -> Dictionary:
	var w := r.y - r.x
	var zc := (Z_MIN + Z_MAX) * 0.5
	var depth := Z_MAX - Z_MIN
	var body := StaticBody3D.new()
	body.collision_layer = LevelKit.LAYER_WORLD
	body.collision_mask = 0
	body.position = Vector3((r.x + r.y) * 0.5, TOP_Y - 0.25, zc)
	body.set_meta("no_merge", true)
	body.add_to_group("dynamic")
	add_child(body)
	var shapes: Array[CollisionShape3D] = []
	shapes.append(_shape(body, Vector3.ZERO, Vector3(w, 0.5, depth - 0.3)))
	var base_mat := _m_floor_a if index % 2 == 0 else _m_floor_b
	var floor_bm := BoxMesh.new()
	floor_bm.size = Vector3(w - 0.04, 0.5, depth - 0.3)
	var floor_mi := LevelKit.mesh(body, floor_bm, Vector3.ZERO, base_mat)
	return {
		"body": body, "x0": r.x, "x1": r.y, "state": TileState.SOLID, "t": 0.0,
		"floor": floor_mi, "mat": base_mat, "shapes": shapes,
		"home": body.position, "tween": null,
	}


## 欄干は支柱側の構造として残す（床板だけが沈む）。動かないのでまとめて描画できる。
func _build_rails() -> void:
	for seg in [Vector2(X_START, GAP_FROM), Vector2(GAP_TO, X_END)]:
		for z in [Z_MIN + 0.1, Z_MAX - 0.1]:
			Decor.railing(self, Vector3(seg.x, TOP_Y, z), Vector3(seg.y, TOP_Y, z), Decor.C_AMBER)
	# 切れ目の両端の柵の端（ここから跳ぶ）
	for x in [GAP_FROM, GAP_TO]:
		for z in [Z_MIN + 0.1, Z_MAX - 0.1]:
			LevelKit.box(self, Vector3(x, TOP_Y + 0.55, z), Vector3(0.22, 1.1, 0.22), Decor.C_STEEL, false)
	# 床板の下の受け梁（床が沈むと骨組みだけが残る）
	for seg in [Vector2(X_START, GAP_FROM), Vector2(GAP_TO, X_END)]:
		for z in [Z_MIN + 0.1, Z_MAX - 0.1]:
			LevelKit.box(self, Vector3((seg.x + seg.y) * 0.5, TOP_Y - 0.35, z), Vector3(seg.y - seg.x, 0.3, 0.3), Decor.C_STEEL, false)


func _shape(body: Node3D, pos: Vector3, size: Vector3) -> CollisionShape3D:
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	cs.position = pos
	body.add_child(cs)
	return cs


## 出発点の後ろ：閉じたルートの門（振り返ると「閉鎖」が見える）。
func _build_start_gate() -> void:
	var g := Node3D.new()
	g.position = Vector3(X_START - 0.3, TOP_Y, (Z_MIN + Z_MAX) * 0.5)
	add_child(g)
	for sz in [-1.0, 1.0]:
		LevelKit.box(g, Vector3(0, 1.8, sz * 2.45), Vector3(0.5, 3.6, 0.5), Decor.C_WHITE, false)
	LevelKit.box(g, Vector3(0, 3.75, 0), Vector3(0.6, 0.5, 5.4), Decor.C_WHITE, false)
	Decor.glow_box(g, Vector3(0.32, 3.75, 0), Vector3(0.05, 0.2, 4.6), Color(1.0, 0.3, 0.15), 2.4)
	Decor.quad(g, Vector3(0, 1.75, 0), Vector2(4.4, 3.3), Decor.holo_mat(Color(1.0, 0.32, 0.12), 6.0, 0.6), Vector3(0, 90, 0))
	LevelKit.label(g, "ROUTE：閉鎖", Vector3(0.1, 2.0, 0), 64, Color(1.0, 0.92, 0.85), false, Vector3(0, 90, 0), Color(0.5, 0.05, 0.0, 0.9))
	LevelKit.wall(g, Vector3(0, 2.0, 0), Vector3(0.6, 4.0, 5.0))


func _build_shutter() -> void:
	var zc := (Z_MIN + Z_MAX) * 0.5
	var g := Node3D.new()
	g.position = Vector3(SHUTTER_X, 0, zc)
	add_child(g)
	# 下の街から伸びる支柱と上の梁（タイルが沈んでも残る構造）
	for sz in [-1.0, 1.0]:
		LevelKit.box(g, Vector3(0, 2.5, sz * 2.45), Vector3(0.4, 11.0, 0.4), Decor.C_WHITE, false)
		Decor.glow_box(g, Vector3(0, TOP_Y + 1.7, sz * 2.24), Vector3(0.2, 3.2, 0.05), Decor.C_CYAN, 1.8)
	LevelKit.box(g, Vector3(0, TOP_Y + 3.75, 0), Vector3(0.6, 0.55, 5.4), Decor.C_WHITE, false)
	_shutter_panel = Decor.quad(g, Vector3(0, TOP_Y + 1.75, 0), Vector2(4.5, 3.4), Decor.holo_mat(Color(1.0, 0.25, 0.12), 7.0, 1.2), Vector3(0, 90, 0))
	_shutter_panel.set_meta("no_merge", true)
	_shutter_label = LevelKit.label(g, "通行可", Vector3(-0.32, TOP_Y + 3.75, 0), 40, Decor.C_CYAN, false, Vector3(0, -90, 0), Color(0, 0, 0, 0.7))
	var body := StaticBody3D.new()
	body.collision_layer = LevelKit.LAYER_BOUNDS   # プレイヤーは止めるが、後ろのカメラは押し込まない
	body.collision_mask = 0
	body.position = Vector3(0, TOP_Y + 1.8, 0)
	g.add_child(body)
	_shutter_shape = _shape(body, Vector3.ZERO, Vector3(0.4, 3.6, 4.6))
	_shutter_shape.disabled = true
	# 足元の表示（シャッターの下のタイルと一緒に沈む）
	for t in _tiles:
		if SHUTTER_X >= t.x0 and SHUTTER_X < t.x1:
			var bm := BoxMesh.new()
			bm.size = Vector3(0.45, 0.04, 3.7)
			_shutter_floor = LevelKit.mesh(t.body, bm, Vector3(SHUTTER_X - (t.body as Node3D).position.x, 0.27, 0), LevelKit.glow(Decor.C_CYAN, 2.0))
			_shutter_floor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_set_shutter(Shutter.OPEN)


func _build_front() -> void:
	_front = Node3D.new()
	_front.position = Vector3(front_x, TOP_Y, (Z_MIN + Z_MAX) * 0.5)
	_front.set_meta("no_merge", true)
	add_child(_front)
	Decor.quad(_front, Vector3(0, 1.8, 0), Vector2(5.0, 3.6), Decor.holo_mat(Color(1.0, 0.42, 0.1), 5.0, 2.0), Vector3(0, 90, 0))
	Decor.glow_box(_front, Vector3(0, 3.65, 0), Vector3(0.12, 0.12, 5.0), Color(1.0, 0.55, 0.2), 3.0)
	Decor.glow_box(_front, Vector3(0, 0.05, 0), Vector3(0.25, 0.08, 5.0), Color(1.0, 0.55, 0.2), 3.0)
	LevelKit.label(_front, "ROUTE：閉鎖中", Vector3(0.08, 2.2, 0), 56, Color(1.0, 0.93, 0.85), false, Vector3(0, 90, 0), Color(0.55, 0.12, 0.0, 0.9))
	LevelKit.label(_front, "退避してください", Vector3(0.08, 1.45, 0), 34, Color(1.0, 0.85, 0.7), false, Vector3(0, 90, 0), Color(0.55, 0.12, 0.0, 0.9))
	_front.visible = false


## 追走路を下から支える柱（装飾）。
func _build_supports() -> void:
	var zc := (Z_MIN + Z_MAX) * 0.5
	var x := X_START + 4.0
	while x < X_END:
		if x < GAP_FROM - 0.5 or x > GAP_TO + 0.5:
			LevelKit.box(self, Vector3(x, -1.0, zc), Vector3(0.9, 9.0, 1.4), Decor.C_STEEL, false)
			LevelKit.box(self, Vector3(x, TOP_Y - 0.85, zc), Vector3(1.0, 0.7, 4.2), Decor.C_STEEL.darkened(0.15), false)
		x += 8.0


# ================================================================ 進行

func start_closure(from_x: float) -> void:
	front_x = from_x
	closing = true
	_front_fade = 0.0
	_front.visible = true
	_front.scale = Vector3.ONE
	_front.position.x = front_x


func stop_closure() -> void:
	closing = false
	_front_fade = 1.2


## タイルを元に戻す（落下して最初からやり直す時）。
func reset() -> void:
	closing = false
	front_x = -999.0
	_front.visible = false
	for t in _tiles:
		var tw: Tween = t.tween
		if tw and tw.is_valid():
			tw.kill()
		t.tween = null
		t.state = TileState.SOLID
		t.t = 0.0
		var body: Node3D = t.body
		body.position = t.home
		body.rotation = Vector3.ZERO
		body.visible = true
		(t.floor as MeshInstance3D).material_override = t.mat
		for cs in t.shapes:
			(cs as CollisionShape3D).set_deferred("disabled", false)


## その位置が「まだ残る床」か（落下復帰の安全地点の判定に使う）。
func is_safe_at(pos: Vector3) -> bool:
	if pos.x < X_START - 0.5 or pos.x > X_END or pos.z < Z_MIN - 0.5 or pos.z > Z_MAX + 0.5:
		return true
	for t in _tiles:
		if pos.x >= t.x0 - 0.2 and pos.x <= t.x1 + 0.2:
			return t.state == TileState.SOLID and (not closing or t.x0 > front_x + 2.0)
	return false


func tiles_gone() -> int:
	var n := 0
	for t in _tiles:
		if t.state != TileState.SOLID:
			n += 1
	return n


func _process(delta: float) -> void:
	_t += delta
	_update_shutter(delta)
	if closing:
		var spd := FRONT_SPEED
		var p := Game.player as Node3D
		if p and p.global_position.x - front_x > CATCHUP_GAP:
			spd = CATCHUP_SPEED
		front_x = minf(front_x + spd * delta, X_END)
		_front.position.x = front_x
		if front_x >= X_END:
			stop_closure()
	elif _front_fade > 0.0:
		_front_fade -= delta
		_front.scale = Vector3(1.0, maxf(0.01, _front_fade / 1.2), 1.0)
		if _front_fade <= 0.0:
			_front.visible = false
	for t in _tiles:
		match t.state:
			TileState.SOLID:
				if front_x >= float(t.x0) + 0.3 and (closing or _front_fade > 0.0):
					t.state = TileState.WARN
					t.t = 0.0
					Sfx.play("click", 0.6, -10.0)
			TileState.WARN:
				t.t += delta
				var hi := fmod(t.t, 0.16) < 0.08
				(t.floor as MeshInstance3D).material_override = _m_warn_hi if hi else _m_warn_lo
				if t.t >= WARN_TIME:
					_sink(t)


func _sink(t: Dictionary) -> void:
	t.state = TileState.GONE
	for cs in t.shapes:
		(cs as CollisionShape3D).set_deferred("disabled", true)
	(t.floor as MeshInstance3D).material_override = _m_warn_lo
	var body: Node3D = t.body
	var tw := create_tween().set_parallel(true)
	tw.tween_property(body, "position:y", body.position.y - 7.0, 1.0).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_property(body, "rotation:z", randf_range(-0.25, 0.25), 1.0)
	tw.chain().tween_callback(func() -> void: body.visible = false)
	t.tween = tw


# ================================================================ シャッター

func _update_shutter(delta: float) -> void:
	_shutter_t += delta
	var cycle := SHUTTER_OPEN + SHUTTER_WARN + SHUTTER_CLOSED
	if _shutter_t >= cycle:
		_shutter_t -= cycle
	var want := Shutter.OPEN
	if _shutter_t >= SHUTTER_OPEN + SHUTTER_WARN:
		want = Shutter.CLOSED
	elif _shutter_t >= SHUTTER_OPEN:
		want = Shutter.WARN
	if want != shutter_state:
		_set_shutter(want)
	if shutter_state == Shutter.WARN:
		var on := fmod(_shutter_t, 0.14) < 0.07
		_shutter_panel.visible = on
		if _shutter_floor:
			_shutter_floor.material_override = LevelKit.glow(Decor.C_AMBER, 2.4 if on else 0.6)


func _set_shutter(s: Shutter) -> void:
	shutter_state = s
	match s:
		Shutter.OPEN:
			_shutter_panel.visible = false
			_shutter_shape.set_deferred("disabled", true)
			_shutter_label.text = "通行可"
			_shutter_label.modulate = Decor.C_CYAN
			if _shutter_floor:
				_shutter_floor.material_override = LevelKit.glow(Decor.C_CYAN, 2.0)
		Shutter.WARN:
			_shutter_label.text = "まもなく閉鎖"
			_shutter_label.modulate = Decor.C_AMBER
		Shutter.CLOSED:
			_shutter_panel.visible = true
			_shutter_shape.set_deferred("disabled", false)
			_shutter_label.text = "閉鎖中"
			_shutter_label.modulate = Color(1.0, 0.35, 0.25)
			if _shutter_floor:
				_shutter_floor.material_override = LevelKit.glow(Color(1.0, 0.25, 0.15), 2.4)
			var p := Game.player as Node3D
			if p and absf(p.global_position.x - SHUTTER_X) < 14.0:
				Sfx.play("click", 0.7, -6.0)


## 検証用：シャッターの位相を指定する（0..1）。
func set_shutter_phase(k: float) -> void:
	_shutter_t = k * (SHUTTER_OPEN + SHUTTER_WARN + SHUTTER_CLOSED)
