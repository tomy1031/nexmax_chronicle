extends SceneTree
## ユニットテスト（純粋ロジックのみ）。
## 実行: godot --headless --path . -s res://tests/run_tests.gd
## 全テスト合格で終了コード 0、1つでも失敗すれば 1。
##
## -s モードでは Autoload（TimelineState など）が使えないため、スクリプトを直接 load() して検証する。
## TimelineState を参照する QuestDirector はここでは扱わない（シーンを動かす SmokeTest 側で確認）。
##
## 書き方: 各テスト関数は検証を _check/_eq/_near で積み、最後に `return true` を返す。
## ランタイムエラーで途中終了した関数は true を返さないので、失敗として扱われる。
##
## 既知の問題（仕様と挙動のずれを見つけたが、このタスクでは本体を直さないもの）は
## _run_known_issue() に置く。失敗しても終了コードには影響せず「KNOWN」と表示される。
## 直ったら FIXED と表示されるので、通常テスト（_run）へ移すこと。

const CLAW_PATH := "res://scripts/systems/claw_state_machine.gd"
const GATE_PATH := "res://scripts/systems/gate_puzzle_logic.gd"
const TIMELINE_PATH := "res://scripts/systems/timeline_state.gd"

var _passed := 0
var _failed := 0
var _known := 0
var _fixed := 0
var _errors: Array[String] = []

var _claw_script: GDScript
var _gate_script: GDScript
var _timeline_script: GDScript


func _initialize() -> void:
	print("=== NEXMAX CHRONICLE unit tests ===")
	_claw_script = _load_script(CLAW_PATH)
	_gate_script = _load_script(GATE_PATH)
	_timeline_script = _load_script(TIMELINE_PATH)

	if _claw_script != null:
		print("--- ClawStateMachine ---")
		_run("claw: 初期状態は IDLE / タイマー0 / busyでない", _claw_initial_state)
		_run("claw: state_name が全状態の名前を返す", _claw_state_names)
		_run("claw: begin_aim は IDLE からのみ AIMING にできる", _claw_begin_aim)
		_run("claw: end_aim は AIMING からのみ IDLE に戻れる", _claw_end_aim)
		_run("claw: 対象なしの try_grab は失敗して AIMING のまま", _claw_grab_without_target)
		_run("claw: try_grab は AIMING 中かつ対象ありのときだけ成功", _claw_grab_preconditions)
		_run("claw: GRABBING は GRAB_TIME 経過で HOLDING になり HOLD_STARTED を1回返す", _claw_grab_to_hold)
		_run("claw: HOLDING は構えを離しても時間が経っても維持される", _claw_holding_persists)
		_run("claw: release は HOLDING / GRABBING からのみ RELEASING にできる", _claw_release_preconditions)
		_run("claw: RELEASING 完了時 aim_held で AIMING / IDLE に分かれ RELEASE_FINISHED", _claw_release_finish)
		_run("claw: 1周 IDLE→AIMING→GRABBING→HOLDING→RELEASING→IDLE", _claw_full_cycle)
		_run("claw: tick は IDLE / AIMING では何も起こさない", _claw_tick_idle_noop)
		_run("claw: is_busy は GRABBING / HOLDING / RELEASING のとき true", _claw_is_busy)
		_run("claw: reset で IDLE / タイマー0 に戻る", _claw_reset)

	if _gate_script != null:
		print("--- GatePuzzleLogic ---")
		_run("gate: 初期状態（WAIT_GRAB / 進捗0 / 舟なし）", _gate_initial_state)
		_run("gate: 最初の grab までは舟が出ない・進まない", _gate_no_boats_before_first_grab)
		_run("gate: grab で ADJUSTING に入る", _gate_grab_starts_adjusting)
		_run("gate: 保持している間だけ進捗が進む", _gate_progress_while_holding)
		_run("gate: ADJUST_TIME 保持で完了（tick が true を1回だけ返す）→ WAIT_SIGNAL", _gate_adjust_completes_once)
		_run("gate: 調整完了の瞬間に危険範囲へ必ず舟がいる（待機時間を変えても）", _gate_boat_guaranteed_in_danger_zone)
		_run("gate: 既に危険範囲に舟がいれば追加で出さない", _gate_no_extra_boat_when_already_danger)
		_run("gate: 早く離す（ADJUSTING）と TOO_EARLY・進捗半減・WAIT_GRAB", _gate_release_too_early)
		_run("gate: 進捗0で離しても TOO_EARLY で WAIT_GRAB に戻る", _gate_release_too_early_at_zero)
		_run("gate: 保持していない release は NONE", _gate_release_not_holding)
		_run("gate: 危険中の release は PERSON_IN_DANGER（WAIT_SIGNAL のまま・holding=false）", _gate_release_in_danger)
		_run("gate: つかみ直して安全になってから離すと SUCCESS → DONE", _gate_regrab_then_success)
		_run("gate: DONE は終端（舟が止まり release は NONE）", _gate_done_is_terminal)
		_run("gate: signal_text が各状態の文言を返す", _gate_signal_text)
		_run("gate: 危険範囲の境界（5.0〜24.0 を含む）", _gate_danger_boundaries)
		_run("gate: 舟は -x 方向へ BOAT_SPEED で進む", _gate_boats_move)
		_run("gate: 舟は BOAT_DESPAWN_X を過ぎると消える", _gate_boats_despawn)
		_run("gate: 舟は spawn_timer 経過で BOAT_SPAWN_X に出現し BOAT_PERIOD で再装填", _gate_boats_spawn)
		_run("gate: 調整完了と同じtickで舟が危険範囲外へ出ても、完了直後は危険範囲に舟がいる",
				_gate_known_boat_leaves_zone_same_tick)

	if _timeline_script != null:
		print("--- TimelineState ---")
		_run("timeline: 初期値（フラグ false / era 2086 / 装備・チェックポイント既定）", _timeline_defaults)
		_run("timeline: metrics の既定キー", _timeline_default_metrics)
		_run("timeline: confirm_drawing は gate_repaired と genbei_drawing_found が両方必要", _timeline_confirm_requires_both)
		_run("timeline: confirm_drawing 成功で drawing_confirmed と future_route_open が立つ", _timeline_confirm_success)
		_run("timeline: confirm_drawing は冪等で flag_changed を1回だけ出す", _timeline_confirm_idempotent)
		_run("timeline: future_route_open は drawing_confirmed から算出され to_dict に入らない", _timeline_future_route_derived)
		_run("timeline: set_flag は未知のフラグを無視する", _timeline_set_flag_unknown)
		_run("timeline: set_flag は変化したときだけ flag_changed を出す", _timeline_set_flag_signal)
		_run("timeline: collect_crystal は重複で false・件数は増えない", _timeline_collect_crystal)
		_run("timeline: add_metric / mark_metric_time", _timeline_metrics_helpers)
		_run("timeline: is_robot_combat_cleared は ROBOTS_TOTAL 体で true", _timeline_robot_cleared)
		_run("timeline: to_dict の形（version / 配列化した crystals / metrics は複製）", _timeline_to_dict_shape)
		_run("timeline: セーブ→JSON→ロードで全フラグ・進行・計測が一致（P4 受け入れ基準）", _timeline_json_roundtrip)
		_run("timeline: 絵図確定後のセーブ／ロードで future_route_open が一貫する", _timeline_roundtrip_route_consistency)
		_run("timeline: 確定前のセーブをロードしても確定は再計算されず、後から confirm できる", _timeline_roundtrip_unconfirmed)
		_run("timeline: from_dict は不足キーを既定値にし、既存状態を引きずらない", _timeline_from_dict_defaults)
		_run("timeline: from_dict は保存された future_route_open を信用しない", _timeline_from_dict_ignores_route_key)

	print("")
	print("=== SUMMARY: %d passed, %d failed, %d known-issue(s) still failing, %d known-issue(s) fixed ===" % [
			_passed, _failed, _known, _fixed])
	if _failed == 0:
		print("RESULT: PASS")
	else:
		print("RESULT: FAIL")
	quit(0 if _failed == 0 else 1)


# ---------------------------------------------------------------------------
# テスト実行の土台
# ---------------------------------------------------------------------------

func _load_script(path: String) -> GDScript:
	var s := load(path) as GDScript
	if s == null or not s.can_instantiate():
		_failed += 1
		print("[FAIL] スクリプトを読み込めない: %s" % path)
		return null
	return s


func _run(test_name: String, test: Callable) -> void:
	_errors.clear()
	var finished: Variant = test.call()
	if finished != true:
		_errors.append("テスト関数が最後まで実行されなかった（ランタイムエラーの可能性）")
	if _errors.is_empty():
		_passed += 1
		print("[PASS] %s" % test_name)
	else:
		_failed += 1
		print("[FAIL] %s" % test_name)
		for e in _errors:
			print("         - %s" % e)


func _run_known_issue(test_name: String, test: Callable) -> void:
	_errors.clear()
	var finished: Variant = test.call()
	if finished != true:
		_errors.append("テスト関数が最後まで実行されなかった（ランタイムエラーの可能性）")
	if _errors.is_empty():
		_fixed += 1
		print("[FIXED] %s  ← 解消している。通常テスト(_run)へ移すこと" % test_name)
	else:
		_known += 1
		print("[KNOWN] %s" % test_name)
		for e in _errors:
			print("         - %s" % e)


func _check(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)


func _eq(actual: Variant, expected: Variant, message: String) -> void:
	if typeof(actual) != typeof(expected) or actual != expected:
		_errors.append("%s (expected=%s, actual=%s)" % [message, str(expected), str(actual)])


func _near(actual: float, expected: float, message: String, eps := 0.0001) -> void:
	if absf(actual - expected) > eps:
		_errors.append("%s (expected=%s, actual=%s)" % [message, str(expected), str(actual)])


# ---------------------------------------------------------------------------
# ClawStateMachine
# ---------------------------------------------------------------------------

func _claw():
	return _claw_script.new()


func _claw_state(sm) -> String:
	return _claw_script.state_name(sm.state)


## 構え→つかみ→HOLDING まで進めた状態機械を返す。
func _claw_in_holding():
	var sm = _claw()
	sm.begin_aim()
	sm.try_grab(true)
	sm.tick(_claw_script.GRAB_TIME + 0.01, true)
	return sm


func _claw_initial_state() -> bool:
	var sm = _claw()
	_eq(sm.state, _claw_script.State.IDLE, "初期状態は IDLE")
	_near(sm.timer, 0.0, "タイマーは0")
	_check(not sm.is_busy(), "初期状態は busy でない")
	return true


func _claw_state_names() -> bool:
	var S = _claw_script.State
	_eq(_claw_script.state_name(S.IDLE), "IDLE", "IDLE")
	_eq(_claw_script.state_name(S.AIMING), "AIMING", "AIMING")
	_eq(_claw_script.state_name(S.GRABBING), "GRABBING", "GRABBING")
	_eq(_claw_script.state_name(S.HOLDING), "HOLDING", "HOLDING")
	_eq(_claw_script.state_name(S.RELEASING), "RELEASING", "RELEASING")
	return true


func _claw_begin_aim() -> bool:
	var S = _claw_script.State
	var sm = _claw()
	_check(sm.begin_aim(), "IDLE から begin_aim は成功")
	_eq(sm.state, S.AIMING, "begin_aim 後は AIMING")
	_check(not sm.begin_aim(), "AIMING 中の begin_aim は失敗")
	# 他の状態からは構えられない
	sm = _claw()
	sm.begin_aim()
	sm.try_grab(true)
	_eq(sm.state, S.GRABBING, "前提: GRABBING")
	_check(not sm.begin_aim(), "GRABBING 中の begin_aim は失敗")
	_eq(sm.state, S.GRABBING, "GRABBING のまま")
	sm = _claw_in_holding()
	_check(not sm.begin_aim(), "HOLDING 中の begin_aim は失敗")
	_eq(sm.state, S.HOLDING, "HOLDING のまま")
	sm.release()
	_check(not sm.begin_aim(), "RELEASING 中の begin_aim は失敗")
	_eq(sm.state, S.RELEASING, "RELEASING のまま")
	return true


func _claw_end_aim() -> bool:
	var S = _claw_script.State
	var sm = _claw()
	_check(not sm.end_aim(), "IDLE での end_aim は失敗")
	_eq(sm.state, S.IDLE, "IDLE のまま")
	sm.begin_aim()
	_check(sm.end_aim(), "AIMING からの end_aim は成功")
	_eq(sm.state, S.IDLE, "IDLE に戻る")
	# つかみ中・保持中は構えをやめても状態を変えない
	sm = _claw()
	sm.begin_aim()
	sm.try_grab(true)
	_check(not sm.end_aim(), "GRABBING 中の end_aim は失敗")
	_eq(sm.state, S.GRABBING, "GRABBING のまま")
	sm = _claw_in_holding()
	_check(not sm.end_aim(), "HOLDING 中の end_aim は失敗")
	_eq(sm.state, S.HOLDING, "HOLDING のまま")
	sm.release()
	_check(not sm.end_aim(), "RELEASING 中の end_aim は失敗")
	_eq(sm.state, S.RELEASING, "RELEASING のまま")
	return true


func _claw_grab_without_target() -> bool:
	var S = _claw_script.State
	var sm = _claw()
	sm.begin_aim()
	_check(not sm.try_grab(false), "対象なしの try_grab は失敗")
	_eq(sm.state, S.AIMING, "失敗しても AIMING のまま")
	_check(not sm.is_busy(), "失敗後は busy でない")
	# 失敗しても構えは続けられ、対象が見つかればすぐつかめる
	_check(sm.try_grab(true), "その後、対象ありなら成功")
	_eq(sm.state, S.GRABBING, "GRABBING へ")
	return true


func _claw_grab_preconditions() -> bool:
	var S = _claw_script.State
	var sm = _claw()
	_check(not sm.try_grab(true), "構えていない（IDLE）ときは対象があっても失敗")
	_eq(sm.state, S.IDLE, "IDLE のまま")
	sm.begin_aim()
	_check(sm.try_grab(true), "AIMING + 対象ありで成功")
	_eq(sm.state, S.GRABBING, "GRABBING")
	_near(sm.timer, _claw_script.GRAB_TIME, "タイマーは GRAB_TIME")
	_check(not sm.try_grab(true), "GRABBING 中の再 try_grab は失敗")
	sm = _claw_in_holding()
	_check(not sm.try_grab(true), "HOLDING 中の try_grab は失敗")
	_eq(sm.state, S.HOLDING, "HOLDING のまま")
	return true


func _claw_grab_to_hold() -> bool:
	var S = _claw_script.State
	var E = _claw_script.Event
	var sm = _claw()
	sm.begin_aim()
	sm.try_grab(true)
	# GRAB_TIME(0.18) に満たない tick では GRABBING のまま
	_eq(sm.tick(0.1, true), E.NONE, "0.1s では NONE")
	_eq(sm.state, S.GRABBING, "0.1s では GRABBING")
	# 累計で GRAB_TIME を超えたら HOLDING
	_eq(sm.tick(0.1, true), E.HOLD_STARTED, "累計0.2sで HOLD_STARTED")
	_eq(sm.state, S.HOLDING, "HOLDING になる")
	# イベントは1回だけ
	_eq(sm.tick(0.1, true), E.NONE, "2回目の tick は NONE")
	# 1フレームで大きく進んでも HOLDING になる
	sm = _claw()
	sm.begin_aim()
	sm.try_grab(true)
	_eq(sm.tick(1.0, true), E.HOLD_STARTED, "大きな delta でも HOLD_STARTED")
	_eq(sm.state, S.HOLDING, "HOLDING")
	# 構えを離していても（aim_held=false）GRABBING は進行して HOLDING になる
	sm = _claw()
	sm.begin_aim()
	sm.try_grab(true)
	_eq(sm.tick(1.0, false), E.HOLD_STARTED, "aim_held=false でも HOLD_STARTED")
	_eq(sm.state, S.HOLDING, "HOLDING")
	return true


func _claw_holding_persists() -> bool:
	var S = _claw_script.State
	var E = _claw_script.Event
	var sm = _claw_in_holding()
	_eq(sm.state, S.HOLDING, "前提: HOLDING")
	for i in 30:
		_eq(sm.tick(1.0, false), E.NONE, "保持中の tick は NONE")
	_eq(sm.state, S.HOLDING, "構えを離して長時間経っても HOLDING（再クリックで離すまで維持）")
	_check(sm.is_busy(), "保持中は busy")
	return true


func _claw_release_preconditions() -> bool:
	var S = _claw_script.State
	var sm = _claw()
	_check(not sm.release(), "IDLE での release は失敗")
	_eq(sm.state, S.IDLE, "IDLE のまま")
	sm.begin_aim()
	_check(not sm.release(), "AIMING での release は失敗")
	_eq(sm.state, S.AIMING, "AIMING のまま")
	# GRABBING からの強制解除は可能
	sm.try_grab(true)
	_check(sm.release(), "GRABBING からの release は成功")
	_eq(sm.state, S.RELEASING, "RELEASING")
	_near(sm.timer, _claw_script.RELEASE_TIME, "タイマーは RELEASE_TIME")
	_check(not sm.release(), "RELEASING 中の release は失敗")
	# HOLDING からの release
	sm = _claw_in_holding()
	_check(sm.release(), "HOLDING からの release は成功")
	_eq(sm.state, S.RELEASING, "RELEASING")
	_near(sm.timer, _claw_script.RELEASE_TIME, "タイマーは RELEASE_TIME")
	return true


func _claw_release_finish() -> bool:
	var S = _claw_script.State
	var E = _claw_script.Event
	# 構えを続けている → AIMING に戻る
	var sm = _claw_in_holding()
	sm.release()
	_eq(sm.tick(0.05, true), E.NONE, "RELEASE_TIME 未満では NONE")
	_eq(sm.state, S.RELEASING, "RELEASING のまま")
	_eq(sm.tick(0.2, true), E.RELEASE_FINISHED, "RELEASE_FINISHED")
	_eq(sm.state, S.AIMING, "aim_held=true なら AIMING")
	# 構えを離している → IDLE に戻る
	sm = _claw_in_holding()
	sm.release()
	_eq(sm.tick(0.3, false), E.RELEASE_FINISHED, "RELEASE_FINISHED")
	_eq(sm.state, S.IDLE, "aim_held=false なら IDLE")
	# 2回目の tick ではイベントが出ない
	_eq(sm.tick(0.3, false), E.NONE, "完了後は NONE")
	return true


func _claw_full_cycle() -> bool:
	var S = _claw_script.State
	var E = _claw_script.Event
	var sm = _claw()
	_eq(sm.state, S.IDLE, "IDLE")
	_check(sm.begin_aim(), "構える")
	_eq(sm.state, S.AIMING, "AIMING")
	_check(sm.try_grab(true), "つかむ")
	_eq(sm.state, S.GRABBING, "GRABBING")
	_eq(sm.tick(_claw_script.GRAB_TIME, true), E.HOLD_STARTED, "保持開始")
	_eq(sm.state, S.HOLDING, "HOLDING")
	_check(sm.release(), "離す")
	_eq(sm.state, S.RELEASING, "RELEASING")
	_eq(sm.tick(_claw_script.RELEASE_TIME, false), E.RELEASE_FINISHED, "解除完了")
	_eq(sm.state, S.IDLE, "IDLE に戻る")
	# もう一周できる（失敗後すぐ再挑戦可能）
	_check(sm.begin_aim(), "2周目も構えられる")
	_check(sm.try_grab(true), "2周目もつかめる")
	return true


func _claw_tick_idle_noop() -> bool:
	var S = _claw_script.State
	var E = _claw_script.Event
	var sm = _claw()
	_eq(sm.tick(10.0, false), E.NONE, "IDLE の tick は NONE")
	_eq(sm.state, S.IDLE, "IDLE のまま")
	sm.begin_aim()
	_eq(sm.tick(10.0, true), E.NONE, "AIMING の tick は NONE")
	_eq(sm.state, S.AIMING, "AIMING のまま")
	return true


func _claw_is_busy() -> bool:
	var sm = _claw()
	_check(not sm.is_busy(), "IDLE は busy でない")
	sm.begin_aim()
	_check(not sm.is_busy(), "AIMING は busy でない")
	sm.try_grab(true)
	_check(sm.is_busy(), "GRABBING は busy")
	sm.tick(1.0, true)
	_check(sm.is_busy(), "HOLDING は busy")
	sm.release()
	_check(sm.is_busy(), "RELEASING は busy")
	sm.tick(1.0, false)
	_check(not sm.is_busy(), "IDLE に戻れば busy でない")
	return true


func _claw_reset() -> bool:
	var sm = _claw_in_holding()
	sm.reset()
	_eq(sm.state, _claw_script.State.IDLE, "reset で IDLE")
	_near(sm.timer, 0.0, "reset でタイマー0")
	_check(sm.begin_aim(), "reset 後は構えられる")
	return true


# ---------------------------------------------------------------------------
# GatePuzzleLogic
# ---------------------------------------------------------------------------

func _gate():
	return _gate_script.new()


## 保持を続けて調整完了まで進める。完了した tick で true が返った回数と、経過時間を返す。
func _gate_hold_until_ratchet(p, step: float = 1.0 / 60.0, limit_seconds: float = 30.0) -> Dictionary:
	var elapsed := 0.0
	var completions := 0
	while elapsed < limit_seconds:
		var done: bool = p.tick(step)
		elapsed += step
		if done:
			completions += 1
			break
	return {"elapsed": elapsed, "completions": completions}


## WAIT_SIGNAL まで進めたパズルを返す（舟は必ず危険範囲にいる）。
func _gate_in_wait_signal():
	var p = _gate()
	p.grab()
	_gate_hold_until_ratchet(p)
	return p


func _gate_initial_state() -> bool:
	var p = _gate()
	_eq(p.phase, _gate_script.Phase.WAIT_GRAB, "phase は WAIT_GRAB")
	_near(p.progress, 0.0, "progress は 0")
	_check(not p.holding, "holding は false")
	_check(p.boats.is_empty(), "舟はいない")
	_check(not p.is_danger(), "危険ではない")
	return true


func _gate_no_boats_before_first_grab() -> bool:
	var p = _gate()
	var any_done := false
	for i in 120:
		if p.tick(1.0):
			any_done = true
	_check(not any_done, "grab 前に調整完了は起きない")
	_check(p.boats.is_empty(), "120秒経っても grab 前は舟が出ない")
	_eq(p.phase, _gate_script.Phase.WAIT_GRAB, "phase は WAIT_GRAB のまま")
	_near(p.progress, 0.0, "進捗は 0 のまま")
	_near(p.spawn_timer, 4.0, "spawn_timer も減らない")
	return true


func _gate_grab_starts_adjusting() -> bool:
	var p = _gate()
	p.grab()
	_check(p.holding, "holding が true")
	_eq(p.phase, _gate_script.Phase.ADJUSTING, "ADJUSTING に入る")
	p.grab()  # 二重 grab は無害
	_eq(p.phase, _gate_script.Phase.ADJUSTING, "二重 grab でも ADJUSTING")
	_check(p.holding, "二重 grab でも holding")
	return true


func _gate_progress_while_holding() -> bool:
	var p = _gate()
	p.grab()
	_check(not p.tick(3.0), "半分では完了しない")
	_near(p.progress, 0.5, "3秒保持で進捗 0.5")
	_eq(p.phase, _gate_script.Phase.ADJUSTING, "まだ ADJUSTING")
	# 保持していなければ進まない
	p.holding = false
	p.tick(2.0)
	_near(p.progress, 0.5, "holding=false の間は進捗が進まない")
	return true


func _gate_adjust_completes_once() -> bool:
	var P = _gate_script.Phase
	var p = _gate()
	p.grab()
	var completions := 0
	var elapsed := 0.0
	var completed_at := -1.0
	var step := 1.0 / 60.0
	for i in int(_gate_script.ADJUST_TIME / step) + 600:
		var done: bool = p.tick(step)
		elapsed += step
		if done:
			completions += 1
			completed_at = elapsed
	_eq(completions, 1, "tick が true を返すのは1回だけ")
	# ADJUST_TIME ちょうど（浮動小数の誤差で最大1フレーム遅れてよい）
	_check(completed_at >= _gate_script.ADJUST_TIME - step and completed_at <= _gate_script.ADJUST_TIME + step * 2.0,
			"完了は ADJUST_TIME(%.1fs) 付近（実際 %.3fs）" % [_gate_script.ADJUST_TIME, completed_at])
	_eq(p.phase, P.WAIT_SIGNAL, "WAIT_SIGNAL に移る")
	_near(p.progress, 1.0, "進捗は 1.0")
	_check(p.holding, "完了しても holding は維持")
	# 1回の大きな tick でも完了する
	p = _gate()
	p.grab()
	_check(p.tick(_gate_script.ADJUST_TIME), "ADJUST_TIME ぶんの1tickで完了")
	_eq(p.phase, P.WAIT_SIGNAL, "WAIT_SIGNAL")
	_near(p.progress, 1.0, "進捗は 1.0（上限）")
	_check(not p.tick(1.0), "完了後の tick は false")
	return true


func _gate_boat_guaranteed_in_danger_zone() -> bool:
	var P = _gate_script.Phase
	# 1) 素直に保持し続けた場合
	var p = _gate_in_wait_signal()
	_eq(p.phase, P.WAIT_SIGNAL, "前提: WAIT_SIGNAL")
	_check(p.is_danger(), "素直に保持: 完了時に危険範囲へ舟がいる")
	# 2) 途中で離して待ち時間を変えてからつかみ直した場合（舟の出現タイミングがずれる）
	var failures: Array[String] = []
	var wait := 0.0
	while wait <= 40.0:
		var q = _gate()
		q.grab()
		q.tick(3.0)
		q.release()
		var waited := 0.0
		while waited < wait:
			q.tick(0.25)
			waited += 0.25
		q.grab()
		var r := _gate_hold_until_ratchet(q)
		if q.phase != P.WAIT_SIGNAL:
			failures.append("wait=%.2f: WAIT_SIGNAL に入らなかった" % wait)
		elif not q.is_danger():
			failures.append("wait=%.2f: 完了時に危険範囲に舟がいない boats=%s" % [wait, str(q.boats)])
		elif r["completions"] != 1:
			failures.append("wait=%.2f: 完了イベントが %d 回" % [wait, r["completions"]])
		wait += 0.5
	_check(failures.is_empty(), "待機時間を変えると舟が危険範囲にいないことがある: %s" % str(failures.slice(0, 3)))
	return true


func _gate_no_extra_boat_when_already_danger() -> bool:
	var p = _gate()
	p.grab()
	p.spawn_timer = 1000.0
	p.boats.append(23.0)  # 既に危険範囲にいる（完了tickの移動後も範囲内に残る位置）
	_check(p.tick(_gate_script.ADJUST_TIME), "調整完了")
	_eq(p.boats.size(), 1, "舟は増えない")
	_check(p.is_danger(), "危険のまま")
	_near(p.spawn_timer, _gate_script.BOAT_PERIOD, "次の舟まで BOAT_PERIOD をまるごと空ける（合図の窓を保証）")
	return true


func _gate_release_too_early() -> bool:
	var P = _gate_script.Phase
	var R = _gate_script.Result
	var p = _gate()
	p.grab()
	p.tick(3.0)
	_near(p.progress, 0.5, "前提: 進捗 0.5")
	_eq(p.release(), R.TOO_EARLY, "早く離すと TOO_EARLY")
	_near(p.progress, 0.25, "進捗は半分(EARLY_KEEP)になる")
	_eq(p.phase, P.WAIT_GRAB, "WAIT_GRAB に戻る")
	_check(not p.holding, "holding は false")
	# つかみ直すと残った進捗から再開できる
	p.grab()
	_eq(p.phase, P.ADJUSTING, "つかみ直しで ADJUSTING")
	_near(p.progress, 0.25, "進捗は保持される")
	_check(not p.tick(4.0), "あと 4.5秒 必要なので 4.0 秒ではまだ完了しない")
	_check(p.tick(0.5), "合計 4.5 秒で完了")
	_eq(p.phase, P.WAIT_SIGNAL, "WAIT_SIGNAL")
	return true


func _gate_release_too_early_at_zero() -> bool:
	var P = _gate_script.Phase
	var R = _gate_script.Result
	var p = _gate()
	p.grab()
	_eq(p.release(), R.TOO_EARLY, "つかんですぐ離しても TOO_EARLY")
	_near(p.progress, 0.0, "進捗は 0 のまま")
	_eq(p.phase, P.WAIT_GRAB, "WAIT_GRAB")
	return true


func _gate_release_not_holding() -> bool:
	var R = _gate_script.Result
	var p = _gate()
	_eq(p.release(), R.NONE, "つかんでいないときの release は NONE")
	p.grab()
	p.release()
	_eq(p.release(), R.NONE, "離した直後の再 release も NONE")
	return true


func _gate_release_in_danger() -> bool:
	var P = _gate_script.Phase
	var R = _gate_script.Result
	var p = _gate_in_wait_signal()
	_check(p.is_danger(), "前提: 危険")
	_eq(p.release(), R.PERSON_IN_DANGER, "危険中に離すと PERSON_IN_DANGER")
	_eq(p.phase, P.WAIT_SIGNAL, "phase は WAIT_SIGNAL のまま")
	_check(not p.holding, "holding は false")
	_near(p.progress, 1.0, "進捗は保持される")
	_eq(p.release(), R.NONE, "離した状態での再 release は NONE")
	return true


func _gate_regrab_then_success() -> bool:
	var P = _gate_script.Phase
	var R = _gate_script.Result
	var p = _gate_in_wait_signal()
	_eq(p.release(), R.PERSON_IN_DANGER, "前提: 危険中に離して失敗")
	p.grab()
	_check(p.holding, "つかみ直すと holding")
	_eq(p.phase, P.WAIT_SIGNAL, "つかみ直しても WAIT_SIGNAL のまま")
	var elapsed := 0.0
	while p.is_danger() and elapsed < 40.0:
		_check(not p.tick(0.1), "WAIT_SIGNAL 中の tick は完了イベントを出さない")
		elapsed += 0.1
	_check(not p.is_danger(), "舟が通り過ぎて安全になる（%.1fs 以内）" % elapsed)
	_eq(p.signal_text(), "今や！ 離して！", "安全になったら合図が変わる")
	_eq(p.release(), R.SUCCESS, "安全なときに離すと SUCCESS")
	_eq(p.phase, P.DONE, "DONE")
	_check(not p.holding, "holding は false")
	return true


func _gate_done_is_terminal() -> bool:
	var P = _gate_script.Phase
	var R = _gate_script.Result
	var p = _gate_in_wait_signal()
	p.release()  # 危険中: PERSON_IN_DANGER
	p.grab()
	var elapsed := 0.0
	while p.is_danger() and elapsed < 40.0:
		p.tick(0.1)
		elapsed += 0.1
	_eq(p.release(), R.SUCCESS, "前提: SUCCESS")
	var boats_before: Array = p.boats.duplicate()
	_check(not p.tick(5.0), "DONE の tick は false")
	_eq(p.boats, boats_before, "DONE 後は舟が動かない／増えない")
	p.grab()
	_eq(p.release(), R.NONE, "DONE 後の release は NONE")
	_eq(p.phase, P.DONE, "DONE のまま")
	return true


func _gate_signal_text() -> bool:
	var p = _gate()
	_eq(p.signal_text(), "見張り中", "WAIT_GRAB")
	p.grab()
	_eq(p.signal_text(), "見張り中", "ADJUSTING")
	p.tick(_gate_script.ADJUST_TIME)
	_check(p.is_danger(), "前提: 危険")
	_eq(p.signal_text(), "待って！ 人がいる", "WAIT_SIGNAL（危険）")
	p.boats.clear()
	_check(not p.is_danger(), "前提: 舟を除くと安全")
	_eq(p.signal_text(), "今や！ 離して！", "WAIT_SIGNAL（安全）")
	p.phase = _gate_script.Phase.DONE
	_eq(p.signal_text(), "安全確認よし", "DONE")
	return true


func _gate_danger_boundaries() -> bool:
	var lo: float = _gate_script.DANGER_MIN_X
	var hi: float = _gate_script.DANGER_MAX_X
	for case in [
		[lo, true], [hi, true], [(lo + hi) * 0.5, true],
		[lo - 0.01, false], [hi + 0.01, false], [-10.0, false], [40.0, false],
	]:
		var p = _gate()
		p.boats.append(case[0])
		_eq(p.is_danger(), case[1], "x=%s の is_danger" % str(case[0]))
	var p2 = _gate()
	p2.boats.append(hi + 5.0)
	p2.boats.append(lo - 5.0)
	_check(not p2.is_danger(), "範囲の外側に2艘いても危険ではない")
	p2.boats.append(10.0)
	_check(p2.is_danger(), "1艘でも範囲内なら危険")
	return true


func _gate_boats_move() -> bool:
	var p = _gate()
	p.boats.append(20.0)
	p.tick(1.0)
	_eq(p.boats.size(), 1, "舟は1艘のまま（grab 前は新規出現なし）")
	_near(p.boats[0], 20.0 - _gate_script.BOAT_SPEED, "1秒で BOAT_SPEED ぶん -x へ進む")
	p.tick(2.0)
	_near(p.boats[0], 20.0 - _gate_script.BOAT_SPEED * 3.0, "さらに2秒進む")
	return true


func _gate_boats_despawn() -> bool:
	var p = _gate()
	var despawn: float = _gate_script.BOAT_DESPAWN_X
	p.boats.append(despawn + 1.0)   # 1秒後に下限を過ぎる
	p.boats.append(despawn + 20.0)  # まだ残る
	p.tick(1.0)
	_eq(p.boats.size(), 1, "下流端を過ぎた舟だけが消える")
	_near(p.boats[0], despawn + 20.0 - _gate_script.BOAT_SPEED, "残った舟は進んでいる")
	return true


func _gate_boats_spawn() -> bool:
	var p = _gate()
	p.grab()
	p.tick(3.9)
	_check(p.boats.is_empty(), "spawn_timer(4.0) 手前では出ない")
	p.tick(0.11)  # 浮動小数の誤差で境界ちょうどを避ける
	_eq(p.boats.size(), 1, "spawn_timer 経過で1艘出現")
	_near(p.boats[0], _gate_script.BOAT_SPAWN_X, "BOAT_SPAWN_X に出現")
	_near(p.spawn_timer, _gate_script.BOAT_PERIOD, "spawn_timer は BOAT_PERIOD に再装填")
	# 離して待機（進捗>0 なので舟は出続ける）。BOAT_PERIOD 経過で次が出る
	p.release()
	_check(p.progress > 0.0, "前提: 進捗は残っている")
	p.tick(_gate_script.BOAT_PERIOD)
	_eq(p.boats.size(), 2, "BOAT_PERIOD 後に2艘目")
	return true


## 【既知の問題】_ensure_first_signal_boat() は「いま危険範囲にいるか」を移動前に判定するが、
## その直後の _update_boats() で舟が動く。危険範囲の下端ぎりぎり(5.0〜5.0+SPEED*delta)の舟が
## いると、判定は「いる」なので追加の舟は出ないのに、同tickの移動で範囲外へ出てしまい、
## 調整完了の瞬間に誰も危険範囲にいない（「必ず1艘いる」の保証が崩れる）。
func _gate_known_boat_leaves_zone_same_tick() -> bool:
	var p = _gate()
	p.grab()
	p.spawn_timer = 1000.0
	p.boats.append(_gate_script.DANGER_MIN_X + 0.01)
	p.progress = 1.0 - 0.0001
	var done: bool = p.tick(1.0 / 60.0)
	_check(done, "前提: このtickで調整が完了する")
	_eq(p.phase, _gate_script.Phase.WAIT_SIGNAL, "前提: WAIT_SIGNAL")
	_check(p.is_danger(), "完了直後に危険範囲へ舟がいない boats=%s" % str(p.boats))
	return true


# ---------------------------------------------------------------------------
# TimelineState（Autoload 用スクリプトを直接 new する。Node なので使い終わったら free）
# ---------------------------------------------------------------------------

func _new_timeline():
	var ts = _timeline_script.new()
	ts.reset()
	return ts


## 全保存項目を非既定値にした TimelineState。
func _timeline_fully_progressed():
	var ts = _new_timeline()
	ts.gate_repaired = true
	ts.genbei_drawing_found = true
	ts.confirm_drawing()
	ts.current_era = _timeline_script.ERA_EDO
	ts.intro_done = true
	ts.met_matsui = true
	ts.met_genbei = true
	ts.gear_placed = true
	ts.met_sora = true
	ts.robots_defeated = 2
	ts.prologue_cleared = true
	ts.checkpoint = "hub_start"
	ts.equipment = "claw_test_mk2"
	ts.collect_crystal("crystal_a")
	ts.collect_crystal("crystal_b")
	ts.collect_crystal("crystal_c")
	ts.play_time = 123.5
	ts.add_metric("claw_grabs", 3.0)
	ts.add_metric("claw_misgrabs", 1.0)
	ts.add_metric("release_too_early", 2.0)
	ts.add_metric("time_travels", 4.0)
	ts.mark_metric_time("claw_first_success_time")
	ts.add_metric("custom_future_metric", 7.0)  # 未知のキーも保存される
	return ts


func _timeline_defaults() -> bool:
	var ts = _new_timeline()
	_check(not ts.gate_repaired, "gate_repaired")
	_check(not ts.genbei_drawing_found, "genbei_drawing_found")
	_check(not ts.drawing_confirmed, "drawing_confirmed")
	_check(not ts.future_route_open, "future_route_open")
	_check(not ts.intro_done, "intro_done")
	_check(not ts.met_matsui, "met_matsui")
	_check(not ts.met_genbei, "met_genbei")
	_check(not ts.gear_placed, "gear_placed")
	_check(not ts.met_sora, "met_sora")
	_check(not ts.prologue_cleared, "prologue_cleared")
	_eq(ts.robots_defeated, 0, "robots_defeated")
	_eq(ts.current_era, 2086, "current_era は 2086")
	_eq(ts.current_era, _timeline_script.ERA_FUTURE, "current_era は ERA_FUTURE")
	_eq(ts.checkpoint, "future_intro", "checkpoint")
	_eq(ts.equipment, "claw_standard", "equipment")
	_eq(ts.crystal_count(), 0, "crystal_count")
	_near(ts.play_time, 0.0, "play_time")
	_check(not ts.is_robot_combat_cleared(), "ロボ戦は未クリア")
	_eq(_timeline_script.ERA_EDO, 1726, "ERA_EDO")
	_eq(_timeline_script.ERA_PRESENT, 2026, "ERA_PRESENT")
	_eq(_timeline_script.ERA_FUTURE, 2086, "ERA_FUTURE")
	_eq(_timeline_script.ERA_HUB, 0, "ERA_HUB")
	ts.free()
	return true


func _timeline_default_metrics() -> bool:
	var ts = _new_timeline()
	for key in ["claw_first_success_time", "ido_found_time"]:
		_near(float(ts.metrics.get(key, 999.0)), -1.0, "%s の既定は -1（未達）" % key)
	for key in ["claw_misgrabs", "claw_grabs", "release_too_early", "release_person_danger",
			"falls", "deaths", "time_travels"]:
		_check(ts.metrics.has(key), "metrics に %s がある" % key)
		_near(float(ts.metrics.get(key, 999.0)), 0.0, "%s の既定は 0" % key)
	ts.free()
	return true


func _timeline_confirm_requires_both() -> bool:
	var ts = _new_timeline()
	_check(not ts.confirm_drawing(), "どちらも未達なら確定しない")
	_check(not ts.drawing_confirmed, "drawing_confirmed は false")
	ts.gate_repaired = true
	_check(not ts.confirm_drawing(), "修復のみでは確定しない")
	_check(not ts.drawing_confirmed, "drawing_confirmed は false（修復のみ）")
	ts.gate_repaired = false
	ts.genbei_drawing_found = true
	_check(not ts.confirm_drawing(), "絵図の継承のみでは確定しない")
	_check(not ts.drawing_confirmed, "drawing_confirmed は false（絵図のみ）")
	_check(not ts.future_route_open, "future_route_open も false のまま")
	ts.free()
	return true


func _timeline_confirm_success() -> bool:
	var ts = _new_timeline()
	ts.gate_repaired = true
	ts.genbei_drawing_found = true
	_check(not ts.future_route_open, "前提: 確定前は未来の道は開いていない")
	_check(ts.confirm_drawing(), "両方そろえば確定できる")
	_check(ts.drawing_confirmed, "drawing_confirmed")
	_check(ts.future_route_open, "future_route_open")
	ts.free()
	return true


func _timeline_confirm_idempotent() -> bool:
	var ts = _new_timeline()
	var events: Array = []
	ts.flag_changed.connect(func(flag: String, value: Variant) -> void: events.append([flag, value]))
	ts.gate_repaired = true
	ts.genbei_drawing_found = true
	_check(ts.confirm_drawing(), "1回目 true")
	_check(ts.confirm_drawing(), "2回目も true")
	var confirmed_events := events.filter(func(e: Array) -> bool: return e[0] == "drawing_confirmed")
	_eq(confirmed_events.size(), 1, "flag_changed(drawing_confirmed) は1回だけ")
	if confirmed_events.size() == 1:
		_eq(confirmed_events[0][1], true, "値は true")
	# 確定済み（ロード後など）なら前提フラグがなくても true を返し続ける
	ts.gate_repaired = false
	_check(ts.confirm_drawing(), "確定済みなら前提が崩れても true")
	_check(ts.drawing_confirmed, "確定は取り消されない")
	ts.free()
	return true


func _timeline_future_route_derived() -> bool:
	var ts = _new_timeline()
	_check(not ts.future_route_open, "初期は false")
	ts.set_flag("drawing_confirmed", true)
	_check(ts.future_route_open, "drawing_confirmed=true で true")
	_check(not ts.to_dict().has("future_route_open"), "to_dict に future_route_open は入らない")
	ts.set_flag("drawing_confirmed", false)
	_check(not ts.future_route_open, "drawing_confirmed=false で false")
	# future_route_open を直接 set_flag しても drawing_confirmed と無関係には変わらない
	ts.set_flag("future_route_open", true)
	_check(not ts.future_route_open, "set_flag で future_route_open を直接立てられない")
	_check(not ts.drawing_confirmed, "drawing_confirmed も変わらない")
	ts.set_flag("drawing_confirmed", true)
	ts.reset()
	_check(not ts.future_route_open, "reset で future_route_open も false")
	ts.free()
	return true


func _timeline_set_flag_unknown() -> bool:
	var ts = _new_timeline()
	var before: Dictionary = ts.to_dict()
	var emitted: Array = []
	ts.flag_changed.connect(func(flag: String, value: Variant) -> void: emitted.append(flag))
	print("         (次の WARNING: unknown flag は、未知フラグを渡すこのテストによる想定内の出力)")
	ts.set_flag("this_flag_does_not_exist", true)
	_eq(emitted.size(), 0, "未知のフラグでは flag_changed が出ない")
	_eq(ts.to_dict(), before, "状態は変わらない")
	_check(ts.get("this_flag_does_not_exist") == null, "未知のフラグは作られない")
	ts.free()
	return true


func _timeline_set_flag_signal() -> bool:
	var ts = _new_timeline()
	var events: Array = []
	ts.flag_changed.connect(func(flag: String, value: Variant) -> void: events.append([flag, value]))
	ts.set_flag("gate_repaired", true)
	_check(ts.gate_repaired, "gate_repaired が立つ")
	_eq(events.size(), 1, "変化で1回通知")
	if events.size() == 1:
		_eq(events[0][0], "gate_repaired", "フラグ名")
		_eq(events[0][1], true, "値")
	ts.set_flag("gate_repaired", true)
	_eq(events.size(), 1, "同じ値なら通知しない")
	ts.set_flag("robots_defeated", 1)
	_eq(ts.robots_defeated, 1, "整数フラグも設定できる")
	_eq(events.size(), 2, "整数フラグの変化も通知")
	ts.free()
	return true


func _timeline_collect_crystal() -> bool:
	var ts = _new_timeline()
	var events: Array = []
	ts.flag_changed.connect(func(flag: String, value: Variant) -> void: events.append([flag, value]))
	_check(ts.collect_crystal("c1"), "初回は true")
	_eq(ts.crystal_count(), 1, "1個")
	_check(not ts.collect_crystal("c1"), "重複は false")
	_eq(ts.crystal_count(), 1, "重複では増えない")
	_check(ts.collect_crystal("c2"), "別IDは true")
	_eq(ts.crystal_count(), 2, "2個")
	_eq(events.size(), 2, "通知は新規取得の2回だけ")
	if events.size() == 2:
		_eq(events[0][0], "crystals", "通知名")
		_eq(events[1][1], 2, "通知値は所持数")
	ts.free()
	return true


func _timeline_metrics_helpers() -> bool:
	var ts = _new_timeline()
	ts.add_metric("claw_grabs")
	ts.add_metric("claw_grabs")
	_near(float(ts.metrics["claw_grabs"]), 2.0, "add_metric の既定は +1")
	ts.add_metric("claw_grabs", 2.5)
	_near(float(ts.metrics["claw_grabs"]), 4.5, "量を指定して加算")
	ts.add_metric("brand_new_metric", 3.0)
	_near(float(ts.metrics["brand_new_metric"]), 3.0, "未定義のキーは 0 から加算")
	# mark_metric_time: 最初の1回だけ play_time を記録する
	ts.play_time = 12.5
	ts.mark_metric_time("claw_first_success_time")
	_near(float(ts.metrics["claw_first_success_time"]), 12.5, "初回は play_time を記録")
	ts.play_time = 99.0
	ts.mark_metric_time("claw_first_success_time")
	_near(float(ts.metrics["claw_first_success_time"]), 12.5, "2回目は上書きしない")
	ts.mark_metric_time("never_defined_time")
	_near(float(ts.metrics["never_defined_time"]), 99.0, "未定義のキーも記録できる")
	ts.free()
	return true


func _timeline_robot_cleared() -> bool:
	var ts = _new_timeline()
	var total: int = _timeline_script.ROBOTS_TOTAL
	_eq(total, 2, "ROBOTS_TOTAL は 2")
	for n in range(0, total):
		ts.robots_defeated = n
		_check(not ts.is_robot_combat_cleared(), "%d 体では未クリア" % n)
	ts.robots_defeated = total
	_check(ts.is_robot_combat_cleared(), "%d 体でクリア" % total)
	ts.robots_defeated = total + 1
	_check(ts.is_robot_combat_cleared(), "超過でもクリア")
	ts.free()
	return true


func _timeline_to_dict_shape() -> bool:
	var ts = _timeline_fully_progressed()
	var d: Dictionary = ts.to_dict()
	_eq(d.get("version"), _timeline_script.SAVE_VERSION, "version")
	for key in ["gate_repaired", "genbei_drawing_found", "drawing_confirmed", "current_era", "intro_done",
			"met_matsui", "met_genbei", "gear_placed", "met_sora", "robots_defeated", "prologue_cleared",
			"checkpoint", "equipment", "crystals", "play_time", "metrics"]:
		_check(d.has(key), "to_dict に %s がある" % key)
	_check(d["crystals"] is Array, "crystals は配列で保存される")
	_eq((d["crystals"] as Array).size(), 3, "crystals は3件")
	# metrics は複製：to_dict の戻り値を書き換えても本体に影響しない
	(d["metrics"] as Dictionary)["claw_grabs"] = 9999.0
	_near(float(ts.metrics["claw_grabs"]), 3.0, "to_dict の metrics は複製")
	ts.free()
	return true


func _timeline_json_roundtrip() -> bool:
	var src = _timeline_fully_progressed()
	# 実際のセーブと同じく JSON 文字列を経由する（数値は float になる）
	var text := JSON.stringify(src.to_dict())
	var parsed: Variant = JSON.parse_string(text)
	_check(parsed is Dictionary, "JSON を Dictionary として読み戻せる")
	if not parsed is Dictionary:
		src.free()
		return true
	var dst = _timeline_script.new()
	dst.reset()
	dst.from_dict(parsed)

	for flag in ["gate_repaired", "genbei_drawing_found", "drawing_confirmed", "intro_done", "met_matsui",
			"met_genbei", "gear_placed", "met_sora", "prologue_cleared"]:
		_eq(dst.get(flag), src.get(flag), "フラグ %s が一致" % flag)
		_eq(dst.get(flag), true, "フラグ %s は true のまま" % flag)
	_eq(dst.future_route_open, src.future_route_open, "future_route_open が一致")
	_check(dst.future_route_open, "future_route_open は true")
	_eq(dst.current_era, 1726, "current_era（float→int 復元）")
	_eq(typeof(dst.current_era), TYPE_INT, "current_era は int 型")
	_eq(dst.robots_defeated, 2, "robots_defeated")
	_eq(typeof(dst.robots_defeated), TYPE_INT, "robots_defeated は int 型")
	_eq(dst.checkpoint, "hub_start", "checkpoint")
	_eq(dst.equipment, "claw_test_mk2", "equipment")
	_near(dst.play_time, 123.5, "play_time")
	_eq(dst.crystal_count(), 3, "crystal_count")
	for id in ["crystal_a", "crystal_b", "crystal_c"]:
		_check(dst.crystals.has(id), "crystal %s を復元" % id)
	_check(not dst.collect_crystal("crystal_a"), "復元したクリスタルは再取得できない")
	# metrics: 全キーが一致（JSON で int が float になるので数値として比較）
	_eq(dst.metrics.size(), src.metrics.size(), "metrics のキー数")
	for key in src.metrics:
		_check(dst.metrics.has(key), "metrics に %s がある" % key)
		if dst.metrics.has(key):
			_near(float(dst.metrics[key]), float(src.metrics[key]), "metrics[%s]" % key)
	_near(float(dst.metrics["custom_future_metric"]), 7.0, "未知の metrics キーも保持")
	# 最終確認: 再度 to_dict しても同じ内容（数値は同値）
	var again: Dictionary = dst.to_dict()
	var original: Dictionary = src.to_dict()
	_eq(JSON.stringify(again.keys()), JSON.stringify(original.keys()), "to_dict のキー構成が一致")
	src.free()
	dst.free()
	return true


func _timeline_roundtrip_route_consistency() -> bool:
	var src = _new_timeline()
	src.gate_repaired = true
	src.genbei_drawing_found = true
	_check(src.confirm_drawing(), "前提: 確定")
	var dst = _timeline_script.new()
	dst.from_dict(JSON.parse_string(JSON.stringify(src.to_dict())))
	_check(dst.gate_repaired, "gate_repaired")
	_check(dst.genbei_drawing_found, "genbei_drawing_found")
	_check(dst.drawing_confirmed, "drawing_confirmed")
	_check(dst.future_route_open, "future_route_open（算出）")
	_eq(dst.future_route_open, dst.drawing_confirmed, "future_route_open == drawing_confirmed")
	# ロード後の confirm_drawing も true のまま
	_check(dst.confirm_drawing(), "ロード後の confirm_drawing は true")
	src.free()
	dst.free()
	return true


func _timeline_roundtrip_unconfirmed() -> bool:
	var src = _new_timeline()
	src.gate_repaired = true
	src.genbei_drawing_found = true  # 2026年での確認はまだ
	var dst = _timeline_script.new()
	dst.from_dict(JSON.parse_string(JSON.stringify(src.to_dict())))
	_check(dst.gate_repaired and dst.genbei_drawing_found, "前提フラグは復元される")
	_check(not dst.drawing_confirmed, "ロードしても確認済みにはならない（状態を再計算しない）")
	_check(not dst.future_route_open, "未来の道は閉じたまま")
	_check(dst.confirm_drawing(), "2026年で確認すれば確定できる")
	_check(dst.future_route_open, "確定後に未来の道が開く")
	src.free()
	dst.free()
	return true


func _timeline_from_dict_defaults() -> bool:
	# 空の辞書: すべて既定値
	var ts = _timeline_fully_progressed()
	ts.from_dict({})
	_check(not ts.gate_repaired and not ts.genbei_drawing_found and not ts.drawing_confirmed, "フラグは既定値")
	_check(not ts.intro_done and not ts.met_matsui and not ts.met_genbei and not ts.gear_placed, "進行フラグは既定値")
	_check(not ts.met_sora and not ts.prologue_cleared, "進行フラグ(2)は既定値")
	_eq(ts.robots_defeated, 0, "robots_defeated は 0")
	_eq(ts.current_era, 2086, "current_era は 2086")
	_eq(ts.checkpoint, "future_intro", "checkpoint は既定")
	_eq(ts.equipment, "claw_standard", "equipment は既定")
	_eq(ts.crystal_count(), 0, "クリスタルは空（既存状態を引きずらない）")
	_near(ts.play_time, 0.0, "play_time は 0")
	_near(float(ts.metrics.get("claw_first_success_time", 999.0)), -1.0, "metrics は既定値")
	_near(float(ts.metrics.get("claw_grabs", 999.0)), 0.0, "metrics(2) は既定値")
	_check(not ts.metrics.has("custom_future_metric"), "古い独自 metrics は残らない")
	# 一部だけ入った辞書: 指定項目のみ反映
	ts.from_dict({"gate_repaired": true, "checkpoint": "edo_arrive", "crystals": ["x"]})
	_check(ts.gate_repaired, "指定した項目は反映")
	_eq(ts.checkpoint, "edo_arrive", "checkpoint")
	_eq(ts.crystal_count(), 1, "crystals")
	_check(not ts.genbei_drawing_found, "未指定の項目は既定値")
	_eq(ts.current_era, 2086, "未指定の current_era は既定値")
	ts.free()
	return true


func _timeline_from_dict_ignores_route_key() -> bool:
	var ts = _new_timeline()
	ts.from_dict({"future_route_open": true, "drawing_confirmed": false})
	_check(not ts.future_route_open, "保存された future_route_open は無視し drawing_confirmed から算出")
	ts.from_dict({"future_route_open": false, "drawing_confirmed": true})
	_check(ts.future_route_open, "drawing_confirmed=true なら future_route_open=true")
	ts.free()
	return true
