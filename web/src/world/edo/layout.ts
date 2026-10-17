// 1726年 仕掛け横丁・水門まわりの配置（m）。X=東、Z=南、Y=上。
// 本流の水路は X 方向。水門（GATE_X）から上流は南半分が「水門で堰き止めた導水路（高い水位）」、
// 北半分が舟の通る低い水路として東の遠景（赤い橋・鳥居・城）へ続く。
export const L = {
  WL_DOWN: -0.55,
  WL_UP: 1.35,
  BANK_N: -7.5,
  BANK_S: 7.5,
  GATE_X: 10,
  GATE_Z0: -0.5,
  GATE_Z1: 7.5,
  DIVIDER_Z0: -1.2,
  DIVIDER_Z1: -0.5,
  TERRACE_Y: 1.95,
  STREET_Z1: 14,
  NORTH_Z1: -11,
  // 大歯車（軸はほぼ西向き：源兵衛の小車へ）
  GEAR: { x: 6.4, y: 0.78, z: -1.8, r: 1.55, axisYaw: Math.PI - 0.14 },
  GENBEI_WHEEL: { x: 3.53, y: 0.78, z: -1.4 },
  GENBEI: { x: 2.78, y: 0.25, z: -0.98 },
  PLATFORM: { x0: 1.4, x1: 5.0, z0: -2.4, z1: 1.2, y: 0.25 },
  PIER: { x0: -1.6, x1: 5.8, z0: -7.5, z1: -4.3, y: 0.05 },
  // 作業台の上の見張り台（やぐら）
  YAGURA: { x0: 3.2, x1: 6.2, z0: 0.7, z1: 3.7, y: 2.15 },
  OHARU: { x: 3.75, y: 2.15, z: 1.0 },
  BRIDGE_NEAR_X: -8,
  BRIDGE_FAR_X: 36,
  CASTLE: { x: 160, y: 0, z: 33 },
  SPAWN: { x: -24, y: 0.2, z: 10.5 },
} as const
