extends CanvasLayer
## タイトル画面の2D表示：ロゴ・「クリックでスタート」・メニュー・上書き確認・操作説明。
## 配色は HUD（scripts/ui/hud.gd）に合わせる：紺のパネルに金と水色のアクセント。
## HUD（レイヤー10）の暗転がこの画面の上にかかるよう、レイヤーは 5 にする。

signal action(id: String)        # "new" / "continue" / "proto" / "help"
signal confirm_closed(ok: bool)
signal started

const HudScript := preload("res://scripts/ui/hud.gd")

const C_PANEL := Color(0.05, 0.09, 0.2, 0.82)
const C_BORDER := Color(0.45, 0.75, 1.0, 0.55)
const C_TEXT := Color(0.96, 0.97, 1.0)
const C_SUB := Color(0.72, 0.8, 0.95)
const C_GOLD := Color(1.0, 0.82, 0.25)
const C_CYAN := Color(0.35, 0.9, 1.0)
const C_INK := Color(0.03, 0.06, 0.16)

const MENU := [
	["new", "はじめから"],
	["continue", "つづきから"],
	["proto", "クロー練習場（試作）"],
	["help", "操作説明"],
]

var root: Control
var logo: Control
var press_label: Label
var menu_panel: PanelContainer
var desc_label: Label
var notice_label: Label
var buttons := {}
var descriptions := {}
var confirm_layer: Control
var confirm_yes: Button
var confirm_no: Button
var help_layer: Control
var help_close: Button

## "press"（スタート待ち）/ "menu" / "confirm" / "help" / "busy"
var state := "press"
var menu_k := 0.0          # 0 = ロゴ中央 / 1 = ロゴ左上＋メニュー

var _font: Font
var _bold: FontVariation
var _time := 0.0
var _deco: Control
var _last_focus: Button = null


func _ready() -> void:
	layer = 5
	_font = LevelKit.font()
	_bold = FontVariation.new()
	_bold.base_font = _font
	_bold.variation_embolden = 0.9
	_build()


func _process(delta: float) -> void:
	_time += delta
	_layout()
	if press_label.visible:
		press_label.modulate.a = 0.55 + 0.45 * sin(_time * 3.2)
	_deco.queue_redraw()


func _input(event: InputEvent) -> void:
	match state:
		"press":
			var go := false
			if event is InputEventKey and event.pressed and not event.echo:
				go = true
			elif event is InputEventMouseButton and event.pressed:
				go = true
			elif event is InputEventScreenTouch and event.pressed:
				go = true
			if go:
				get_viewport().set_input_as_handled()
				started.emit()
		"confirm":
			if event.is_action_pressed("ui_cancel") or event.is_action_pressed("menu"):
				get_viewport().set_input_as_handled()
				_close_confirm(false)
		"help":
			if event.is_action_pressed("ui_cancel") or event.is_action_pressed("menu"):
				get_viewport().set_input_as_handled()
				close_help()


# ================================================================ 公開

## スタート待ち → メニューへ（ロゴが左上へ移り、メニューが出る）。
func show_menu(animate: bool = true) -> void:
	state = "menu"
	press_label.visible = false
	menu_panel.visible = true
	if animate:
		menu_panel.modulate.a = 0.0
		var tw := create_tween().set_parallel(true)
		tw.tween_property(self, "menu_k", 1.0, 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(menu_panel, "modulate:a", 1.0, 0.45).set_delay(0.2)
		await tw.finished
	else:
		menu_k = 1.0
		menu_panel.modulate.a = 1.0
	_focus_first()


func set_continue_available(ok: bool, info: String) -> void:
	var b: Button = buttons["continue"]
	b.disabled = not ok
	b.focus_mode = Control.FOCUS_ALL if ok else Control.FOCUS_NONE
	descriptions["continue"] = info


## 画面遷移中などにメニューを止める。
func set_busy(v: bool) -> void:
	state = "busy" if v else "menu"
	for id in buttons:
		(buttons[id] as Button).mouse_filter = Control.MOUSE_FILTER_IGNORE if v else Control.MOUSE_FILTER_STOP


func show_notice(text: String) -> void:
	notice_label.text = text
	notice_label.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_interval(2.6)
	tw.tween_property(notice_label, "modulate:a", 0.0, 0.6)


## 上書き確認。await で結果（true = はじめから）を受け取る。
func ask_overwrite() -> bool:
	state = "confirm"
	_set_menu_focusable(false)
	confirm_layer.visible = true
	confirm_layer.modulate.a = 0.0
	create_tween().tween_property(confirm_layer, "modulate:a", 1.0, 0.18)
	confirm_no.grab_focus()
	var ok: bool = await confirm_closed
	return ok


func open_help() -> void:
	state = "help"
	_set_menu_focusable(false)
	help_layer.visible = true
	help_layer.modulate.a = 0.0
	create_tween().tween_property(help_layer, "modulate:a", 1.0, 0.18)
	help_close.grab_focus()


func close_help() -> void:
	Sfx.play("ui")
	help_layer.visible = false
	state = "menu"
	_set_menu_focusable(true)
	(buttons["help"] as Button).grab_focus()


# ================================================================ 内部

func _close_confirm(ok: bool) -> void:
	Sfx.play("ui")
	confirm_layer.visible = false
	state = "menu"
	_set_menu_focusable(true)
	if not ok:
		(buttons["new"] as Button).grab_focus()
	confirm_closed.emit(ok)


func _set_menu_focusable(v: bool) -> void:
	for id in buttons:
		var b: Button = buttons[id]
		b.focus_mode = Control.FOCUS_ALL if (v and not b.disabled) else Control.FOCUS_NONE
		b.mouse_filter = Control.MOUSE_FILTER_STOP if v else Control.MOUSE_FILTER_IGNORE


func _focus_first() -> void:
	var first := buttons["continue"] as Button
	if first.disabled:
		first = buttons["new"]
	first.grab_focus()


func _on_focus(id: String, b: Button) -> void:
	desc_label.text = str(descriptions.get(id, ""))
	if _last_focus and _last_focus != b and is_instance_valid(_last_focus):
		var prev := _last_focus
		create_tween().tween_property(prev, "scale", Vector2.ONE, 0.12)
	_last_focus = b
	b.pivot_offset = b.size * 0.5
	create_tween().tween_property(b, "scale", Vector2.ONE * 1.04, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if state == "menu":
		Sfx.play("click", 1.3, -10.0)


## ロゴとメニューの位置（画面の大きさに合わせて毎フレーム計算）。
func _layout() -> void:
	var vp := root.size
	var k := menu_k
	var center_a := Vector2(vp.x * 0.5, 178.0)
	var col_x := clampf(vp.x * 0.25, 300.0, 520.0)
	var center_b := Vector2(col_x, 140.0)
	var s := lerpf(1.0, 0.7, k)
	logo.scale = Vector2(s, s)
	logo.position = center_a.lerp(center_b, k) - logo.pivot_offset
	menu_panel.position = Vector2(col_x - menu_panel.size.x * 0.5, 246.0 + (1.0 - k) * 30.0)
	press_label.position = Vector2(vp.x * 0.5 - press_label.size.x * 0.5, vp.y - 100.0)


# ---------------------------------------------------------------- 構築

func _build() -> void:
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = _make_theme()
	add_child(root)

	# 下端を少し暗くして注意書きを読みやすく
	var shade := TextureRect.new()
	shade.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	shade.offset_top = -86
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shade.stretch_mode = TextureRect.STRETCH_SCALE
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	var sg := Gradient.new()
	sg.set_color(0, Color(0.02, 0.05, 0.14, 0.0))
	sg.set_color(1, Color(0.02, 0.05, 0.14, 0.62))
	var st := GradientTexture2D.new()
	st.gradient = sg
	st.fill_from = Vector2(0, 0)
	st.fill_to = Vector2(0, 1)
	st.width = 4
	st.height = 64
	shade.texture = st
	root.add_child(shade)

	_build_logo()

	press_label = _label("クリック または キーを押してスタート", 27, C_TEXT, 12)
	press_label.add_theme_font_override("font", _bold)
	root.add_child(press_label)

	_build_menu()

	# 足元の注意書き
	var disclaimer := _label("※IDO・NMClawはゲーム内の独自設定です。実在のIDOに時空移動の機能はありません。", 14, Color(0.9, 0.93, 1.0, 0.92), 6)
	disclaimer.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	disclaimer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	disclaimer.grow_horizontal = Control.GROW_DIRECTION_BOTH
	disclaimer.grow_vertical = Control.GROW_DIRECTION_BEGIN
	disclaimer.offset_bottom = -12
	root.add_child(disclaimer)
	var version := _label("企画試作版（序章） v0.6", 15, Color(0.85, 0.9, 1.0, 0.9), 6)
	version.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	version.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	version.grow_vertical = Control.GROW_DIRECTION_BEGIN
	version.offset_right = -20
	version.offset_bottom = -36
	root.add_child(version)

	notice_label = _label("", 20, C_GOLD, 8)
	notice_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	notice_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	notice_label.grow_vertical = Control.GROW_DIRECTION_BEGIN
	notice_label.offset_bottom = -64
	notice_label.modulate.a = 0.0
	root.add_child(notice_label)

	_build_confirm()
	_build_help()


func _build_logo() -> void:
	logo = Control.new()
	logo.size = Vector2(760, 300)
	logo.pivot_offset = logo.size * 0.5
	logo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(logo)

	# 後ろのやわらかな影（空の上でも文字が読めるように）
	var glow := TextureRect.new()
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.position = Vector2(-40, -30)
	glow.size = logo.size + Vector2(80, 60)
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.stretch_mode = TextureRect.STRETCH_SCALE
	var g := Gradient.new()
	g.set_color(0, Color(0.03, 0.08, 0.22, 0.5))
	g.set_color(1, Color(0.03, 0.08, 0.22, 0.0))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(0.5, 0.0)
	gt.width = 128
	gt.height = 64
	glow.texture = gt
	logo.add_child(glow)

	# 時計の目盛りのような回る輪（時間の旅のモチーフ）
	_deco = Control.new()
	_deco.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_deco.size = logo.size
	_deco.draw.connect(_draw_deco)
	logo.add_child(_deco)

	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", -18)
	col.size = logo.size
	logo.add_child(col)

	var title := _logo_label("NEXMAX", 124, 22, Color(1.0, 1.0, 1.0), Color(0.38, 0.76, 1.0), 0)
	col.add_child(title)
	var chron := _logo_label("CHRONICLE", 52, 12, Color(1.0, 0.96, 0.7), Color(1.0, 0.66, 0.2), 16)
	col.add_child(chron)
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 26)
	col.add_child(spacer)
	var sub := _label("―  はじまりの未来  ―", 32, Color(1.0, 1.0, 1.0), 10)
	sub.add_theme_font_override("font", _bold)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(sub)


func _logo_label(text: String, size: int, outline: int, top: Color, bottom: Color, spacing: int) -> Label:
	var fv := FontVariation.new()
	fv.base_font = _font
	fv.variation_embolden = 1.1
	fv.spacing_glyph = spacing
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_override("font", fv)
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", Color.WHITE)
	l.add_theme_constant_override("outline_size", outline)
	l.add_theme_color_override("font_outline_color", C_INK)
	l.add_theme_color_override("font_shadow_color", Color(0.0, 0.02, 0.1, 0.55))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", 7)
	l.add_theme_constant_override("shadow_outline_size", outline + 6)
	# 縦のグラデーションと、ときどき走る光の筋
	var sm := ShaderMaterial.new()
	sm.shader = _logo_shader()
	var asc := _font.get_ascent(size)
	sm.set_shader_parameter("top_col", top)
	sm.set_shader_parameter("bottom_col", bottom)
	sm.set_shader_parameter("y_off", asc - size * 0.74)
	sm.set_shader_parameter("height", size * 0.74)
	sm.set_shader_parameter("width", 760.0)
	sm.set_shader_parameter("phase", 0.0 if spacing == 0 else 0.12)
	l.material = sm
	return l


func _build_menu() -> void:
	menu_panel = _panel(Color(0.04, 0.08, 0.19, 0.8), 20, 20)
	menu_panel.custom_minimum_size = Vector2(440, 0)
	menu_panel.visible = false
	root.add_child(menu_panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	menu_panel.add_child(col)
	descriptions = {
		"new": "最初から冒険をはじめます（2086年から）",
		"continue": "セーブデータがありません",
		"proto": "NMクローの「つかむ・運ぶ・離す」を試す練習場\n（記録はセーブされません）",
		"help": "キーボードとマウスの操作を確認します",
	}
	for entry in MENU:
		var id: String = entry[0]
		var b := Button.new()
		b.text = entry[1]
		b.custom_minimum_size = Vector2(400, 54)
		b.focus_mode = Control.FOCUS_ALL
		b.mouse_entered.connect(func() -> void:
			if not b.disabled and b.focus_mode != Control.FOCUS_NONE:
				b.grab_focus())
		b.focus_entered.connect(_on_focus.bind(id, b))
		b.pressed.connect(func() -> void:
			if state == "menu":
				action.emit(id))
		col.add_child(b)
		buttons[id] = b
	var line := ColorRect.new()
	line.color = Color(0.45, 0.75, 1.0, 0.3)
	line.custom_minimum_size = Vector2(0, 2)
	col.add_child(line)
	desc_label = _label("", 16, C_SUB, 0)
	desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_label.custom_minimum_size = Vector2(400, 46)
	desc_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(desc_label)
	var keys := _label("↑↓ / マウスで選択　Enter / クリックで決定", 13, Color(0.6, 0.7, 0.88), 0)
	keys.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(keys)


func _build_confirm() -> void:
	confirm_layer = _dim_layer()
	var p := _panel(Color(0.04, 0.08, 0.18, 0.97), 20, 26)
	p.custom_minimum_size = Vector2(560, 0)
	_center_in(confirm_layer, p)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 16)
	p.add_child(col)
	var t := _label("はじめから遊びますか？", 28, C_GOLD, 0)
	t.add_theme_font_override("font", _bold)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(t)
	var body := _label("セーブデータがあります。\nはじめから遊ぶと、前回の記録（つづき）は消えてしまいます。", 19, C_TEXT, 0)
	body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(body)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 18)
	col.add_child(row)
	confirm_yes = Button.new()
	confirm_yes.text = "はじめから遊ぶ"
	confirm_yes.custom_minimum_size = Vector2(220, 54)
	confirm_yes.pressed.connect(_close_confirm.bind(true))
	confirm_yes.mouse_entered.connect(confirm_yes.grab_focus)
	row.add_child(confirm_yes)
	confirm_no = Button.new()
	confirm_no.text = "やめる"
	confirm_no.custom_minimum_size = Vector2(220, 54)
	confirm_no.pressed.connect(_close_confirm.bind(false))
	confirm_no.mouse_entered.connect(confirm_no.grab_focus)
	row.add_child(confirm_no)
	# 確認中はこの2つの間だけでフォーカスを回す
	for b in [confirm_yes, confirm_no]:
		var other: Button = confirm_no if b == confirm_yes else confirm_yes
		(b as Button).focus_neighbor_left = (b as Button).get_path_to(other)
		(b as Button).focus_neighbor_right = (b as Button).get_path_to(other)
		(b as Button).focus_neighbor_top = (b as Button).get_path_to(b)
		(b as Button).focus_neighbor_bottom = (b as Button).get_path_to(b)
		(b as Button).focus_next = (b as Button).get_path_to(other)
		(b as Button).focus_previous = (b as Button).get_path_to(other)


func _build_help() -> void:
	help_layer = _dim_layer()
	var p := _panel(Color(0.04, 0.08, 0.18, 0.97), 20, 26)
	_center_in(help_layer, p)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)
	p.add_child(col)
	var t := _label("操作説明", 28, C_GOLD, 0)
	t.add_theme_font_override("font", _bold)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(t)
	var help := RichTextLabel.new()
	help.bbcode_enabled = true
	help.fit_content = true
	help.scroll_active = false
	help.custom_minimum_size = Vector2(620, 0)
	help.add_theme_font_size_override("normal_font_size", 19)
	help.add_theme_font_size_override("bold_font_size", 20)
	help.add_theme_font_override("bold_font", _bold)
	help.add_theme_color_override("default_color", C_TEXT)
	help.text = HudScript.controls_bbcode() + "\n\n[color=#%s]ヒント：Fで調べられる物には、画面にFのマークが出ます。[/color]" % C_SUB.to_html(false)
	col.add_child(help)
	help_close = Button.new()
	help_close.text = "閉じる"
	help_close.custom_minimum_size = Vector2(240, 52)
	help_close.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	help_close.pressed.connect(close_help)
	help_close.focus_neighbor_top = help_close.get_path_to(help_close)
	help_close.focus_neighbor_bottom = help_close.get_path_to(help_close)
	help_close.focus_next = help_close.get_path_to(help_close)
	help_close.focus_previous = help_close.get_path_to(help_close)
	col.add_child(help_close)


func _dim_layer() -> Control:
	var c := ColorRect.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.color = Color(0.01, 0.03, 0.1, 0.6)
	c.mouse_filter = Control.MOUSE_FILTER_STOP
	c.visible = false
	root.add_child(c)
	return c


func _center_in(parent: Control, child: Control) -> void:
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(cc)
	cc.add_child(child)


func _make_theme() -> Theme:
	var th := Theme.new()
	th.default_font = _font
	th.default_font_size = 18
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.09, 0.17, 0.35, 0.94)
	normal.set_corner_radius_all(14)
	normal.set_border_width_all(2)
	normal.border_color = Color(0.4, 0.65, 1.0, 0.55)
	normal.content_margin_left = 18
	normal.content_margin_right = 18
	normal.content_margin_top = 8
	normal.content_margin_bottom = 10
	normal.shadow_color = Color(0.0, 0.02, 0.1, 0.35)
	normal.shadow_size = 4
	normal.shadow_offset = Vector2(0, 3)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.17, 0.33, 0.64, 1.0)
	hover.set_border_width_all(3)
	hover.border_color = C_GOLD
	hover.shadow_color = Color(1.0, 0.8, 0.3, 0.3)
	hover.shadow_size = 10
	hover.shadow_offset = Vector2.ZERO
	var pressed := hover.duplicate() as StyleBoxFlat
	pressed.bg_color = Color(0.32, 0.52, 0.88, 1.0)
	var disabled := normal.duplicate() as StyleBoxFlat
	disabled.bg_color = Color(0.08, 0.11, 0.2, 0.72)
	disabled.border_color = Color(0.45, 0.5, 0.62, 0.35)
	disabled.shadow_size = 0
	th.set_stylebox("normal", "Button", normal)
	th.set_stylebox("hover", "Button", hover)
	th.set_stylebox("focus", "Button", hover)
	th.set_stylebox("pressed", "Button", pressed)
	th.set_stylebox("hover_pressed", "Button", pressed)
	th.set_stylebox("disabled", "Button", disabled)
	th.set_color("font_color", "Button", C_TEXT)
	th.set_color("font_hover_color", "Button", Color.WHITE)
	th.set_color("font_focus_color", "Button", Color(1.0, 0.95, 0.75))
	th.set_color("font_pressed_color", "Button", Color.WHITE)
	th.set_color("font_hover_pressed_color", "Button", Color.WHITE)
	th.set_color("font_disabled_color", "Button", Color(0.55, 0.6, 0.7, 0.8))
	th.set_color("font_outline_color", "Button", C_INK)
	th.set_constant("outline_size", "Button", 4)
	th.set_font("font", "Button", _bold)
	th.set_font_size("font_size", "Button", 24)
	return th


func _panel(bg: Color, radius: int, margin: int) -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(margin)
	sb.content_margin_left = margin + 6
	sb.content_margin_right = margin + 6
	sb.set_border_width_all(2)
	sb.border_color = C_BORDER
	sb.shadow_color = Color(0.0, 0.02, 0.1, 0.4)
	sb.shadow_size = 12
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


func _label(text: String, size: int, color: Color, outline: int) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if outline > 0:
		l.add_theme_constant_override("outline_size", outline)
		l.add_theme_color_override("font_outline_color", Color(0.02, 0.05, 0.15, 0.92))
	return l


## ロゴの後ろの回る目盛り輪。
func _draw_deco() -> void:
	var c := _deco
	var ctr := Vector2(c.size.x * 0.5, c.size.y * 0.42)
	var a0 := _time * 0.25
	var r1 := 196.0
	for i in 60:
		var a := a0 + TAU * i / 60.0
		var long := i % 5 == 0
		var dir := Vector2(cos(a), sin(a) * 0.42)
		var p1 := ctr + dir * r1
		var p2 := ctr + dir * (r1 + (16.0 if long else 7.0))
		c.draw_line(p1, p2, Color(1.0, 0.85, 0.4, 0.75 if long else 0.4), 3.0 if long else 1.5, true)
	# 外側の点線の輪（逆回転）
	var r2 := 232.0
	for i in 36:
		var a := -_time * 0.18 + TAU * i / 36.0
		var b := a + TAU / 36.0 * 0.55
		var pts := PackedVector2Array()
		for k in 5:
			var t := lerpf(a, b, k / 4.0)
			pts.append(ctr + Vector2(cos(t), sin(t) * 0.42) * r2)
		c.draw_polyline(pts, Color(0.45, 0.88, 1.0, 0.45), 2.0, true)


static var _shader_cache: Shader


func _logo_shader() -> Shader:
	if _shader_cache == null:
		_shader_cache = Shader.new()
		_shader_cache.code = """
shader_type canvas_item;
uniform vec4 top_col : source_color = vec4(1.0);
uniform vec4 bottom_col : source_color = vec4(0.4, 0.78, 1.0, 1.0);
uniform float y_off = 0.0;
uniform float height = 100.0;
uniform float width = 700.0;
uniform float phase = 0.0;
varying vec2 lp;
void vertex() {
	lp = VERTEX;
}
void fragment() {
	vec4 c = COLOR;
	float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
	if (lum > 0.55) {
		float t = clamp((lp.y - y_off) / height, 0.0, 1.0);
		vec3 g = mix(top_col.rgb, bottom_col.rgb, smoothstep(0.1, 1.0, t));
		float cyc = fract(TIME / 5.5 - phase);
		float pos = mix(-260.0, width + 260.0, cyc);
		float x = lp.x + (lp.y - y_off) * 0.5;
		float shine = smoothstep(44.0, 0.0, abs(x - pos)) * 0.7;
		c.rgb = g + vec3(shine);
	}
	COLOR = c;
}
"""
	return _shader_cache
