extends Node3D
## キャラクターモデルの確認用シーン（スクリーンショット撮影用）。EraBase ではない単独シーン。
## 例:
##   godot --path . res://tests/character_preview.tscn                         全員を idle で横一列
##   godot --path . res://tests/character_preview.tscn -- --anim=sig           それぞれの代表アニメ
##   godot --path . res://tests/character_preview.tscn -- --anim=wave --focus=matsui --yaw=30
##   godot --path . res://tests/character_preview.tscn -- --showcase=oharu     1人を全アニメで並べる
## 引数: --anim=名前|sig  --focus=kind  --yaw=度  --pitch=度  --dist=m  --fy=注視点の高さ  --kinds=a,b,c  --showcase=kind  --nonex=1（ネクマックスを隠す）  --count=1（メッシュ数を表示）

const KINDS := ["genbei", "oharu", "matsui", "sora", "villager", "boatman", "doll", "citizen", "helper_bot"]
const SIGNATURE := {
	"genbei": "hammer", "oharu": "fan_go", "matsui": "point", "sora": "cheer", "villager": "walk",
	"boatman": "sit", "doll": "walk", "citizen": "wave", "helper_bot": "work",
}
const ALL_ANIMS := ["idle", "walk", "wave", "hammer", "point", "cheer", "fan_wait", "fan_go", "sit", "work"]

var npcs: Array = []
var nex: Node3D
var cam: Camera3D


func _ready() -> void:
	var args := _args()
	LevelKit.environment(self, Color(0.38, 0.62, 0.95), Color(0.86, 0.9, 1.0), Color(0.42, 0.38, 0.32),
		Color(1.0, 0.96, 0.88), 1.25, Vector3(-48, -30, 0))
	LevelKit.box(self, Vector3(0, -0.1, 0), Vector3(40, 0.2, 20), Color(0.74, 0.68, 0.56), false)
	var kinds: Array = KINDS.duplicate()
	if args.has("kinds"):
		kinds = Array(String(args["kinds"]).split(","))
	var anim_arg: String = args.get("anim", "idle")
	var entries: Array = []  # [kind, anim]
	if args.has("showcase"):
		for a in ALL_ANIMS:
			entries.append([String(args["showcase"]), a])
	else:
		for k in kinds:
			var a := anim_arg
			if anim_arg == "sig":
				a = SIGNATURE.get(k, "idle")
			entries.append([k, a])

	var spacing := 1.05
	var x0 := -spacing * (entries.size()) * 0.5
	# ネクマックス（大きさの基準）
	nex = NexmaxModel.new()
	add_child(nex)
	nex.position = Vector3(x0, 0, 0)
	nex.rotation.y = PI
	if args.has("nonex"):
		nex.queue_free()
		nex = null
	for i in entries.size():
		var e: Array = entries[i]
		var pos := Vector3(x0 + spacing * (i + 1), 0, 0)
		var n := Npc.create(self, e[0], pos, 180.0)
		n.play(e[1])
		npcs.append(n)
		var l := LevelKit.label(self, "%s\n%s" % [CharacterBuilder.display_name(e[0]), e[1]], pos + Vector3(0, 0.01, 0.55), 22, Color(0.15, 0.12, 0.1), false, Vector3(-90, 0, 0))
		l.pixel_size = 0.006

	cam = Camera3D.new()
	cam.fov = 35.0
	add_child(cam)
	var focus_pos := Vector3(0, 0.75, 0)
	var dist := 8.0
	if args.has("focus"):
		var fk: String = args["focus"]
		var fy := 0.95
		if fk in ["oharu", "sora"]:
			fy = 0.75
		elif fk in ["doll", "helper_bot", "nexmax"]:
			fy = 0.4
		for n in npcs:
			if n.kind == fk:
				focus_pos = n.position + Vector3(0, fy, 0)
				break
		if fk == "nexmax":
			focus_pos = nex.position + Vector3(0, 0.6, 0)
		dist = 2.4 if fy > 0.5 else 1.6
	if args.has("fy"):
		focus_pos.y = float(args["fy"])
	if args.has("dist"):
		dist = float(args["dist"])
	var yaw := deg_to_rad(float(args.get("yaw", "0")))
	var pitch := deg_to_rad(float(args.get("pitch", "6")))
	cam.position = focus_pos + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * dist
	cam.position.y = maxf(cam.position.y, 0.15)
	cam.look_at(focus_pos)
	cam.current = true
	if args.has("count"):
		await get_tree().process_frame
		for n in npcs:
			print("MESHCOUNT %s: %d MeshInstance3D (verts=%d)" % [n.kind, _count_meshes(n.model), _count_verts(n.model)])


func _count_meshes(node: Node) -> int:
	var c := 1 if node is MeshInstance3D else 0
	for ch in node.get_children():
		c += _count_meshes(ch)
	return c


func _count_verts(node: Node) -> int:
	var c := 0
	if node is MeshInstance3D and (node as MeshInstance3D).mesh:
		var m := (node as MeshInstance3D).mesh
		for si in m.get_surface_count():
			c += (m.surface_get_arrays(si)[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()
	for ch in node.get_children():
		c += _count_verts(ch)
	return c


func _process(delta: float) -> void:
	if nex and nex.has_method("animate"):
		nex.call("animate", delta, 0.0, true, 0.0, false, false)


func _args() -> Dictionary:
	var d := {}
	for a in OS.get_cmdline_user_args():
		var s := String(a)
		if s.begins_with("--") and s.contains("="):
			var kv := s.substr(2).split("=", true, 1)
			d[kv[0]] = kv[1]
	return d
