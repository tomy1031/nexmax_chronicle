// 2086 年の戦いの柵の形（chronicle/kit/arena.ts の ArenaFence に渡す XZ の点。tests/chronicle2086Additions.test.ts）。
// ・courtyard：10 章の中庭の決闘。門（西の塀のすき間）・縁側（東）・北の棟の手前まで。ほこらとトワの下はふくむ
// ・plaza：12 章の最後の夜（黒い手・空を裂く）。広場のまん中。ソラのブースの展示・東の屋台・北のステージ・南のゲートの手前まで
import { circlePoints, rectPoints } from '../../../chronicle/kit/arenaLogic'

export const ARENAS_2086 = {
  courtyard: rectPoints(7.5, 19.0, -48.5, -37.3),
  plaza: circlePoints(1.0, 3.5, 11.0, 32),
} as const

export type Arena2086 = keyof typeof ARENAS_2086
