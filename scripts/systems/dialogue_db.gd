class_name DialogueDB
extends RefCounted
## data/dialogues/tutorial_dialogue.json からセリフを読み出す。

const PATH := "res://data/dialogues/tutorial_dialogue.json"

static var _cache: Dictionary = {}


static func lines(key: String) -> Array:
	if _cache.is_empty():
		_load()
	var v: Variant = _cache.get(key, [])
	if v is Array:
		return v
	push_warning("DialogueDB: セリフ %s がありません" % key)
	return []


static func has(key: String) -> bool:
	if _cache.is_empty():
		_load()
	return _cache.has(key)


static func _load() -> void:
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		push_error("DialogueDB: %s を開けません" % PATH)
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary:
		_cache = parsed
	else:
		push_error("DialogueDB: JSON の形式が正しくありません")
