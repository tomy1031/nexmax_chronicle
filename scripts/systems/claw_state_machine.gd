class_name ClawStateMachine
extends RefCounted
## NMClaw の内部状態（仕様 §5.3）。
## IDLE → AIMING → GRABBING → HOLDING → RELEASING → IDLE
## ノードに依存しない純粋なロジックなので、ヘッドレステストで検証できる。

enum State { IDLE, AIMING, GRABBING, HOLDING, RELEASING }
enum Event { NONE, HOLD_STARTED, RELEASE_FINISHED }

const GRAB_TIME := 0.18
const RELEASE_TIME := 0.15

var state: State = State.IDLE
var timer := 0.0


static func state_name(s: State) -> String:
	return ["IDLE", "AIMING", "GRABBING", "HOLDING", "RELEASING"][s]


func begin_aim() -> bool:
	if state == State.IDLE:
		state = State.AIMING
		return true
	return false


func end_aim() -> bool:
	if state == State.AIMING:
		state = State.IDLE
		return true
	return false


## 構え中の左クリック。対象がなければ失敗（不発）。
func try_grab(has_target: bool) -> bool:
	if state == State.AIMING and has_target:
		state = State.GRABBING
		timer = GRAB_TIME
		return true
	return false


## 保持中の左クリック、または対象側からの強制解除。
func release() -> bool:
	if state == State.HOLDING or state == State.GRABBING:
		state = State.RELEASING
		timer = RELEASE_TIME
		return true
	return false


func is_busy() -> bool:
	return state == State.GRABBING or state == State.HOLDING or state == State.RELEASING


func tick(delta: float, aim_held: bool) -> Event:
	match state:
		State.GRABBING:
			timer -= delta
			if timer <= 0.0:
				state = State.HOLDING
				return Event.HOLD_STARTED
		State.RELEASING:
			timer -= delta
			if timer <= 0.0:
				state = State.AIMING if aim_held else State.IDLE
				return Event.RELEASE_FINISHED
	return Event.NONE


func reset() -> void:
	state = State.IDLE
	timer = 0.0
