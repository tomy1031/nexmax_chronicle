extends CanvasLayer
## クロー練習場の操作カード（画面左に常に表示）。いまやる手順を光らせて、初見でも迷わないようにする。
## HUD（レイヤー10）の会話・パネルが上にかかるよう、レイヤーは 4 にする。

const C_TEXT := Color(0.96, 0.97, 1.0)
const C_SUB := Color(0.72, 0.8, 0.95)
const C_GOLD := Color(1.0, 0.82, 0.25)
const C_CYAN := Color(0.35, 0.9, 1.0)

const STEPS := [
	["右クリック長押し ／ Q", "構えて、光る歯車をねらう"],
	["構えたまま 左クリック ／ E", "つかむ"],
	["光る軸の近くで 左クリック ／ E", "離して、軸にはめる"],
]

var panel: PanelContainer
var _rows: Array[Dictionary] = []
var _step := -1
var _compact := false
var _t := 0.0


func _ready() -> void:
	layer = 4
	_build()
	set_step(0)


func _process(delta: float) -> void:
	_t += delta
	if _step >= 0 and _step < _rows.size():
		var mark: Label = _rows[_step].mark
		mark.modulate.a = 0.6 + 0.4 * sin(_t * 6.0)


## 0 = 構える / 1 = つかむ / 2 = 運んで離す
func set_step(i: int) -> void:
	if i == _step:
		return
	_step = i
	for k in _rows.size():
		var r: Dictionary = _rows[k]
		var on := k == i
		var sb := (r.bg as PanelContainer).get_theme_stylebox("panel") as StyleBoxFlat
		sb.bg_color = Color(0.16, 0.3, 0.58, 0.95) if on else Color(0.06, 0.1, 0.22, 0.6)
		sb.border_color = C_GOLD if on else Color(0.45, 0.75, 1.0, 0.25)
		sb.set_border_width_all(3 if on else 1)
		(r.mark as Label).text = "▶" if on else ""
		(r.key as Label).add_theme_color_override("font_color", C_CYAN if on else Color(0.55, 0.68, 0.85))
		(r.text as Label).add_theme_color_override("font_color", C_TEXT if on else Color(0.75, 0.8, 0.9))
		(r.num as Label).add_theme_color_override("font_color", C_GOLD if on else Color(0.55, 0.62, 0.78))


## 一度成功したら小さくする（邪魔にならないように）。
func set_compact(v: bool) -> void:
	if v == _compact:
		return
	_compact = v
	var tw := create_tween().set_parallel(true)
	tw.tween_property(panel, "scale", Vector2.ONE * (0.8 if v else 1.0), 0.35).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(panel, "modulate:a", 0.82 if v else 1.0, 0.35)


func _build() -> void:
	var font := LevelKit.font()
	var bold := FontVariation.new()
	bold.base_font = font
	bold.variation_embolden = 0.8
	panel = PanelContainer.new()
	panel.position = Vector2(22, 158)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.08, 0.19, 0.84)
	sb.set_corner_radius_all(16)
	sb.set_content_margin_all(14)
	sb.set_border_width_all(2)
	sb.border_color = Color(0.45, 0.75, 1.0, 0.55)
	sb.shadow_color = Color(0, 0.02, 0.1, 0.35)
	sb.shadow_size = 8
	panel.add_theme_stylebox_override("panel", sb)
	add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)
	var title := _label("NMクローの使い方", 21, C_GOLD, bold)
	col.add_child(title)
	for i in STEPS.size():
		var bg := PanelContainer.new()
		bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var rsb := StyleBoxFlat.new()
		rsb.set_corner_radius_all(10)
		rsb.set_content_margin_all(8)
		rsb.content_margin_left = 10
		bg.add_theme_stylebox_override("panel", rsb)
		col.add_child(bg)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		bg.add_child(row)
		var num := _label(str(i + 1), 30, C_GOLD, bold)
		num.custom_minimum_size = Vector2(26, 0)
		num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		row.add_child(num)
		var tcol := VBoxContainer.new()
		tcol.add_theme_constant_override("separation", -2)
		tcol.custom_minimum_size = Vector2(290, 0)
		row.add_child(tcol)
		var key := _label(STEPS[i][0], 16, C_CYAN, bold)
		tcol.add_child(key)
		var text := _label(STEPS[i][1], 20, C_TEXT, null)
		tcol.add_child(text)
		var mark := _label("", 22, C_GOLD, bold)
		mark.custom_minimum_size = Vector2(22, 0)
		mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		row.add_child(mark)
		_rows.append({"bg": bg, "num": num, "key": key, "text": text, "mark": mark})
	var foot := _label("・保持中は構えを離しても落とさない\n・遠くで離しても、歯車はすぐ元の場所へ戻る", 14, C_SUB, null)
	col.add_child(foot)


func _label(text: String, size: int, color: Color, font: Font) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if font:
		l.add_theme_font_override("font", font)
	return l
