import { SNAP_SIZE } from './constants';

export function snap(val: number): number {
  const rest = val % SNAP_SIZE;
  return rest < SNAP_SIZE / 2 ? val - rest : val - rest + SNAP_SIZE;
}

export function snapPt(x: number, y: number, doSnap: boolean): { x: number; y: number } {
  if (!doSnap) return { x: Math.round(x), y: Math.round(y) };
  return { x: snap(x), y: snap(y) };
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function angleDeg(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
}

/** Transform a point from item-local space to world space (accounting for rotation around item origin) */
export function localToWorld(lx: number, ly: number, ox: number, oy: number, rotDeg: number): { x: number; y: number } {
  const rad = rotDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: ox + lx * cos - ly * sin, y: oy + lx * sin + ly * cos };
}

/** Transform a point from world space to item-local space */
export function worldToLocal(wx: number, wy: number, ox: number, oy: number, rotDeg: number): { x: number; y: number } {
  const rad = -rotDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = wx - ox;
  const dy = wy - oy;
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}
