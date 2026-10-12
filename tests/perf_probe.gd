extends Node
## 描画負荷の計測（仕様 §14.4：M1 8GB で 30fps 以上が目標。Web版はさらに厳しい）。
## 実行（ウィンドウあり）: godot --path . res://tests/PerfProbe.tscn -- --shot
## 各シーンを読み込み、数秒後のドローコール・プリミティブ数・オブジェクト数・FPS を表示する。

const SCENES := [
	["res://scenes/ui/Title.tscn", "", ""],
	["res://scenes/eras/Future_Canal.tscn", "future_intro", ""],
	["res://scenes/eras/Future_Canal.tscn", "future_return", "intro_done,gate_repaired,genbei_drawing_found,drawing_confirmed"],
	["res://scenes/eras/Present_Canal.tscn", "present_start", ""],
	["res://scenes/eras/Present_Canal.tscn", "present_ido", "met_matsui,gate_repaired,genbei_drawing_found,drawing_confirmed"],
	["res://scenes/eras/Edo_Canal.tscn", "edo_arrive", ""],
	["res://scenes/hub/DimensionalWorkshop.tscn", "hub_start", "drawing_confirmed"],
	["res://scenes/prototype/ClawPrototype.tscn", "proto_start", ""],
]


func _ready() -> void:
	Game.debug_args["nostory"] = "1"
	var only := str(Game.debug_args.get("only", ""))
	for e in SCENES:
		if only != "" and not str(e[0]).contains(only):
			continue
		TimelineState.reset()
		for f in str(e[2]).split(",", false):
			TimelineState.set(f, true)
		TimeTravel.pending_spawn = e[1]
		var inst: Node = (load(e[0]) as PackedScene).instantiate()
		add_child(inst)
		for i in 150:
			await get_tree().process_frame
		var draws := Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
		var prims := Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
		var objs := Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)
		var nodes := Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
		var mem := Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0
		print("PERF %-46s spawn=%-14s fps=%3d draws=%5d prims=%7d objs=%5d nodes=%5d mem=%.0fMB" % [
			e[0].get_file(), e[1], Engine.get_frames_per_second(), draws, prims, objs, nodes, mem])
		inst.queue_free()
		Hud.reset_for_title()
		await get_tree().process_frame
		await get_tree().process_frame
	get_tree().quit()
