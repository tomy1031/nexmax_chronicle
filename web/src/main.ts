// NEXMAX CHRONICLE ― three.js 版のエントリ。
// 見た目の試作（1726年・水門の前）を起動する。
import { startEdoSlice } from './world/edo/slice'

const app = document.getElementById('app') as HTMLDivElement
const ui = document.getElementById('ui') as HTMLDivElement
startEdoSlice(app, ui)
