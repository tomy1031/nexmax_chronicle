// 楽器の音を Web Audio で作る（音源ファイルは使わない）。1 音ごとに発振器とフィルタと音量の形を組んで、鳴り終わったら止める。
// 1 音で使う発振器は 1〜3 個（スマホでも軽く）。OfflineAudioContext でも同じように鳴る（試し聴きの書き出し用）。
import type { DrumId, InstrumentId } from './theory'
import { midiToFreq } from './theory'

type Shared = { noise: AudioBuffer; organ: PeriodicWave }
const shared = new WeakMap<BaseAudioContext, Shared>()

function res(ctx: BaseAudioContext): Shared {
  let s = shared.get(ctx)
  if (!s) {
    const len = Math.floor(ctx.sampleRate)
    const noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = noise.getChannelData(0)
    // 毎回同じ並びの雑音（書き出した試し聴きが毎回同じになる）
    let x = 0x2545f491
    for (let i = 0; i < len; i++) {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      d[i] = ((x >>> 0) / 4294967296) * 2 - 1
    }
    // オルガン（足踏みのストップを何本か引いた音）
    const real = new Float32Array([0, 1, 0.75, 0.45, 0.32, 0, 0.18, 0, 0.12])
    const organ = ctx.createPeriodicWave(real, new Float32Array(real.length))
    s = { noise, organ }
    shared.set(ctx, s)
  }
  return s
}

/**
 * 1 音（1 打）で作った音源。鳴り終わったら、その音の出口を切り離す
 * （つないだままだと、鳴り終わったフィルタも毎回処理されて、だんだん重くなる）
 */
let voiceSources: AudioScheduledSourceNode[] | null = null

function track<T extends AudioScheduledSourceNode>(s: T): T {
  voiceSources?.push(s)
  return s
}

/** build の中で作った音源がすべて鳴り終わったら、出口（v）を外す */
function voice(ctx: BaseAudioContext, dest: AudioNode, build: (out: AudioNode) => void): void {
  const v = ctx.createGain()
  v.connect(dest)
  const list: AudioScheduledSourceNode[] = []
  voiceSources = list
  try {
    build(v)
  } finally {
    voiceSources = null
  }
  let left = list.length
  if (!left) v.disconnect()
  const done = () => {
    if (--left === 0) v.disconnect()
  }
  for (const s of list) s.onended = done
}

function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, t: number, detune = 0): OscillatorNode {
  const o = track(ctx.createOscillator())
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (detune) o.detune.setValueAtTime(detune, t)
  return o
}

function gain(ctx: BaseAudioContext, v = 0): GainNode {
  const g = ctx.createGain()
  g.gain.value = v
  return g
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

/** 時間で動かすフィルタ（係数の計算を 128 サンプルに 1 回にして軽くする。耳ではほとんど変わらない） */
function sweep(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = filter(ctx, type, f, q)
  try {
    b.frequency.automationRate = 'k-rate'
  } catch {
    // 変えられないブラウザはそのまま
  }
  return b
}

function noise(ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode {
  const s = track(ctx.createBufferSource())
  s.buffer = res(ctx).noise
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur)
  return s
}

/** のばす音：立ち上がり a 秒で peak、dur の終わりから r 秒で消える。止める時刻を返す */
function sustainEnv(g: AudioParam, t: number, dur: number, peak: number, a: number, r: number, s = 1): number {
  g.setValueAtTime(0, t)
  g.linearRampToValueAtTime(peak, t + a)
  if (s < 1) g.setTargetAtTime(peak * s, t + a, 0.15)
  const end = t + Math.max(dur, a + 0.01)
  g.setTargetAtTime(0, end, r / 4)
  return end + r
}

/** はじく音：すぐ peak、tc（時定数）で減っていく。dur の後は rel で切る。止める時刻を返す */
function pluckEnv(g: AudioParam, t: number, dur: number, peak: number, tc: number, rel: number, ring = 5): number {
  g.setValueAtTime(0, t)
  g.linearRampToValueAtTime(peak, t + 0.004)
  g.setTargetAtTime(0, t + 0.004, tc)
  const natural = t + tc * ring
  const cut = t + dur + rel
  if (cut < natural) {
    g.setTargetAtTime(0, t + dur, rel / 4)
    return cut
  }
  return natural
}

function vibrato(ctx: BaseAudioContext, targets: AudioParam[], t: number, end: number, rate: number, depth: number, delay: number): void {
  const lfo = osc(ctx, 'sine', rate, t)
  const lg = gain(ctx, 0)
  lg.gain.setValueAtTime(0, t)
  lg.gain.linearRampToValueAtTime(0, t + delay)
  lg.gain.linearRampToValueAtTime(depth, t + delay + 0.25)
  lfo.connect(lg)
  for (const p of targets) lg.connect(p)
  lfo.start(t)
  lfo.stop(end)
}

/** 1 音を鳴らす（t 秒から dur 秒。vel は 0〜1） */
export function playNote(ctx: BaseAudioContext, dest: AudioNode, inst: InstrumentId, t: number, dur: number, midi: number, vel: number): void {
  voice(ctx, dest, (out) => buildNote(ctx, out, inst, t, dur, midi, vel))
}

function buildNote(ctx: BaseAudioContext, out: AudioNode, inst: InstrumentId, t: number, dur: number, midi: number, vel: number): void {
  const f = midiToFreq(midi)
  switch (inst) {
    case 'pad':
    case 'strings':
    case 'choir': {
      const a = inst === 'strings' ? 0.22 : inst === 'choir' ? 0.5 : 0.38
      const g = gain(ctx)
      const end = sustainEnv(g.gain, t, dur, (inst === 'choir' ? 0.07 : 0.06) * vel, a, inst === 'strings' ? 0.5 : 0.9)
      const lp = filter(ctx, 'lowpass', inst === 'strings' ? 2600 : inst === 'choir' ? 1800 : 1300, 0.4)
      let head: AudioNode = lp
      if (inst === 'choir') {
        // 「あー」の声の山
        const bp = filter(ctx, 'peaking', 850, 1.2)
        bp.gain.value = 9
        bp.connect(lp)
        head = bp
      }
      lp.connect(g).connect(out)
      for (const d of [-8, 8]) {
        const o = osc(ctx, 'sawtooth', f, t, d)
        o.connect(head)
        o.start(t)
        o.stop(end)
      }
      break
    }
    case 'organ': {
      const g = gain(ctx)
      const end = sustainEnv(g.gain, t, dur * 0.92, 0.07 * vel, 0.01, 0.06)
      const o = track(ctx.createOscillator())
      o.setPeriodicWave(res(ctx).organ)
      o.frequency.setValueAtTime(f, t)
      o.connect(g).connect(out)
      o.start(t)
      o.stop(end)
      break
    }
    case 'ep': {
      // 電気ピアノ：同じ高さで揺らす FM（弾いた瞬間だけ明るい）
      const g = gain(ctx)
      const end = pluckEnv(g.gain, t, dur, 0.2 * vel, 0.55, 0.15)
      const car = osc(ctx, 'sine', f, t)
      const mod = osc(ctx, 'sine', f, t)
      const mg = gain(ctx)
      mg.gain.setValueAtTime(f * 2.2 * vel, t)
      mg.gain.setTargetAtTime(f * 0.25, t, 0.12)
      mod.connect(mg).connect(car.frequency)
      car.connect(g).connect(out)
      car.start(t)
      mod.start(t)
      car.stop(end)
      mod.stop(end)
      break
    }
    case 'musicbox':
    case 'bell':
    case 'vibes':
    case 'roneat':
    case 'gong': {
      // roneat：竹の鍵盤の木琴（すぐ消える）。gong：小さなこぶ付きの銅鑼を円く並べた楽器（コン・ヴォン）
      const tc = inst === 'bell' ? 0.7 : inst === 'vibes' ? 0.5 : inst === 'gong' ? 0.45 : inst === 'roneat' ? 0.13 : 0.32
      const g = gain(ctx)
      const end = pluckEnv(g.gain, t, inst === 'vibes' ? dur + 0.3 : 10, (inst === 'musicbox' ? 0.17 : inst === 'roneat' ? 0.2 : 0.14) * vel, tc, 0.3)
      const car = osc(ctx, 'sine', f, t)
      car.connect(g).connect(out)
      // 上の倍音（鐘・銅鑼は半端な比で金属っぽく、木琴は 4 倍の短い響き）
      const ratio = inst === 'bell' ? 3.51 : inst === 'gong' ? 2.42 : inst === 'vibes' || inst === 'roneat' ? 4 : 3
      const p = osc(ctx, 'sine', f * ratio, t)
      const pg = gain(ctx)
      pg.gain.setValueAtTime(0, t)
      pg.gain.linearRampToValueAtTime((inst === 'bell' || inst === 'gong' ? 0.07 : inst === 'roneat' ? 0.06 : 0.035) * vel, t + 0.003)
      pg.gain.setTargetAtTime(0, t + 0.003, tc * 0.3)
      p.connect(pg).connect(out)
      car.start(t)
      p.start(t)
      car.stop(end)
      p.stop(end)
      break
    }
    case 'pluck':
    case 'shamisen':
    case 'koto': {
      const g = gain(ctx)
      const tc = inst === 'koto' ? 0.42 : inst === 'shamisen' ? 0.2 : 0.11
      const end = pluckEnv(g.gain, t, dur, (inst === 'pluck' ? 0.09 : 0.13) * vel, tc, 0.08)
      const o = osc(ctx, inst === 'pluck' ? 'square' : inst === 'koto' ? 'triangle' : 'sawtooth', f, t)
      if (inst === 'shamisen') {
        // はじいた瞬間に少し上ずってから落ち着く（三味線のさわり）
        o.frequency.setValueAtTime(f * 1.018, t)
        o.frequency.setTargetAtTime(f, t, 0.025)
      }
      const lp = sweep(ctx, 'lowpass', 4500, inst === 'pluck' ? 3 : 1.5)
      lp.frequency.setValueAtTime(inst === 'koto' ? 3800 : 5200, t)
      lp.frequency.setTargetAtTime(inst === 'koto' ? 1100 : inst === 'shamisen' ? 1500 : 650, t, inst === 'koto' ? 0.15 : 0.06)
      let tail: AudioNode = lp
      if (inst === 'shamisen') {
        const hp = filter(ctx, 'highpass', 260, 0.7)
        lp.connect(hp)
        tail = hp
      }
      o.connect(lp)
      tail.connect(g).connect(out)
      o.start(t)
      o.stop(end)
      break
    }
    case 'lead':
    case 'brass': {
      const g = gain(ctx)
      const end = sustainEnv(g.gain, t, dur * 0.95, (inst === 'brass' ? 0.08 : 0.075) * vel, inst === 'brass' ? 0.03 : 0.015, 0.1, 0.85)
      const lp = (inst === 'brass' ? sweep : filter)(ctx, 'lowpass', 2400, 1.2)
      if (inst === 'brass') {
        lp.frequency.setValueAtTime(450, t)
        lp.frequency.linearRampToValueAtTime(3200, t + 0.06)
        lp.frequency.setTargetAtTime(1500, t + 0.06, 0.15)
      }
      lp.connect(g).connect(out)
      const o1 = osc(ctx, 'sawtooth', f, t, -5)
      const o2 = osc(ctx, inst === 'brass' ? 'sawtooth' : 'square', f, t, 5)
      o1.connect(lp)
      o2.connect(lp)
      if (inst === 'lead' && dur > 0.25) vibrato(ctx, [o1.frequency, o2.frequency], t, end, 5.5, f * 0.007, 0.15)
      o1.start(t)
      o2.start(t)
      o1.stop(end)
      o2.stop(end)
      break
    }
    case 'sralai': {
      // スラライ（4 枚リードの笛）：鼻にかかった明るい音。帯域を持ち上げて、大きめのゆれ
      const g = gain(ctx)
      const end = sustainEnv(g.gain, t, dur * 0.95, 0.07 * vel, 0.03, 0.08, 0.85)
      const o = osc(ctx, 'sawtooth', f, t)
      const pk = filter(ctx, 'peaking', 1500, 1.1)
      pk.gain.value = 10
      const lp = filter(ctx, 'lowpass', 3800, 0.6)
      o.connect(pk).connect(lp).connect(g).connect(out)
      if (dur > 0.2) vibrato(ctx, [o.frequency], t, end, 5.6, f * 0.012, 0.12)
      o.start(t)
      o.stop(end)
      break
    }
    case 'theremin':
    case 'flute': {
      const g = gain(ctx)
      const fl = inst === 'flute'
      const end = sustainEnv(g.gain, t, dur * 0.96, (fl ? 0.13 : 0.12) * vel, fl ? 0.035 : 0.07, fl ? 0.08 : 0.16, fl ? 0.85 : 1)
      const o = osc(ctx, fl ? 'triangle' : 'sine', f, t)
      if (fl) {
        const lp = filter(ctx, 'lowpass', 3400, 0.5)
        o.connect(lp).connect(g)
        // 息の音（吹き始めだけ）
        const n = noise(ctx, t, 0.09)
        const bp = filter(ctx, 'bandpass', Math.min(9000, f * 2), 1.5)
        const ng = gain(ctx)
        ng.gain.setValueAtTime(0.045 * vel, t)
        ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.09)
        n.connect(bp).connect(ng).connect(out)
      } else o.connect(g)
      g.connect(out)
      if (dur > 0.2) vibrato(ctx, [o.frequency], t, end, fl ? 5 : 6.2, f * (fl ? 0.008 : 0.016), fl ? 0.2 : 0.05)
      o.start(t)
      o.stop(end)
      break
    }
    case 'bass':
    case 'synthbass':
    case 'subbass': {
      const g = gain(ctx)
      const peak = inst === 'synthbass' ? 0.16 : inst === 'subbass' ? 0.3 : 0.26
      const end = sustainEnv(g.gain, t, dur * (inst === 'synthbass' ? 0.88 : 0.97), peak * vel, 0.005, 0.05, inst === 'bass' ? 0.7 : 0.85)
      if (inst === 'synthbass') {
        const lp = sweep(ctx, 'lowpass', 1800, 5)
        lp.frequency.setValueAtTime(2200, t)
        lp.frequency.setTargetAtTime(320, t, 0.07)
        const o = osc(ctx, 'sawtooth', f, t)
        o.connect(lp).connect(g)
        const sub = osc(ctx, 'sine', f, t)
        const sg = gain(ctx, 0.9)
        sub.connect(sg).connect(g)
        o.start(t)
        sub.start(t)
        o.stop(end)
        sub.stop(end)
      } else {
        const o = osc(ctx, inst === 'subbass' ? 'sine' : 'triangle', f, t)
        const lp = filter(ctx, 'lowpass', 900, 0.7)
        o.connect(lp).connect(g)
        o.start(t)
        o.stop(end)
      }
      g.connect(out)
      break
    }
  }
}

/** 打楽器を 1 回鳴らす */
export function playDrum(ctx: BaseAudioContext, dest: AudioNode, drum: DrumId, t: number, vel: number): void {
  voice(ctx, dest, (out) => buildDrum(ctx, out, drum, t, vel))
}

function buildDrum(ctx: BaseAudioContext, out: AudioNode, drum: DrumId, t: number, vel: number): void {
  const decayGain = (peak: number, len: number) => {
    const g = gain(ctx)
    g.gain.setValueAtTime(peak * vel, t)
    g.gain.exponentialRampToValueAtTime(0.0005, t + len)
    return g
  }
  const tone = (type: OscillatorType, f0: number, f1: number, bend: number, peak: number, len: number) => {
    const o = osc(ctx, type, f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + bend)
    o.connect(decayGain(peak, len)).connect(out)
    o.start(t)
    o.stop(t + len + 0.02)
  }
  const hiss = (type: BiquadFilterType, f: number, q: number, peak: number, len: number) => {
    noise(ctx, t, len + 0.02)
      .connect(filter(ctx, type, f, q))
      .connect(decayGain(peak, len))
      .connect(out)
  }
  switch (drum) {
    case 'kick':
      tone('sine', 145, 44, 0.12, 0.85, 0.38)
      break
    case 'snare':
      hiss('highpass', 1300, 0.7, 0.32, 0.17)
      tone('triangle', 190, 170, 0.05, 0.22, 0.09)
      break
    case 'clap': {
      const g = gain(ctx)
      const p = g.gain
      p.setValueAtTime(0.42 * vel, t)
      p.exponentialRampToValueAtTime(0.04, t + 0.011)
      p.setValueAtTime(0.38 * vel, t + 0.013)
      p.exponentialRampToValueAtTime(0.04, t + 0.024)
      p.setValueAtTime(0.36 * vel, t + 0.026)
      p.exponentialRampToValueAtTime(0.0005, t + 0.2)
      noise(ctx, t, 0.22).connect(filter(ctx, 'bandpass', 1150, 0.9)).connect(g).connect(out)
      break
    }
    case 'hat':
      hiss('highpass', 7600, 0.7, 0.13, 0.045)
      break
    case 'ohat':
      hiss('highpass', 7000, 0.7, 0.1, 0.28)
      break
    case 'shaker':
      hiss('bandpass', 5600, 1.2, 0.09, 0.065)
      break
    case 'taiko':
      tone('sine', 108, 58, 0.25, 0.8, 0.7)
      hiss('lowpass', 320, 0.7, 0.3, 0.08)
      break
    case 'shime':
      tone('sine', 470, 400, 0.05, 0.24, 0.12)
      hiss('bandpass', 2600, 1, 0.14, 0.03)
      break
    case 'kane': {
      // チキチン（小さな鉦）：半端な比の 2 音を高い帯域だけ
      const bp = filter(ctx, 'bandpass', 3000, 0.7)
      const g = decayGain(0.07, 0.24)
      bp.connect(g).connect(out)
      for (const f of [1180, 1690]) {
        const o = osc(ctx, 'square', f, t)
        o.connect(bp)
        o.start(t)
        o.stop(t + 0.26)
      }
      break
    }
    case 'chhing': {
      // チン（小さな手のシンバル）：高い 2 音が長めに残る
      const hp = filter(ctx, 'highpass', 2600, 0.7)
      const g = decayGain(0.06, 0.42)
      hp.connect(g).connect(out)
      for (const f of [3150, 4420]) {
        const o = osc(ctx, 'square', f, t)
        o.connect(hp)
        o.start(t)
        o.stop(t + 0.44)
      }
      break
    }
    case 'tom':
      tone('sine', 190, 105, 0.25, 0.5, 0.36)
      break
    case 'crash':
      hiss('highpass', 3600, 0.7, 0.16, 1.4)
      break
    case 'rim':
      tone('square', 1750, 1750, 0.01, 0.1, 0.035)
      break
  }
}

/** 響き（リバーブ）の残響：雑音を指数で減らした左右別の波形 */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  let x = 0x9e3779b9
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      const n = ((x >>> 0) / 4294967296) * 2 - 1
      // 高い音ほど早く消えるよう、少しだけ丸める
      lp += (n - lp) * 0.55
      d[i] = lp * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}
