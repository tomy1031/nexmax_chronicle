// NEXMAX CHRONICLE ― three.js 版のエントリ。
// ゲームのシェル（game/game.ts）を起動し、時代ごとのステージ（stages/*）を読み込む。
// ?stage=1726|2026|2086 で開始する時代、?continue でセーブから再開（game/README.md）。
import './game/game.css'
import { startGame } from './game/game'

const app = document.getElementById('app') as HTMLDivElement
const ui = document.getElementById('ui') as HTMLDivElement
startGame(app, ui)
