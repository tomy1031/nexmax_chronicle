// 縦切り試作（1726年 大坂・仕掛け横丁）の入口。
// 中身はステージの形（stages/edo1726/stage.ts）に移し、レンダラ・入力・カメラ・NMClaw などはゲームのシェル
// （game/game.ts）が持つようになった。互換のため startEdoSlice() は 1726年から始まるゲームを起動する。
import { startGame } from '../../game/game'

export async function startEdoSlice(app: HTMLDivElement, ui: HTMLDivElement): Promise<void> {
  await startGame(app, ui)
}
