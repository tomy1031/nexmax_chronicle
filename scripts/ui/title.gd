extends Node3D
## タイトル画面。空に浮かぶ小島で手をふるネクマックスを背景に、ロゴとメニューを出す。
## 最初の「クリック／キー入力」でメニューへ進む（Web版の音声の解放とフォーカス取得のため）。
## 検証用: -- --menu でスタート待ちを飛ばす / --panel=help|confirm で各パネルを開く / --nohud で2D表示を隠す。

const TitleBackdrop := preload("res://scripts/ui/title/title_backdrop.gd")
const TitleUI := preload("res://scripts/ui/title/title_ui.gd")

var backdrop: TitleBackdrop
var ui: TitleUI
var _started := false


func _ready() -> void:
	Game.in_gameplay = false
	Game.input_locked = false
	Game.era_scene = null
	Hud.reset_for_title()
	Hud.visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	# 前のシーンの暗転が残っていたら明ける
	if Hud.fade_rect and Hud.fade_rect.visible:
		Hud.fade_in(0.5)

	backdrop = TitleBackdrop.new()
	backdrop.name = "Backdrop"
	add_child(backdrop)
	ui = TitleUI.new()
	ui.name = "TitleUI"
	add_child(ui)
	ui.started.connect(_on_started)
	ui.action.connect(_on_action)
	_refresh_continue()

	var a: Dictionary = Game.debug_args
	if a.has("nohud"):
		ui.visible = false
	if a.has("menu") or a.has("panel"):
		_on_started(false)
	if a.has("panel"):
		await get_tree().create_timer(0.1).timeout
		match str(a.panel):
			"help":
				ui.open_help()
			"confirm":
				ui.ask_overwrite()


func _process(delta: float) -> void:
	if backdrop:
		backdrop.menu_shift = move_toward(backdrop.menu_shift, ui.menu_k, delta * 4.0) if ui else 0.0


func _refresh_continue() -> void:
	if not SaveManager.has_save():
		ui.set_continue_available(false, "セーブデータがありません")
		return
	var d := SaveManager.read_save()
	if d.is_empty():
		ui.set_continue_available(false, "セーブデータを読み込めませんでした")
		return
	var era := int(d.get("current_era", TimelineState.ERA_FUTURE))
	var place: String = TimeTravel.ERA_PLACES.get(era, "")
	var mins := int(float(d.get("play_time", 0.0)) / 60.0)
	ui.set_continue_available(true, "前回のつづき：%s %s（%d分）" % [TimeTravel.era_label(era), place, mins])


func _on_started(animate: bool = true) -> void:
	if _started:
		return
	_started = true
	Sfx.play("ui")
	Sfx.play_music("title")
	ui.show_menu(animate)


func _on_action(id: String) -> void:
	Sfx.play("ui")
	match id:
		"new":
			if SaveManager.has_save():
				var ok: bool = await ui.ask_overwrite()
				if not ok:
					return
			_leave()
			Game.new_game()
		"continue":
			if not SaveManager.has_save():
				ui.show_notice("セーブデータがありません")
				return
			_leave()
			if not Game.continue_game():
				ui.set_busy(false)
				ui.show_notice("セーブデータを読み込めませんでした")
				_refresh_continue()
		"proto":
			_leave()
			Game.open_claw_prototype()
		"help":
			ui.open_help()


## 画面を離れる間はメニューを止め、音楽を消す。
func _leave() -> void:
	ui.set_busy(true)
	Sfx.stop_music()
