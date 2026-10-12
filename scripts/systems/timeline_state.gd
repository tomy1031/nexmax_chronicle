extends Node
## 保存する世界の進行（仕様 §4.3 / §14.2 TimelineState）。
## ロード時は状態を再計算せず、保存したフラグから再現する。
## future_route_open だけは drawing_confirmed から算出する（P4 タスク定義）。

signal flag_changed(flag: String, value: Variant)

const ERA_EDO := 1726
const ERA_PRESENT := 2026
const ERA_FUTURE := 2086
const ERA_HUB := 0

const SAVE_VERSION := 1

## 仕様で定義された進行フラグ
var gate_repaired := false          # 1726年で水門の修復が完了
var genbei_drawing_found := false   # 源兵衛の絵図が継承された
var drawing_confirmed := false      # 2026年に記録を確認
var current_era := ERA_FUTURE       # 1726 / 2026 / 2086（拠点は 0）

## 序章の進行（物語の段階）
var intro_done := false        # 2086年の冒頭（経路閉鎖からの脱出）を終えた
var met_matsui := false
var met_genbei := false
var gear_placed := false       # 外れた大歯車を軸へ戻した
var met_sora := false
var robots_defeated := 0
var prologue_cleared := false

## 継続データ
var checkpoint := "future_intro"
var equipment := "claw_standard"
var crystals := {}             # crystal_id -> true
var play_time := 0.0

## 試作の計測（仕様 §15.1 テスト観察シート向け）
var metrics := {}

## P4: future_route_open は保存せず drawing_confirmed から算出する。
var future_route_open: bool:
	get:
		return drawing_confirmed

const ROBOTS_TOTAL := 2


func _ready() -> void:
	reset()


func reset() -> void:
	gate_repaired = false
	genbei_drawing_found = false
	drawing_confirmed = false
	current_era = ERA_FUTURE
	intro_done = false
	met_matsui = false
	met_genbei = false
	gear_placed = false
	met_sora = false
	robots_defeated = 0
	prologue_cleared = false
	checkpoint = "future_intro"
	equipment = "claw_standard"
	crystals = {}
	play_time = 0.0
	metrics = {
		"claw_first_success_time": -1.0,
		"claw_misgrabs": 0,
		"claw_grabs": 0,
		"release_too_early": 0,
		"release_person_danger": 0,
		"falls": 0,
		"deaths": 0,
		"ido_found_time": -1.0,
		"time_travels": 0,
	}


func set_flag(flag: String, value: Variant) -> void:
	if not flag in self:
		push_warning("TimelineState: unknown flag %s" % flag)
		return
	if get(flag) == value:
		return
	set(flag, value)
	flag_changed.emit(flag, value)


## 2026年で絵図の記録を確かめる。過去で修復と絵図の継承が済んでいなければ確定しない。
func confirm_drawing() -> bool:
	if drawing_confirmed:
		return true
	if gate_repaired and genbei_drawing_found:
		set_flag("drawing_confirmed", true)
		return true
	return false


func is_robot_combat_cleared() -> bool:
	return robots_defeated >= ROBOTS_TOTAL


func add_metric(key: String, amount: float = 1.0) -> void:
	metrics[key] = float(metrics.get(key, 0.0)) + amount


func mark_metric_time(key: String) -> void:
	if float(metrics.get(key, -1.0)) < 0.0:
		metrics[key] = play_time


func collect_crystal(id: String) -> bool:
	if crystals.has(id):
		return false
	crystals[id] = true
	flag_changed.emit("crystals", crystals.size())
	return true


func crystal_count() -> int:
	return crystals.size()


func to_dict() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"gate_repaired": gate_repaired,
		"genbei_drawing_found": genbei_drawing_found,
		"drawing_confirmed": drawing_confirmed,
		"current_era": current_era,
		"intro_done": intro_done,
		"met_matsui": met_matsui,
		"met_genbei": met_genbei,
		"gear_placed": gear_placed,
		"met_sora": met_sora,
		"robots_defeated": robots_defeated,
		"prologue_cleared": prologue_cleared,
		"checkpoint": checkpoint,
		"equipment": equipment,
		"crystals": crystals.keys(),
		"play_time": play_time,
		"metrics": metrics.duplicate(),
	}


func from_dict(d: Dictionary) -> void:
	reset()
	gate_repaired = bool(d.get("gate_repaired", false))
	genbei_drawing_found = bool(d.get("genbei_drawing_found", false))
	drawing_confirmed = bool(d.get("drawing_confirmed", false))
	current_era = int(d.get("current_era", ERA_FUTURE))
	intro_done = bool(d.get("intro_done", false))
	met_matsui = bool(d.get("met_matsui", false))
	met_genbei = bool(d.get("met_genbei", false))
	gear_placed = bool(d.get("gear_placed", false))
	met_sora = bool(d.get("met_sora", false))
	robots_defeated = int(d.get("robots_defeated", 0))
	prologue_cleared = bool(d.get("prologue_cleared", false))
	checkpoint = str(d.get("checkpoint", "future_intro"))
	equipment = str(d.get("equipment", "claw_standard"))
	crystals = {}
	for id in d.get("crystals", []):
		crystals[str(id)] = true
	play_time = float(d.get("play_time", 0.0))
	var m: Variant = d.get("metrics", {})
	if m is Dictionary:
		for k in m:
			metrics[k] = m[k]
