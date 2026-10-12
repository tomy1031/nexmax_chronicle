extends Node
## 効果音とBGMをコードで合成する（外部音源なし・Webでも動く AudioStreamWAV）。
## BGMは1フレームあたりの処理時間を制限して少しずつ生成し、完成したら流す。

const RATE := 22050
const MUSIC_BUDGET_USEC := 3000

var _streams := {}
var _players: Array[AudioStreamPlayer] = []
var _next_player := 0
var _music: AudioStreamPlayer
var _music_cache := {}
var _music_job: Dictionary = {}
var _mbuf := PackedFloat32Array()  # 生成中のBGM（メンバーに置いて配列のコピーを避ける）
var _wanted_music := ""
var sfx_volume_db := -4.0
var music_volume_db := -15.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for i in 10:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)
	_music = AudioStreamPlayer.new()
	_music.volume_db = music_volume_db
	add_child(_music)
	_build_sfx()


func play(sound: String, pitch: float = 1.0, vol_db: float = 0.0) -> void:
	var s: AudioStreamWAV = _streams.get(sound)
	if s == null:
		return
	var p := _players[_next_player]
	_next_player = (_next_player + 1) % _players.size()
	p.stream = s
	p.pitch_scale = pitch
	p.volume_db = sfx_volume_db + vol_db
	p.play()


# ---------------------------------------------------------------- BGM

func play_music(theme: String) -> void:
	if _wanted_music == theme and (_music.playing or not _music_job.is_empty()):
		return
	_wanted_music = theme
	if _music_cache.has(theme):
		_start_music(_music_cache[theme])
		return
	_music.stop()
	_music_job = _make_music_job(theme)


func stop_music() -> void:
	_wanted_music = ""
	_music_job = {}
	if _music.playing:
		var tw := create_tween()
		tw.tween_property(_music, "volume_db", -60.0, 0.6)
		tw.tween_callback(_music.stop)


func _start_music(stream: AudioStreamWAV) -> void:
	_music.stream = stream
	_music.volume_db = -40.0
	_music.play()
	var tw := create_tween()
	tw.tween_property(_music, "volume_db", music_volume_db, 1.5)


func _process(_delta: float) -> void:
	if _music_job.is_empty():
		return
	var start := Time.get_ticks_usec()
	var notes: Array = _music_job.notes
	while _music_job.index < notes.size():
		var n: Array = notes[_music_job.index]
		_render_note(n[0], n[1], n[2], n[3], n[4])
		_music_job.index += 1
		if Time.get_ticks_usec() - start > MUSIC_BUDGET_USEC:
			break
	if _music_job.index >= notes.size():
		var stream := _to_wav(_mbuf, true)
		_music_cache[_music_job.theme] = stream
		var theme: String = _music_job.theme
		_music_job = {}
		if _wanted_music == theme:
			_start_music(stream)


## notes: [開始秒, 長さ秒, MIDIノート, 音量, 音色]
func _make_music_job(theme: String) -> Dictionary:
	var notes: Array = []
	var bpm := 100.0
	var bars := 8
	var beat := 60.0 / bpm
	match theme:
		"edo":
			bpm = 84.0
			beat = 60.0 / bpm
			# 都節音階（ミ・ファ・ラ・シ・ド）風の箏のフレーズ
			var mel := [64, 65, 69, 71, 72, 71, 69, 65, 64, 69, 71, 76, 74, 72, 71, 69]
			for i in 32:
				var n: int = mel[i % mel.size()]
				if i % 8 == 7:
					continue
				notes.append([i * beat * 0.5 * 2.0, beat * 1.6, n, 0.22, "pluck"])
			for b in bars:
				notes.append([b * beat * 4.0, beat * 3.5, 40 if b % 2 == 0 else 45, 0.18, "bass"])
				notes.append([b * beat * 4.0 + beat * 2.0, beat * 0.2, 0, 0.12, "drum"])
		"present":
			bpm = 112.0
			beat = 60.0 / bpm
			var prog := [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]]
			for b in bars:
				var ch: Array = prog[b % 4]
				for s in 8:
					var n: int = ch[s % 3] + (12 if s >= 4 else 0)
					notes.append([b * beat * 4.0 + s * beat * 0.5, beat * 0.45, n, 0.13, "square"])
				notes.append([b * beat * 4.0, beat * 1.8, ch[0] - 24, 0.22, "bass"])
				notes.append([b * beat * 4.0 + beat * 2.0, beat * 1.8, ch[0] - 24, 0.2, "bass"])
				for k in 4:
					notes.append([b * beat * 4.0 + k * beat, beat * 0.1, 0, 0.1 if k % 2 == 0 else 0.07, "drum"])
		"future":
			bpm = 120.0
			beat = 60.0 / bpm
			var prog2 := [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]]
			for b in bars:
				var ch2: Array = prog2[b % 4]
				for s in 16:
					var n2: int = ch2[s % 4] + (12 if (s / 4) % 2 == 1 else 0)
					notes.append([b * beat * 4.0 + s * beat * 0.25, beat * 0.22, n2, 0.09, "square"])
				notes.append([b * beat * 4.0, beat * 3.8, ch2[0] - 12, 0.12, "pad"])
				notes.append([b * beat * 4.0, beat * 0.9, ch2[0] - 24, 0.24, "bass"])
				notes.append([b * beat * 4.0 + beat * 2.0, beat * 0.9, ch2[0] - 24, 0.24, "bass"])
				for k in 4:
					notes.append([b * beat * 4.0 + k * beat, beat * 0.1, 0, 0.12, "drum"])
		"hub":
			bpm = 72.0
			beat = 60.0 / bpm
			var prog3 := [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]]
			bars = 4
			for b in bars:
				var ch3: Array = prog3[b % 4]
				for n3 in ch3:
					notes.append([b * beat * 4.0, beat * 4.0, n3, 0.07, "pad"])
				for s in 4:
					notes.append([b * beat * 4.0 + s * beat, beat * 1.2, ch3[(s + 1) % 4] + 12, 0.1, "bell"])
		_:
			bpm = 90.0
			beat = 60.0 / bpm
			var mel4 := [72, 76, 79, 84, 79, 76, 74, 71]
			bars = 4
			for i in 16:
				notes.append([i * beat, beat * 1.4, mel4[i % mel4.size()], 0.14, "bell"])
			for b in bars:
				notes.append([b * beat * 4.0, beat * 4.0, 48 + [0, 5, 7, 3][b], 0.1, "pad"])
	var length := bars * beat * 4.0
	_mbuf = PackedFloat32Array()
	_mbuf.resize(int(length * RATE))
	return {"theme": theme, "notes": notes, "index": 0}


func _render_note(t0: float, dur: float, midi: int, vol: float, kind: String) -> void:
	var start := int(t0 * RATE)
	var tail := 0.35 if kind == "pluck" or kind == "bell" else 0.12
	var count := int((dur + tail) * RATE)
	var f := 440.0 * pow(2.0, (midi - 69) / 12.0)
	var size := _mbuf.size()
	var w := TAU * f / RATE
	for i in count:
		var idx := (start + i) % size  # ループ末尾は先頭へ回り込ませる
		var t := float(i) / RATE
		var v := 0.0
		match kind:
			"pluck":
				v = (sin(w * i) + 0.5 * sin(w * 2.0 * i) + 0.25 * sin(w * 3.0 * i)) * exp(-t * 4.0) * 0.6
			"bell":
				v = (sin(w * i) + 0.3 * sin(w * 2.76 * i)) * exp(-t * 3.0) * 0.7
			"bass":
				var ph := fmod(f * t, 1.0)
				v = (4.0 * absf(ph - 0.5) - 1.0) * minf(1.0, t * 40.0) * (1.0 if t < dur else exp(-(t - dur) * 30.0))
			"square":
				v = (0.6 if sin(w * i) > 0.0 else -0.6) * exp(-t * 6.0)
			"pad":
				var env := minf(1.0, t / 0.6) * (1.0 if t < dur else exp(-(t - dur) * 12.0))
				v = (sin(w * i) + 0.5 * sin(w * 1.005 * i) + 0.3 * sin(w * 2.0 * i)) * env * 0.5
			"drum":
				v = (randf() * 2.0 - 1.0) * exp(-t * 35.0) + sin(TAU * 60.0 * t) * exp(-t * 20.0)
		_mbuf[idx] += v * vol


# ---------------------------------------------------------------- 効果音

func _build_sfx() -> void:
	_streams["grab"] = _synth(0.16, func(t: float, d: float) -> float:
		return _sq(lerpf(320.0, 980.0, t / d), t) * 0.35 * (1.0 - t / d) + _noise() * 0.15 * exp(-t * 60.0))
	_streams["release"] = _synth(0.16, func(t: float, d: float) -> float:
		return _sq(lerpf(760.0, 240.0, t / d), t) * 0.3 * (1.0 - t / d))
	_streams["misfire"] = _synth(0.14, func(t: float, _d: float) -> float:
		return _sq(130.0, t) * 0.35 * (0.5 + 0.5 * sin(TAU * 40.0 * t)) * exp(-t * 12.0))
	_streams["aim"] = _synth(0.06, func(t: float, _d: float) -> float:
		return sin(TAU * 1250.0 * t) * 0.3 * exp(-t * 60.0))
	_streams["lock"] = _synth(0.12, func(t: float, _d: float) -> float:
		var f := 1500.0 if t < 0.05 else 2000.0
		return sin(TAU * f * t) * 0.25 * exp(-fmod(t, 0.06) * 50.0))
	_streams["ratchet"] = _synth(0.5, func(t: float, _d: float) -> float:
		return _noise() * exp(-fmod(t, 0.0625) * 140.0) * 0.6 + sin(TAU * 900.0 * t) * exp(-fmod(t, 0.0625) * 90.0) * 0.2)
	_streams["click"] = _synth(0.08, func(t: float, _d: float) -> float:
		return _noise() * exp(-t * 120.0) * 0.6 + sin(TAU * 700.0 * t) * exp(-t * 80.0) * 0.3)
	_streams["gear_place"] = _synth(0.5, func(t: float, _d: float) -> float:
		return sin(TAU * 85.0 * t) * exp(-t * 7.0) * 0.8 + _noise() * exp(-t * 30.0) * 0.4 + sin(TAU * 1200.0 * t) * exp(-maxf(0.0, t - 0.12) * 60.0) * (0.25 if t > 0.12 else 0.0))
	_streams["success"] = _synth(0.9, func(t: float, _d: float) -> float:
		var notes := [523.25, 659.25, 783.99, 1046.5]
		var i := mini(int(t / 0.12), 3)
		var lt := t - i * 0.12
		return (sin(TAU * notes[i] * t) + 0.3 * sin(TAU * notes[i] * 2.0 * t)) * 0.3 * exp(-lt * (3.0 if i == 3 else 8.0)))
	_streams["warp"] = _synth(1.6, func(t: float, d: float) -> float:
		var f := lerpf(180.0, 2200.0, pow(t / d, 2.0))
		return (sin(TAU * f * t) * 0.25 + _noise() * 0.15) * sin(PI * t / d))
	_streams["jump"] = _synth(0.1, func(t: float, d: float) -> float:
		return _sq(lerpf(380.0, 720.0, t / d), t) * 0.18 * (1.0 - t / d))
	_streams["land"] = _synth(0.12, func(t: float, _d: float) -> float:
		return sin(TAU * 90.0 * t) * exp(-t * 30.0) * 0.6 + _noise() * exp(-t * 50.0) * 0.2)
	_streams["dash"] = _synth(0.24, func(t: float, d: float) -> float:
		return _noise() * 0.35 * sin(PI * t / d) + sin(TAU * lerpf(300.0, 900.0, t / d) * t) * 0.1)
	_streams["hit"] = _synth(0.16, func(t: float, _d: float) -> float:
		return _noise() * exp(-t * 40.0) * 0.6 + sin(TAU * 200.0 * t) * exp(-t * 25.0) * 0.5)
	_streams["clang"] = _synth(0.5, func(t: float, _d: float) -> float:
		return (sin(TAU * 523.0 * t) + 0.7 * sin(TAU * 1347.0 * t) + 0.5 * sin(TAU * 2131.0 * t)) * 0.22 * exp(-t * 9.0))
	_streams["hurt"] = _synth(0.3, func(t: float, d: float) -> float:
		return _sq(lerpf(520.0, 140.0, t / d), t) * 0.3 * (1.0 - t / d))
	_streams["crystal"] = _synth(0.45, func(t: float, _d: float) -> float:
		var f := 1568.0 if t < 0.08 else 2093.0
		return (sin(TAU * f * t) + 0.4 * sin(TAU * f * 2.0 * t)) * 0.22 * exp(-t * 7.0))
	_streams["talk"] = _synth(0.035, func(t: float, _d: float) -> float:
		return _sq(880.0, t) * 0.12 * exp(-t * 60.0))
	_streams["ui"] = _synth(0.06, func(t: float, _d: float) -> float:
		return sin(TAU * 1000.0 * t) * 0.25 * exp(-t * 70.0))
	_streams["splash"] = _synth(0.6, func(t: float, _d: float) -> float:
		return _noise() * 0.4 * exp(-t * 6.0) * (0.6 + 0.4 * sin(TAU * 13.0 * t)))
	_streams["shutdown"] = _synth(0.7, func(t: float, d: float) -> float:
		return _sq(lerpf(620.0, 50.0, t / d), t) * 0.25 * (1.0 - t / d))
	_streams["alarm"] = _synth(0.6, func(t: float, _d: float) -> float:
		var f := 740.0 if fmod(t, 0.3) < 0.15 else 520.0
		return sin(TAU * f * t) * 0.22)
	_streams["fail"] = _synth(0.45, func(t: float, _d: float) -> float:
		var f := 330.0 if t < 0.2 else 220.0
		return _sq(f, t) * 0.22 * exp(-fmod(t, 0.2) * 6.0))
	_streams["water"] = _synth(1.2, func(t: float, d: float) -> float:
		return _noise() * 0.28 * sin(PI * t / d) * (0.7 + 0.3 * sin(TAU * 7.0 * t)))
	_streams["heal"] = _synth(0.7, func(t: float, _d: float) -> float:
		var f := 660.0 + 440.0 * t
		return sin(TAU * f * t) * 0.2 * exp(-t * 3.0) + sin(TAU * f * 1.5 * t) * 0.1 * exp(-t * 3.0))
	_streams["door"] = _synth(0.8, func(t: float, d: float) -> float:
		return sin(TAU * lerpf(90.0, 160.0, t / d) * t) * 0.4 * sin(PI * t / d) + _noise() * 0.08)


func _synth(dur: float, fn: Callable) -> AudioStreamWAV:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	for i in n:
		buf[i] = fn.call(float(i) / RATE, dur)
	return _to_wav(buf, false)


func _to_wav(buf: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var peak := 0.0
	for v in buf:
		peak = maxf(peak, absf(v))
	var gain := 1.0 if peak <= 0.95 else 0.95 / peak
	var data := PackedByteArray()
	data.resize(buf.size() * 2)
	for i in buf.size():
		data.encode_s16(i * 2, int(clampf(buf[i] * gain, -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = data
	if loop:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = buf.size()
	return w


func _sq(f: float, t: float) -> float:
	return 1.0 if fmod(f * t, 1.0) < 0.5 else -1.0


func _noise() -> float:
	return randf() * 2.0 - 1.0
