class_name Npc
extends Node3D
## 仲間・町の人の振る舞い。高度な追従AIは作らず、決められた地点への移動演出で表す（仕様 §6.2）。

signal arrived

var kind := ""
var display_name := ""
var model: Node3D
var talk: Interactable = null
var face_player := true      # 近くに来たらプレイヤーの方を向く
var anim := "idle"           # "idle" / "walk" / "wave" / "hammer" / "point" / "cheer" / "fan_wait" / "fan_go" / "sit" / "work"
var _walking := false
var _emote: Label3D = null
var _emote_t := 0.0


static func create(parent: Node, p_kind: String, pos: Vector3, yaw_deg: float = 0.0) -> Npc:
	var n := Npc.new()
	n.kind = p_kind
	n.display_name = CharacterBuilder.display_name(p_kind)
	n.position = pos
	n.rotation_degrees.y = yaw_deg
	parent.add_child(n)
	return n


func _ready() -> void:
	model = CharacterBuilder.build(kind)
	add_child(model)


## F で話しかけられるようにする。
func set_talk(prompt_text: String, callback: Callable, p_radius: float = 2.6) -> void:
	clear_talk()
	talk = Interactable.create(self, Vector3.ZERO, prompt_text, callback, p_radius, 2.2)


func clear_talk() -> void:
	if talk:
		talk.queue_free()
		talk = null


## 地点を順にたどって歩く（await できる）。
func walk_to(points: Array, speed: float = 2.4) -> void:
	_walking = true
	var prev_anim := anim
	anim = "walk"
	for pt in points:
		var target: Vector3 = pt
		while is_inside_tree() and global_position.distance_to(target) > 0.08:
			var d := target - global_position
			d.y = 0.0
			if d.length() > 0.05:
				face_towards(target)
			var step := speed * get_process_delta_time()
			global_position = global_position.move_toward(target, step)
			await get_tree().process_frame
	_walking = false
	anim = prev_anim if prev_anim != "walk" else "idle"
	arrived.emit()


func teleport(pos: Vector3, yaw_deg: float) -> void:
	global_position = pos
	rotation_degrees.y = yaw_deg


func face_towards(pos: Vector3) -> void:
	var d := pos - global_position
	d.y = 0.0
	if d.length() > 0.01:
		rotation.y = atan2(-d.x, -d.z)


func play(p_anim: String) -> void:
	anim = p_anim


## 頭上に「！」「？」などを短く出す。
func emote(text: String, secs: float = 1.5) -> void:
	if _emote == null:
		_emote = LevelKit.label(self, "", Vector3(0, 2.3, 0), 96, Color(1.0, 0.9, 0.3), true, Vector3.ZERO, Color(0, 0, 0, 0.8))
		_emote.no_depth_test = true
	_emote.text = text
	_emote.visible = true
	_emote_t = secs


func _process(delta: float) -> void:
	if _emote and _emote_t > 0.0:
		_emote_t -= delta
		_emote.position.y = 2.3 + sin(_emote_t * 10.0) * 0.05
		if _emote_t <= 0.0:
			_emote.visible = false
	if face_player and not _walking and anim in ["idle", "wave", "point", "cheer"]:
		var p := Game.player as Node3D
		if p and p.global_position.distance_to(global_position) < 5.0:
			var d := p.global_position - global_position
			d.y = 0.0
			if d.length() > 0.1:
				rotation.y = lerp_angle(rotation.y, atan2(-d.x, -d.z), 1.0 - exp(-6.0 * delta))
	if model and model.has_method("animate"):
		model.call("animate", delta, _walking, anim)
