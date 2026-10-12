class_name GatePuzzleLogic
extends RefCounted
## 1726年・からくり水門の協力パズル（仕様 §6.3 / P3 GatePrototype）。
## プレイヤーが大歯車を保持 → 源兵衛が歯止めを調整 → おはるが人（舟）の通過を見張る
## → 合図で離すと水門が安全に閉じる。
## 「操作しなければ進まないが、仲間がいないと成功しない」をロジックで表す。

enum Phase { WAIT_GRAB, ADJUSTING, WAIT_SIGNAL, DONE }
enum Result { NONE, TOO_EARLY, PERSON_IN_DANGER, SUCCESS }

const ADJUST_TIME := 6.0        # 源兵衛が歯止めを調整する時間（保持が必要）
const EARLY_KEEP := 0.5         # 早く離した時に残る調整の割合
const BOAT_SPEED := 2.4         # 舟の速さ (m/s)。上流(+x)から下流(-x)へ
const BOAT_SPAWN_X := 32.0      # 上流の屋根付き水路の奥（プレイヤーからは死角）
const BOAT_DESPAWN_X := -42.0
const DANGER_MIN_X := 5.0       # この範囲に舟がいる間は堰板を下ろせない
const DANGER_MAX_X := 24.0
const BOAT_PERIOD := 16.0       # 舟が来る間隔
const FIRST_SIGNAL_BOAT_X := 21.0  # 調整完了の瞬間に必ず1艘いる（「待って」を学ぶため）

var phase: Phase = Phase.WAIT_GRAB
var progress := 0.0
var holding := false
var boats: Array[float] = []    # 各舟の x 座標
var spawn_timer := 4.0


func grab() -> void:
	holding = true
	if phase == Phase.WAIT_GRAB:
		phase = Phase.ADJUSTING


## 保持をやめた結果を返す。
func release() -> Result:
	if not holding:
		return Result.NONE
	holding = false
	match phase:
		Phase.ADJUSTING:
			progress *= EARLY_KEEP
			phase = Phase.WAIT_GRAB
			return Result.TOO_EARLY
		Phase.WAIT_SIGNAL:
			if is_danger():
				return Result.PERSON_IN_DANGER
			phase = Phase.DONE
			return Result.SUCCESS
	return Result.NONE


## 舟（人）が堰板の危険範囲にいるか。おはるはこれを見張って合図を出す。
func is_danger() -> bool:
	for x in boats:
		if x >= DANGER_MIN_X and x <= DANGER_MAX_X:
			return true
	return false


## 調整が完了した瞬間に true を返す。
func tick(delta: float) -> bool:
	var ratchet_set := false
	# 先に舟を動かしてから完了を判定する（完了直後に「必ず1艘いる」を保証するため）
	if phase != Phase.DONE:
		_update_boats(delta)
	if phase == Phase.ADJUSTING and holding:
		progress = minf(1.0, progress + delta / ADJUST_TIME)
		if progress >= 1.0:
			phase = Phase.WAIT_SIGNAL
			ratchet_set = true
			_ensure_first_signal_boat()
	return ratchet_set


func _update_boats(delta: float) -> void:
	for i in boats.size():
		boats[i] -= BOAT_SPEED * delta
	boats.assign(boats.filter(func(x: float) -> bool: return x > BOAT_DESPAWN_X))
	if phase == Phase.WAIT_GRAB and progress <= 0.0:
		return  # 保持を始めるまでは舟を出さない
	spawn_timer -= delta
	if spawn_timer <= 0.0:
		boats.append(BOAT_SPAWN_X)
		spawn_timer = BOAT_PERIOD


func _ensure_first_signal_boat() -> void:
	# 危険範囲の出口ぎりぎりの舟だけでは「待って」が一瞬で終わるので、しばらく残る舟を用意する
	var lingering := false
	for x in boats:
		if x >= DANGER_MIN_X + 3.0 and x <= DANGER_MAX_X:
			lingering = true
	if not lingering:
		boats.append(FIRST_SIGNAL_BOAT_X)
	# 次の舟まで十分な間隔（合図の窓）を空ける
	spawn_timer = BOAT_PERIOD


func signal_text() -> String:
	match phase:
		Phase.WAIT_GRAB, Phase.ADJUSTING:
			return "見張り中"
		Phase.WAIT_SIGNAL:
			return "待って！ 人がいる" if is_danger() else "今や！ 離して！"
		Phase.DONE:
			return "安全確認よし"
	return ""
