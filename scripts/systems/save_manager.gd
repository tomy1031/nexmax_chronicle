extends Node
## セーブスロット1（仕様 §14.2 SaveManager / §17 チェックポイント＋拠点で自動保存）。
## Web版では user:// がブラウザの IndexedDB に保存される。

signal saved

const SAVE_PATH := "user://nexmax_chronicle_slot1.json"
## テストは別のファイルに保存する（遊んでいるセーブを壊さない）
var save_path := SAVE_PATH


func has_save() -> bool:
	return FileAccess.file_exists(save_path)


func save_game() -> bool:
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f == null:
		push_warning("SaveManager: 保存に失敗しました (%s)" % error_string(FileAccess.get_open_error()))
		return false
	f.store_string(JSON.stringify(TimelineState.to_dict(), "  "))
	f.close()
	saved.emit()
	return true


func load_game() -> bool:
	var d := read_save()
	if d.is_empty():
		return false
	TimelineState.from_dict(d)
	return true


func read_save() -> Dictionary:
	if not has_save():
		return {}
	var f := FileAccess.open(save_path, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if parsed is Dictionary:
		return parsed
	push_warning("SaveManager: セーブデータを読み込めませんでした")
	return {}


func delete_save() -> void:
	if has_save():
		DirAccess.remove_absolute(save_path)
