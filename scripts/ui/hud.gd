extends CanvasLayer
## 画面表示（仕様 §12）。常時表示は最小限：
## 左上 HP・エネルギー・時代と場所 / 右上 次の目標 / 中央 クロー照準 / 下 一時ヒント / 仲間の状態。
## 会話・選択・記録パネル・時代カード・暗転・時空移動演出・ポーズもここで扱う。

signal _line_advanced
signal _choice_picked(index: int)

const C_PANEL := Color(0.05, 0.09, 0.2, 0.82)
const C_PANEL_BORDER := Color(0.45, 0.75, 1.0, 0.55)
const C_TEXT := Color(0.96, 0.97, 1.0)
const C_SUB := Color(0.72, 0.8, 0.95)
const C_GOLD := Color(1.0, 0.82, 0.25)
const C_CYAN := Color(0.35, 0.9, 1.0)
const C_BAD := Color(1.0, 0.45, 0.3)

const SPEAKER_COLORS := {
	"ネクマックス": Color("4aa8ff"),
	"マツイ社長": Color("f2b84b"),
	"源兵衛": Color("e8834a"),
	"おはる": Color("ff86b0"),
	"ソラ": Color("5fe0d0"),
	"ルート": Color("ff5a5a"),
	"システム": Color("a8bcd8"),
}

var root: Control
var gameplay: Control
var _font: Font

# 左上
var status_draw: Control
var era_label: Label
var crystal_label: Label
# 右上
var obj_panel: PanelContainer
var obj_title: Label
var obj_sub: Label
# 中央・下
var reticle: Control
var prompt_panel: PanelContainer
var prompt_key: Label
var prompt_text: Label
var hint_label: Label
var toast_label: Label
var bark_label: RichTextLabel
var companion_box: VBoxContainer
var claw_icon: Control
var capture_hint: Label
# 会話
var dlg_panel: PanelContainer
var dlg_name: Label
var dlg_name_bg: PanelContainer
var dlg_text: RichTextLabel
var dlg_next: Label
# パネル
var choice_panel: PanelContainer
var choice_title: Label
var choice_body: RichTextLabel
var choice_buttons: VBoxContainer
var pause_panel: PanelContainer
var pause_buttons: VBoxContainer
var help_panel: PanelContainer
var debug_label: Label
# 演出
var fade_rect: ColorRect
var warp_rect: ColorRect
var warp_mat: ShaderMaterial
var era_card: Control
var era_year: Label
var era_place: Label
var flash_rect: ColorRect

# 状態
var hp := 5
var max_hp := 5
var energy := 1.0
var claw_state := 0
var reticle_mode := 0   # 0 なし / 1 構え・対象なし / 2 対象ロック / 3 保持中
var reticle_pos := Vector2.ZERO
var _dialogue_active := false
var _typing := false
var _type_progress := 0.0
var _choice_active := false
var _hint_t := 0.0
var _toast_t := 0.0
var _bark_t := 0.0
var _debug := false
var _time := 0.0
var _companion_rows := {}


func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	_font = ThemeDB.fallback_font
	var custom: Variant = ProjectSettings.get_setting("gui/theme/custom_font", "")
	if custom is String and custom != "" and ResourceLoader.exists(custom):
		_font = load(custom)
	_build()
	Game.pause_changed.connect(_on_pause_changed)
	reset_for_title()


func _process(delta: float) -> void:
	_time += delta
	if _hint_t > 0.0:
		_hint_t -= delta
		hint_label.modulate.a = clampf(_hint_t / 0.5, 0.0, 1.0)
	if _toast_t > 0.0:
		_toast_t -= delta
		toast_label.modulate.a = clampf(_toast_t / 0.4, 0.0, 1.0)
		toast_label.scale = Vector2.ONE * (1.0 + maxf(0.0, _toast_t - 2.0) * 0.6)
	if _bark_t > 0.0:
		_bark_t -= delta
		bark_label.modulate.a = clampf(_bark_t / 0.4, 0.0, 1.0)
	if _typing:
		_type_progress += delta * 42.0
		var total := dlg_text.get_total_character_count()
		var prev := dlg_text.visible_characters
		dlg_text.visible_characters = int(_type_progress)
		if dlg_text.visible_characters != prev and dlg_text.visible_characters % 3 == 0:
			Sfx.play("talk", randf_range(0.95, 1.1), -6.0)
		if _type_progress >= total:
			_finish_typing()
	if dlg_next.visible:
		dlg_next.modulate.a = 0.5 + 0.5 * sin(_time * 6.0)
	var in_game := Game.in_gameplay and not get_tree().paused
	capture_hint.visible = in_game and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED \
			and not _dialogue_active and not _choice_active and not Game.input_locked
	if _debug:
		_update_debug()
	status_draw.queue_redraw()
	reticle.queue_redraw()
	claw_icon.queue_redraw()


func _input(event: InputEvent) -> void:
	if get_tree().paused:
		return
	if _dialogue_active and event.is_action_pressed("advance"):
		get_viewport().set_input_as_handled()
		if _typing:
			_finish_typing()
		else:
			_line_advanced.emit()


# ================================================================ 公開API

func reset_for_title() -> void:
	gameplay.visible = false
	dlg_panel.visible = false
	choice_panel.visible = false
	pause_panel.visible = false
	help_panel.visible = false
	era_card.visible = false
	warp_rect.visible = false
	set_companions([])
	prompt("")
	set_reticle(0, Vector2.ZERO)
	_dialogue_active = false
	_choice_active = false


func show_gameplay(v: bool) -> void:
	gameplay.visible = v


func set_status(p_hp: int, p_max: int, p_energy: float) -> void:
	hp = p_hp
	max_hp = p_max
	energy = p_energy


func set_era(era: int) -> void:
	var place: String = TimeTravel.ERA_PLACES.get(era, "")
	era_label.text = "%s　%s" % [TimeTravel.era_label(era), place]


func set_crystals(n: int) -> void:
	crystal_label.text = "◆ %d" % n


func set_objective(title: String, sub: String = "") -> void:
	obj_panel.visible = title != ""
	if obj_title.text != title and title != "":
		obj_panel.modulate = Color(1.6, 1.4, 0.8)
		create_tween().tween_property(obj_panel, "modulate", Color.WHITE, 0.8)
	obj_title.text = title
	obj_sub.text = sub
	obj_sub.visible = sub != ""


func hint(text: String, secs: float = 4.0) -> void:
	hint_label.text = text
	_hint_t = secs
	hint_label.modulate.a = 1.0


## kind: "good" 成功 / "bad" 失敗 / "info" / "change" 時代の変化
func toast(text: String, kind: String = "info", secs: float = 2.6) -> void:
	toast_label.text = text
	var c := C_TEXT
	match kind:
		"good": c = C_GOLD
		"bad": c = C_BAD
		"change": c = Color(0.55, 1.0, 0.85)
	toast_label.add_theme_color_override("font_color", c)
	toast_label.pivot_offset = toast_label.size * 0.5
	_toast_t = secs
	toast_label.modulate.a = 1.0


## 会話を止めずに出す短い掛け声（パズル中の仲間の合図など）。
func bark(speaker: String, text: String, secs: float = 3.0) -> void:
	var c: Color = SPEAKER_COLORS.get(speaker, C_TEXT)
	bark_label.text = "[center][color=#%s]%s[/color]「%s」[/center]" % [c.to_html(false), speaker, text]
	_bark_t = secs
	bark_label.modulate.a = 1.0


func prompt(text: String, key: String = "F", screen_pos: Variant = null) -> void:
	if text == "":
		prompt_panel.visible = false
		return
	prompt_panel.visible = true
	prompt_key.text = key
	prompt_text.text = text
	prompt_panel.reset_size()
	var vp := root.size
	var pos: Vector2 = Vector2(vp.x * 0.5, vp.y * 0.68)
	if screen_pos is Vector2:
		pos = screen_pos
	pos.x = clampf(pos.x, 120.0, vp.x - 120.0)
	pos.y = clampf(pos.y, 120.0, vp.y - 200.0)
	prompt_panel.position = pos - Vector2(prompt_panel.size.x * 0.5, prompt_panel.size.y)


func set_reticle(mode: int, pos: Vector2) -> void:
	reticle_mode = mode
	reticle_pos = pos


func set_claw_state(s: int) -> void:
	claw_state = s


## entries: [{ "id", "name", "status", "progress"(-1で非表示), "alert"(bool) }]
func set_companions(entries: Array) -> void:
	var seen := {}
	for e in entries:
		var id: String = e.get("id", e.get("name", ""))
		seen[id] = true
		var row: Dictionary = _companion_rows.get(id, {})
		if row.is_empty():
			row = _make_companion_row(e.get("name", ""))
			_companion_rows[id] = row
		var st: Label = row.status
		st.text = e.get("status", "")
		var alert: bool = e.get("alert", false)
		st.add_theme_color_override("font_color", C_GOLD if alert else C_TEXT)
		var pb: ProgressBar = row.bar
		var p: float = e.get("progress", -1.0)
		pb.visible = p >= 0.0
		pb.value = p * 100.0
		var icon: Label = row.icon
		icon.text = e.get("icon", "●")
	for id in _companion_rows.keys():
		if not seen.has(id):
			(_companion_rows[id].panel as Control).queue_free()
			_companion_rows.erase(id)
	companion_box.visible = not entries.is_empty()


func say(lines: Array) -> void:
	if lines.is_empty():
		return
	var was_locked := Game.input_locked
	Game.input_locked = true
	_dialogue_active = true
	dlg_panel.visible = true
	set_reticle(0, Vector2.ZERO)
	prompt("")
	for line in lines:
		var speaker: String = line.get("speaker", "")
		var text: String = line.get("text", "")
		_show_line(speaker, text)
		await _line_advanced
		Sfx.play("ui", 1.0, -8.0)
	dlg_panel.visible = false
	_dialogue_active = false
	await get_tree().create_timer(0.15).timeout
	Game.input_locked = was_locked


func say_key(key: String) -> void:
	await say(DialogueDB.lines(key))


func is_dialogue_active() -> bool:
	return _dialogue_active


## 選択パネル。選ばれたボタンの番号を返す。
func choose(title: String, body: String, options: Array) -> int:
	var was_locked := Game.input_locked
	Game.input_locked = true
	_choice_active = true
	Game.release_mouse()
	choice_title.text = title
	choice_body.text = body
	choice_body.visible = body != ""
	for c in choice_buttons.get_children():
		c.queue_free()
	for i in options.size():
		var b := _make_button(str(options[i]))
		b.pressed.connect(func() -> void: _choice_picked.emit(i))
		choice_buttons.add_child(b)
	choice_panel.visible = true
	choice_panel.reset_size()
	await get_tree().process_frame
	_center(choice_panel)
	if choice_buttons.get_child_count() > 0:
		(choice_buttons.get_child(0) as Button).grab_focus()
	var idx: int = await _choice_picked
	Sfx.play("ui")
	choice_panel.visible = false
	_choice_active = false
	await get_tree().create_timer(0.12).timeout
	Game.input_locked = was_locked
	if Game.in_gameplay:
		Game.capture_mouse()
	return idx


func fade_out(t: float = 0.4) -> void:
	fade_rect.visible = true
	var tw := create_tween()
	tw.tween_property(fade_rect, "color:a", 1.0, t)
	await tw.finished


func fade_in(t: float = 0.5) -> void:
	var tw := create_tween()
	tw.tween_property(fade_rect, "color:a", 0.0, t)
	await tw.finished
	fade_rect.visible = false


func warp_out(tint: Color) -> void:
	warp_rect.visible = true
	warp_mat.set_shader_parameter("tint", tint)
	warp_mat.set_shader_parameter("progress", 0.0)
	var tw := create_tween()
	tw.tween_method(func(v: float) -> void: warp_mat.set_shader_parameter("progress", v), 0.0, 1.0, 1.2) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await tw.finished
	flash_rect.visible = true
	flash_rect.color = Color(1, 1, 1, 0)
	var tw2 := create_tween()
	tw2.tween_property(flash_rect, "color:a", 1.0, 0.25)
	await tw2.finished


## 新しいシーンに着いた時の演出（暗転・ワープ解除と時代カード）。
func arrive(era: int, show_card: bool) -> void:
	if warp_rect.visible:
		fade_rect.visible = false
		var tw := create_tween()
		tw.tween_method(func(v: float) -> void: warp_mat.set_shader_parameter("progress", v), 1.0, 0.0, 0.9)
		tw.parallel().tween_property(flash_rect, "color:a", 0.0, 0.5)
		tw.tween_callback(func() -> void:
			warp_rect.visible = false
			flash_rect.visible = false)
	else:
		fade_in(0.6)
	if show_card:
		_show_era_card(era)


func flash(c: Color = Color(1, 1, 1, 0.7), t: float = 0.35) -> void:
	flash_rect.visible = true
	flash_rect.color = c
	var tw := create_tween()
	tw.tween_property(flash_rect, "color:a", 0.0, t)
	tw.tween_callback(func() -> void: flash_rect.visible = false)


## 記録・装備・比較などの大きな情報パネル。押したボタンの番号を返す。
func show_panel(title: String, bbcode: String, options: Array = ["閉じる"]) -> int:
	return await choose(title, bbcode, options)


func toggle_debug() -> void:
	_debug = not _debug
	debug_label.visible = _debug


func show_ending(stats_bbcode: String) -> void:
	Game.input_locked = true
	await choose("序章クリア", stats_bbcode, ["タイトルへ戻る"])
	Game.goto_title()


# ================================================================ 内部

func _show_line(speaker: String, text: String) -> void:
	var c: Color = SPEAKER_COLORS.get(speaker, C_SUB)
	dlg_name.text = speaker
	dlg_name_bg.visible = speaker != ""
	var sb := dlg_name_bg.get_theme_stylebox("panel") as StyleBoxFlat
	sb.bg_color = c.darkened(0.45)
	sb.border_color = c
	dlg_text.text = text
	dlg_text.visible_characters = 0
	_type_progress = 0.0
	_typing = true
	dlg_next.visible = false


func _finish_typing() -> void:
	_typing = false
	dlg_text.visible_characters = -1
	dlg_next.visible = true


func _show_era_card(era: int) -> void:
	era_year.text = TimeTravel.era_label(era)
	era_place.text = TimeTravel.ERA_PLACES.get(era, "")
	var tint: Color = TimeTravel.ERA_TINTS.get(era, Color.WHITE)
	era_year.add_theme_color_override("font_color", tint.lightened(0.35))
	era_card.visible = true
	era_card.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_interval(0.3)
	tw.tween_property(era_card, "modulate:a", 1.0, 0.5)
	tw.tween_interval(1.8)
	tw.tween_property(era_card, "modulate:a", 0.0, 0.6)
	tw.tween_callback(func() -> void: era_card.visible = false)


func _on_pause_changed(p: bool) -> void:
	pause_panel.visible = p
	help_panel.visible = false
	if p:
		pause_panel.reset_size()
		await get_tree().process_frame
		_center(pause_panel)
		if pause_buttons.get_child_count() > 0:
			(pause_buttons.get_child(0) as Button).grab_focus()


func _update_debug() -> void:
	var mem := Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0
	var claw := ClawStateMachine.state_name(claw_state)
	var t := TimelineState
	debug_label.text = "FPS %d  |  MEM %.1f MB  |  draw %d\nclaw_state %s  |  current_era %d\ngate_repaired %s  genbei_drawing_found %s\ndrawing_confirmed %s  future_route_open %s" % [
		Engine.get_frames_per_second(), mem,
		Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		claw, t.current_era, t.gate_repaired, t.genbei_drawing_found,
		t.drawing_confirmed, t.future_route_open]


func _center(c: Control) -> void:
	c.position = (root.size - c.size) * 0.5


# ---------------------------------------------------------------- 構築

func _build() -> void:
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = _make_theme()
	add_child(root)

	gameplay = Control.new()
	gameplay.set_anchors_preset(Control.PRESET_FULL_RECT)
	gameplay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(gameplay)

	# 左上：ネクマックスの顔・HP・エネルギー
	status_draw = Control.new()
	status_draw.position = Vector2(20, 16)
	status_draw.size = Vector2(380, 100)
	status_draw.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status_draw.draw.connect(_draw_status)
	gameplay.add_child(status_draw)

	var era_bg := _panel(Color(0.04, 0.07, 0.16, 0.7), 14, 6)
	era_bg.position = Vector2(24, 112)
	gameplay.add_child(era_bg)
	var era_row := HBoxContainer.new()
	era_row.add_theme_constant_override("separation", 14)
	era_bg.add_child(era_row)
	era_label = _label("", 17, C_TEXT)
	era_row.add_child(era_label)
	crystal_label = _label("◆ 0", 17, C_GOLD)
	era_row.add_child(crystal_label)

	# 右上：次の目標
	obj_panel = _panel(C_PANEL, 14, 12)
	obj_panel.anchor_left = 1.0
	obj_panel.anchor_right = 1.0
	obj_panel.offset_left = -440
	obj_panel.offset_right = -20
	obj_panel.offset_top = 18
	gameplay.add_child(obj_panel)
	var obj_row := HBoxContainer.new()
	obj_row.add_theme_constant_override("separation", 12)
	obj_panel.add_child(obj_row)
	var diamond := _label("◇", 26, C_GOLD)
	diamond.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	obj_row.add_child(diamond)
	var obj_col := VBoxContainer.new()
	obj_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	obj_col.add_theme_constant_override("separation", 0)
	obj_row.add_child(obj_col)
	obj_title = _label("", 21, C_TEXT)
	obj_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	obj_col.add_child(obj_title)
	obj_sub = _label("", 15, C_SUB)
	obj_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	obj_col.add_child(obj_sub)

	# 仲間の状態（パズル中）
	companion_box = VBoxContainer.new()
	companion_box.position = Vector2(24, 170)
	companion_box.add_theme_constant_override("separation", 8)
	companion_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gameplay.add_child(companion_box)

	# 中央：照準
	reticle = Control.new()
	reticle.set_anchors_preset(Control.PRESET_FULL_RECT)
	reticle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	reticle.draw.connect(_draw_reticle)
	gameplay.add_child(reticle)

	# 右下：NMクローのアイコン
	claw_icon = Control.new()
	claw_icon.anchor_left = 1.0
	claw_icon.anchor_top = 1.0
	claw_icon.anchor_right = 1.0
	claw_icon.anchor_bottom = 1.0
	claw_icon.offset_left = -150
	claw_icon.offset_top = -160
	claw_icon.offset_right = -20
	claw_icon.offset_bottom = -16
	claw_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	claw_icon.draw.connect(_draw_claw_icon)
	gameplay.add_child(claw_icon)

	# 調べる／話すのプロンプト
	prompt_panel = _panel(Color(0.04, 0.07, 0.16, 0.86), 22, 8)
	prompt_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gameplay.add_child(prompt_panel)
	var prow := HBoxContainer.new()
	prow.add_theme_constant_override("separation", 10)
	prompt_panel.add_child(prow)
	var key_bg := _panel(Color(0.95, 0.97, 1.0), 8, 2)
	key_bg.custom_minimum_size = Vector2(34, 34)
	prow.add_child(key_bg)
	prompt_key = _label("F", 19, Color(0.05, 0.1, 0.25))
	prompt_key.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	key_bg.add_child(prompt_key)
	prompt_text = _label("", 19, C_TEXT)
	prow.add_child(prompt_text)

	# 下：ヒント・掛け声
	hint_label = _label("", 19, C_TEXT)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.anchor_left = 0.0
	hint_label.anchor_right = 1.0
	hint_label.anchor_top = 1.0
	hint_label.anchor_bottom = 1.0
	hint_label.offset_top = -64
	hint_label.offset_bottom = -30
	hint_label.add_theme_constant_override("outline_size", 8)
	hint_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	gameplay.add_child(hint_label)

	bark_label = RichTextLabel.new()
	bark_label.bbcode_enabled = true
	bark_label.fit_content = true
	bark_label.scroll_active = false
	bark_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bark_label.anchor_left = 0.15
	bark_label.anchor_right = 0.85
	bark_label.anchor_top = 1.0
	bark_label.anchor_bottom = 1.0
	bark_label.offset_top = -132
	bark_label.offset_bottom = -76
	bark_label.add_theme_font_size_override("normal_font_size", 26)
	bark_label.add_theme_constant_override("outline_size", 10)
	bark_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	gameplay.add_child(bark_label)

	toast_label = _label("", 40, C_TEXT)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.anchor_left = 0.0
	toast_label.anchor_right = 1.0
	toast_label.offset_top = 170
	toast_label.offset_bottom = 230
	toast_label.add_theme_constant_override("outline_size", 12)
	toast_label.add_theme_color_override("font_outline_color", Color(0.02, 0.04, 0.12, 0.95))
	gameplay.add_child(toast_label)

	capture_hint = _label("クリックで操作を開始（マウスで視点）", 18, C_SUB)
	capture_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	capture_hint.anchor_left = 0.0
	capture_hint.anchor_right = 1.0
	capture_hint.anchor_top = 0.5
	capture_hint.anchor_bottom = 0.5
	capture_hint.offset_top = 150
	capture_hint.offset_bottom = 180
	capture_hint.add_theme_constant_override("outline_size", 8)
	capture_hint.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	gameplay.add_child(capture_hint)

	# 会話ウィンドウ
	dlg_panel = _panel(C_PANEL, 18, 22)
	dlg_panel.anchor_left = 0.08
	dlg_panel.anchor_right = 0.92
	dlg_panel.anchor_top = 1.0
	dlg_panel.anchor_bottom = 1.0
	dlg_panel.offset_top = -190
	dlg_panel.offset_bottom = -26
	root.add_child(dlg_panel)
	var dcol := VBoxContainer.new()
	dcol.add_theme_constant_override("separation", 8)
	dlg_panel.add_child(dcol)
	var name_row := HBoxContainer.new()
	dcol.add_child(name_row)
	dlg_name_bg = _panel(Color(0.2, 0.3, 0.5), 12, 4)
	(dlg_name_bg.get_theme_stylebox("panel") as StyleBoxFlat).set_border_width_all(2)
	dlg_name_bg.get_theme_stylebox("panel").content_margin_left = 16
	dlg_name_bg.get_theme_stylebox("panel").content_margin_right = 16
	name_row.add_child(dlg_name_bg)
	dlg_name = _label("", 19, C_TEXT)
	dlg_name_bg.add_child(dlg_name)
	dlg_text = RichTextLabel.new()
	dlg_text.bbcode_enabled = true
	dlg_text.fit_content = true
	dlg_text.scroll_active = false
	dlg_text.custom_minimum_size = Vector2(0, 70)
	dlg_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dlg_text.add_theme_font_size_override("normal_font_size", 24)
	dlg_text.add_theme_color_override("default_color", C_TEXT)
	dlg_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	dcol.add_child(dlg_text)
	dlg_next = _label("▼  F / Space / クリック", 14, C_SUB)
	dlg_next.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	dcol.add_child(dlg_next)

	# 選択・情報パネル
	choice_panel = _panel(Color(0.04, 0.08, 0.18, 0.95), 20, 26)
	choice_panel.custom_minimum_size = Vector2(620, 0)
	root.add_child(choice_panel)
	var ccol := VBoxContainer.new()
	ccol.add_theme_constant_override("separation", 14)
	choice_panel.add_child(ccol)
	choice_title = _label("", 28, C_GOLD)
	choice_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ccol.add_child(choice_title)
	choice_body = RichTextLabel.new()
	choice_body.bbcode_enabled = true
	choice_body.fit_content = true
	choice_body.scroll_active = false
	choice_body.custom_minimum_size = Vector2(760, 0)
	choice_body.add_theme_font_size_override("normal_font_size", 19)
	choice_body.add_theme_font_size_override("bold_font_size", 20)
	choice_body.add_theme_color_override("default_color", C_TEXT)
	ccol.add_child(choice_body)
	choice_buttons = VBoxContainer.new()
	choice_buttons.add_theme_constant_override("separation", 10)
	choice_buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	ccol.add_child(choice_buttons)

	# ポーズ
	pause_panel = _panel(Color(0.04, 0.08, 0.18, 0.95), 20, 28)
	pause_panel.custom_minimum_size = Vector2(420, 0)
	root.add_child(pause_panel)
	var pcol := VBoxContainer.new()
	pcol.add_theme_constant_override("separation", 12)
	pause_panel.add_child(pcol)
	var ptitle := _label("ポーズ", 30, C_GOLD)
	ptitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pcol.add_child(ptitle)
	pause_buttons = VBoxContainer.new()
	pause_buttons.add_theme_constant_override("separation", 10)
	pcol.add_child(pause_buttons)
	var b_resume := _make_button("ゲームに戻る")
	b_resume.pressed.connect(func() -> void:
		Game.set_paused(false)
		Game.capture_mouse())
	pause_buttons.add_child(b_resume)
	var b_help := _make_button("操作説明")
	b_help.pressed.connect(func() -> void:
		help_panel.visible = not help_panel.visible
		help_panel.reset_size()
		help_panel.position = Vector2(root.size.x * 0.5 - help_panel.size.x * 0.5, 30))
	pause_buttons.add_child(b_help)
	var b_quality := _make_button("画質：標準")
	b_quality.pressed.connect(func() -> void:
		Game.set_low_quality(not Game.low_quality)
		b_quality.text = "画質：軽量（影なし）" if Game.low_quality else "画質：標準")
	pause_buttons.add_child(b_quality)
	var sens_row := HBoxContainer.new()
	sens_row.add_theme_constant_override("separation", 10)
	var sens_label := _label("視点の感度", 17, C_SUB)
	sens_row.add_child(sens_label)
	var sens := HSlider.new()
	sens.min_value = 0.0008
	sens.max_value = 0.006
	sens.step = 0.0001
	sens.value = Game.mouse_sensitivity
	sens.custom_minimum_size = Vector2(200, 30)
	sens.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sens.value_changed.connect(func(v: float) -> void: Game.mouse_sensitivity = v)
	sens_row.add_child(sens)
	pause_buttons.add_child(sens_row)
	var b_title := _make_button("タイトルへ戻る")
	b_title.pressed.connect(func() -> void: Game.goto_title())
	pause_buttons.add_child(b_title)

	help_panel = _panel(Color(0.04, 0.08, 0.18, 0.97), 16, 22)
	root.add_child(help_panel)
	var help := RichTextLabel.new()
	help.bbcode_enabled = true
	help.fit_content = true
	help.scroll_active = false
	help.custom_minimum_size = Vector2(560, 0)
	help.add_theme_font_size_override("normal_font_size", 18)
	help.add_theme_color_override("default_color", C_TEXT)
	help.text = controls_bbcode()
	help_panel.add_child(help)

	debug_label = _label("", 14, Color(0.7, 1.0, 0.7))
	debug_label.position = Vector2(420, 8)
	debug_label.add_theme_constant_override("outline_size", 6)
	debug_label.add_theme_color_override("font_outline_color", Color.BLACK)
	debug_label.visible = false
	root.add_child(debug_label)

	# 時代カード
	era_card = VBoxContainer.new()
	era_card.set_anchors_preset(Control.PRESET_CENTER)
	era_card.anchor_left = 0.0
	era_card.anchor_right = 1.0
	era_card.offset_left = 0
	era_card.offset_right = 0
	era_card.offset_top = -120
	era_card.offset_bottom = 60
	era_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(era_card)
	era_year = _label("", 96, Color.WHITE)
	era_year.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	era_year.add_theme_constant_override("outline_size", 18)
	era_year.add_theme_color_override("font_outline_color", Color(0.02, 0.04, 0.12, 0.9))
	era_card.add_child(era_year)
	era_place = _label("", 34, Color.WHITE)
	era_place.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	era_place.add_theme_constant_override("outline_size", 10)
	era_place.add_theme_color_override("font_outline_color", Color(0.02, 0.04, 0.12, 0.9))
	era_card.add_child(era_place)

	# 時空移動の演出・暗転
	warp_rect = ColorRect.new()
	warp_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	warp_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	warp_mat = ShaderMaterial.new()
	warp_mat.shader = _warp_shader()
	warp_rect.material = warp_mat
	root.add_child(warp_rect)

	flash_rect = ColorRect.new()
	flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash_rect.color = Color(1, 1, 1, 0)
	flash_rect.visible = false
	root.add_child(flash_rect)

	fade_rect = ColorRect.new()
	fade_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fade_rect.color = Color(0.02, 0.03, 0.08, 0.0)
	fade_rect.visible = false
	root.add_child(fade_rect)


static func controls_bbcode() -> String:
	return "[b]操作方法[/b]（キーボード＋マウス）\n" \
		+ "  移動 …… W A S D　　視点 …… マウス\n" \
		+ "  ジャンプ …… Space　　ダッシュ …… Shift（エネルギーを使う）\n" \
		+ "  調べる／話す／IDO …… F\n" \
		+ "  NMクローを構える …… 右クリック長押し（または Q 長押し）\n" \
		+ "  つかむ／離す …… 構えたまま左クリック（または E）\n" \
		+ "  　※保持中は構えを離しても保持したまま。左クリックで離す\n" \
		+ "  基本攻撃 …… 構えていない時の左クリック（または E）\n" \
		+ "  ポーズ …… Esc　　計測表示 …… F3"


func _make_companion_row(cname: String) -> Dictionary:
	var panel := _panel(Color(0.04, 0.07, 0.16, 0.8), 12, 10)
	panel.custom_minimum_size = Vector2(300, 0)
	companion_box.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	col.add_child(row)
	var icon := _label("●", 20, C_GOLD)
	row.add_child(icon)
	var n := _label(cname, 18, SPEAKER_COLORS.get(cname, C_SUB))
	row.add_child(n)
	var st := _label("", 20, C_TEXT)
	st.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	st.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(st)
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(0, 12)
	bar.show_percentage = false
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.12)
	bg.set_corner_radius_all(6)
	var fill := StyleBoxFlat.new()
	fill.bg_color = C_GOLD
	fill.set_corner_radius_all(6)
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fill)
	col.add_child(bar)
	return {"panel": panel, "status": st, "bar": bar, "icon": icon}


func _make_theme() -> Theme:
	var th := Theme.new()
	th.default_font = _font
	th.default_font_size = 18
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.12, 0.22, 0.42, 0.95)
	normal.set_corner_radius_all(12)
	normal.set_border_width_all(2)
	normal.border_color = Color(0.4, 0.65, 1.0, 0.6)
	normal.set_content_margin_all(12)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.2, 0.36, 0.66, 1.0)
	hover.border_color = C_GOLD
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color(0.3, 0.5, 0.85, 1.0)
	th.set_stylebox("normal", "Button", normal)
	th.set_stylebox("hover", "Button", hover)
	th.set_stylebox("focus", "Button", hover)
	th.set_stylebox("pressed", "Button", pressed)
	th.set_color("font_color", "Button", C_TEXT)
	th.set_color("font_hover_color", "Button", Color.WHITE)
	th.set_color("font_focus_color", "Button", Color.WHITE)
	th.set_font_size("font_size", "Button", 21)
	return th


func _make_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(360, 50)
	b.focus_mode = Control.FOCUS_ALL
	b.mouse_entered.connect(func() -> void: b.grab_focus())
	return b


func _panel(bg: Color, radius: int, margin: int) -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(margin)
	sb.content_margin_left = margin + 6
	sb.content_margin_right = margin + 6
	if bg.a < 0.99:
		sb.set_border_width_all(1)
		sb.border_color = C_PANEL_BORDER
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


func _label(text: String, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


# ---------------------------------------------------------------- 描画

func _draw_status() -> void:
	var c := status_draw
	# 顔アイコン
	var ctr := Vector2(46, 46)
	c.draw_circle(ctr, 44, Color(0.04, 0.08, 0.2, 0.9))
	c.draw_circle(ctr, 40, Color(0.2, 0.55, 0.95))
	c.draw_circle(ctr + Vector2(-34, 2), 9, Color(0.2, 0.55, 0.95))
	_draw_ellipse(c, ctr + Vector2(5, 4), Vector2(26, 28), Color.WHITE)
	_draw_ellipse(c, ctr + Vector2(-2, -2), Vector2(3.5, 7), Color(0.05, 0.08, 0.18))
	_draw_ellipse(c, ctr + Vector2(13, -2), Vector2(3.5, 7), Color(0.05, 0.08, 0.18))
	var mouth := PackedVector2Array()
	for i in 9:
		var a := PI * i / 8.0
		mouth.append(ctr + Vector2(5 + cos(a) * 9, 12 + sin(a) * 7))
	c.draw_colored_polygon(mouth, Color(0.8, 0.2, 0.25))
	c.draw_arc(ctr, 41, 0, TAU, 48, Color(0.55, 0.85, 1.0, 0.8), 2.5)
	# ハート
	for i in max_hp:
		var hc := Vector2(116 + i * 38, 26)
		_draw_heart(c, hc, 15.0, Color(0.05, 0.05, 0.1, 0.9))
		if i < hp:
			_draw_heart(c, hc, 12.5, Color(1.0, 0.25, 0.32))
			_draw_heart(c, hc + Vector2(-3, -3), 4.0, Color(1, 0.75, 0.78))
		else:
			_draw_heart(c, hc, 12.5, Color(0.3, 0.3, 0.38))
	# エネルギー
	var bar_rect := Rect2(122, 52, 230, 16)
	c.draw_rect(Rect2(bar_rect.position - Vector2(3, 3), bar_rect.size + Vector2(6, 6)), Color(0.04, 0.08, 0.2, 0.9))
	c.draw_rect(bar_rect, Color(0.1, 0.15, 0.3))
	c.draw_rect(Rect2(bar_rect.position, Vector2(bar_rect.size.x * clampf(energy, 0.0, 1.0), bar_rect.size.y)), Color(0.3, 0.85, 1.0))
	c.draw_rect(Rect2(bar_rect.position, Vector2(bar_rect.size.x * clampf(energy, 0.0, 1.0), 5)), Color(0.75, 0.97, 1.0, 0.8))
	var bolt := PackedVector2Array([Vector2(110, 46), Vector2(102, 61), Vector2(108, 61), Vector2(104, 74), Vector2(116, 56), Vector2(110, 56), Vector2(114, 46)])
	c.draw_colored_polygon(bolt, C_CYAN)


func _draw_heart(c: CanvasItem, center: Vector2, s: float, col: Color) -> void:
	var pts := PackedVector2Array()
	for i in 24:
		var t := TAU * i / 24.0
		var x := 16.0 * pow(sin(t), 3)
		var y := 13.0 * cos(t) - 5.0 * cos(2 * t) - 2.0 * cos(3 * t) - cos(4 * t)
		pts.append(center + Vector2(x, -y) * (s / 16.0))
	c.draw_colored_polygon(pts, col)


func _draw_ellipse(c: CanvasItem, center: Vector2, r: Vector2, col: Color) -> void:
	var pts := PackedVector2Array()
	for i in 24:
		var a := TAU * i / 24.0
		pts.append(center + Vector2(cos(a) * r.x, sin(a) * r.y))
	c.draw_colored_polygon(pts, col)


func _draw_reticle() -> void:
	var c := reticle
	match reticle_mode:
		1:
			# 構え中・対象なし：中央に小さな十字（形でも区別）
			var p := c.size * Vector2(0.5, 0.47)
			var col := Color(0.8, 0.9, 1.0, 0.55)
			c.draw_line(p + Vector2(-10, 0), p + Vector2(-4, 0), col, 2)
			c.draw_line(p + Vector2(10, 0), p + Vector2(4, 0), col, 2)
			c.draw_line(p + Vector2(0, -10), p + Vector2(0, -4), col, 2)
			c.draw_line(p + Vector2(0, 10), p + Vector2(0, 4), col, 2)
			c.draw_arc(p, 22, 0, TAU, 32, Color(0.8, 0.9, 1.0, 0.25), 1.5)
		2:
			# 対象ロック：四隅のカッコと回転する円
			var p2 := reticle_pos
			var r := 30.0 + sin(_time * 8.0) * 3.0
			for k in 4:
				var a := _time * 1.5 + k * PI * 0.5
				c.draw_arc(p2, r, a, a + 0.9, 8, C_CYAN, 3.0)
			for sx in [-1, 1]:
				for sy in [-1, 1]:
					var corner := p2 + Vector2(sx, sy) * (r + 12)
					c.draw_line(corner, corner - Vector2(sx * 12, 0), Color.WHITE, 3)
					c.draw_line(corner, corner - Vector2(0, sy * 12), Color.WHITE, 3)
			c.draw_circle(p2, 4, C_CYAN)
		3:
			# 保持中：塗りつぶしの輪
			var p3 := reticle_pos
			var pulse := 0.5 + 0.5 * sin(_time * 10.0)
			c.draw_arc(p3, 26, 0, TAU, 40, Color(0.35, 0.9, 1.0, 0.9), 6.0)
			c.draw_arc(p3, 34 + pulse * 6.0, 0, TAU, 40, Color(0.35, 0.9, 1.0, 0.35), 2.0)
			c.draw_circle(p3, 7, Color.WHITE)


func _draw_claw_icon() -> void:
	var c := claw_icon
	var ctr := Vector2(65, 62)
	var active := claw_state != 0
	var holding := claw_state == 2 or claw_state == 3
	c.draw_circle(ctr, 52, Color(0.04, 0.08, 0.2, 0.88))
	var ring_col := C_CYAN if active else Color(0.35, 0.55, 0.8)
	c.draw_arc(ctr, 50, 0, TAU, 48, ring_col, 4.0 if active else 2.5)
	if holding:
		c.draw_circle(ctr, 44, Color(0.2, 0.6, 0.9, 0.35 + 0.15 * sin(_time * 8.0)))
	# 腕とクロー
	var arm_col := Color(0.55, 0.9, 1.0) if active else Color(0.6, 0.75, 0.9)
	c.draw_line(ctr + Vector2(-26, 22), ctr + Vector2(4, -6), arm_col, 9)
	c.draw_circle(ctr + Vector2(-26, 22), 7, arm_col)
	var spread := 0.25 if holding else 0.75
	for side in [-1.0, 1.0]:
		var a: float = -PI * 0.25 + side * spread
		var base := ctr + Vector2(4, -6)
		var tip := base + Vector2(cos(a), sin(a)) * 22
		var tip2 := tip + Vector2(cos(a - side * 1.2), sin(a - side * 1.2)) * 12
		c.draw_line(base, tip, arm_col, 6)
		c.draw_line(tip, tip2, arm_col, 6)
	var label := "NMクロー"
	c.draw_string(_font, Vector2(0, 136), label, HORIZONTAL_ALIGNMENT_CENTER, 130, 17, C_TEXT)
	var keyhint := "保持中" if holding else ("構え中" if active else "右クリック / Q")
	c.draw_string(_font, Vector2(0, 154), keyhint, HORIZONTAL_ALIGNMENT_CENTER, 130, 13, C_GOLD if active else C_SUB)


func _warp_shader() -> Shader:
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec4 tint : source_color = vec4(1.0, 0.8, 0.4, 1.0);
void fragment() {
	vec2 p = UV - vec2(0.5);
	p.x *= 1.7777;
	float r = length(p);
	float a = atan(p.y, p.x);
	float swirl = sin(a * 7.0 + r * 26.0 - TIME * 9.0) * 0.5 + 0.5;
	float rings = sin(r * 46.0 - TIME * 14.0) * 0.5 + 0.5;
	vec3 col = mix(tint.rgb, vec3(1.0), rings * 0.55) * (0.55 + 0.45 * swirl);
	col += vec3(1.0) * smoothstep(0.35, 0.0, r) * progress;
	float edge = smoothstep(1.15 - progress * 1.4, 1.25 - progress * 1.4, r + 0.15);
	float alpha = clamp(progress * 1.4 - (1.0 - progress) * r * 1.8, 0.0, 1.0);
	alpha = max(alpha, edge * progress);
	COLOR = vec4(col, alpha);
}
"""
	return sh
