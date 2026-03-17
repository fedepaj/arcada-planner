import { Stage, Layer, Rect, Line, Text, Image as KImage, Circle, Group } from 'react-konva';
import { useStore } from '../store';
import { WALL_THICKNESS, INTERIOR_WALL_THICKNESS, METER } from '../constants';
import { dist, angleDeg } from '../helpers';
import type { FloorState } from '../types';
import { useEffect, useState } from 'react';

const PAGE_W = 794;  // A4 at 96dpi
const PAGE_H = 1123;
const PAD = 60;

// Image cache shared with EditorStage (global)
const printImgCache = new Map<string, HTMLImageElement>();

function useFloorImages(floor: FloorState): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const paths = [...new Set(floor.furniture.map(f => `${import.meta.env.BASE_URL}assets/2d/${f.path}.svg`))];
    let loaded = 0;
    if (paths.length === 0) { setReady(true); return; }
    for (const src of paths) {
      if (printImgCache.has(src)) { loaded++; continue; }
      const el = new window.Image();
      el.onload = () => { printImgCache.set(src, el); loaded++; if (loaded === paths.length) setReady(true); };
      el.src = src;
    }
    if (loaded === paths.length) setReady(true);
  }, [floor]);
  return ready;
}

function floorBounds(floor: FloorState): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (floor.nodes.length === 0 && floor.furniture.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const n of floor.nodes) {
    minX = Math.min(minX, n.x - WALL_THICKNESS);
    minY = Math.min(minY, n.y - WALL_THICKNESS);
    maxX = Math.max(maxX, n.x + WALL_THICKNESS);
    maxY = Math.max(maxY, n.y + WALL_THICKNESS);
  }

  for (const f of floor.furniture) {
    const rad = f.rot * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const corners = [
      { x: f.x, y: f.y },
      { x: f.x + f.w * cos, y: f.y + f.w * sin },
      { x: f.x - f.h * sin, y: f.y + f.h * cos },
      { x: f.x + f.w * cos - f.h * sin, y: f.y + f.w * sin + f.h * cos },
    ];
    for (const c of corners) {
      minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y);
    }
  }

  return { minX, minY, maxX, maxY };
}

function PrintFloor({ floor, index }: { floor: FloorState; index: number }) {
  const ready = useFloorImages(floor);
  const bounds = floorBounds(floor);

  if (!bounds) {
    return (
      <div className="print-page">
        <h2>Floor {index}</h2>
        <p style={{ color: '#999' }}>Empty floor</p>
      </div>
    );
  }

  const contentW = bounds.maxX - bounds.minX;
  const contentH = bounds.maxY - bounds.minY;
  const drawW = PAGE_W - PAD * 2;
  const drawH = PAGE_H - PAD * 2 - 40; // 40px for title
  const scaleVal = Math.min(drawW / contentW, drawH / contentH, 1);
  const offsetX = PAD + (drawW - contentW * scaleVal) / 2 - bounds.minX * scaleVal;
  const offsetY = PAD + 40 + (drawH - contentH * scaleVal) / 2 - bounds.minY * scaleVal;

  return (
    <div className="print-page">
      <h2 style={{ textAlign: 'center', fontSize: 16, fontWeight: 600, padding: '12px 0 4px', margin: 0 }}>
        Floor {index}
      </h2>
      <Stage width={PAGE_W} height={PAGE_H - 40} x={offsetX} y={offsetY - 40} scaleX={scaleVal} scaleY={scaleVal}>
        <Layer listening={false}>
          {/* Walls */}
          {floor.walls.map(w => {
            const na = floor.nodes.find(n => n.id === w.a);
            const nb = floor.nodes.find(n => n.id === w.b);
            if (!na || !nb) return null;
            const length = dist(na.x, na.y, nb.x, nb.y);
            const angle = angleDeg(na.x, na.y, nb.x, nb.y);
            const thick = w.exterior ? WALL_THICKNESS : INTERIOR_WALL_THICKNESS;
            const fill = w.exterior ? '#b8a89a' : '#d4c4b8';
            const meters = Math.max(0, (length - WALL_THICKNESS) / METER).toFixed(2);
            return (
              <Group key={w.id} x={na.x} y={na.y} rotation={angle}>
                <Rect x={0} y={-thick / 2} width={length} height={thick} fill={fill} stroke="#1a1a1a" strokeWidth={1} />
                {length > 30 && (
                  <Text text={meters + ' m'} fontSize={11} fill="#555" x={length / 2} y={thick / 2 + 4} offsetX={meters.length * 3} />
                )}
              </Group>
            );
          })}

          {/* Nodes */}
          {floor.nodes.map(n => (
            <Circle key={n.id} x={n.x} y={n.y} radius={6} fill="#444" stroke="#222" strokeWidth={1} />
          ))}

          {/* Furniture */}
          {ready && floor.furniture.map(f => {
            const img = printImgCache.get(`${import.meta.env.BASE_URL}assets/2d/${f.path}.svg`);
            return (
              <Group key={f.id} x={f.x} y={f.y} rotation={f.rot}>
                {img ? <KImage image={img} width={f.w} height={f.h} /> : <Rect width={f.w} height={f.h} fill="#eee" stroke="#ccc" strokeWidth={1} />}
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}

export function PrintView() {
  const floors = useStore(s => s.floors);

  return (
    <div className="print-view">
      {floors.map((floor, i) => (
        <PrintFloor key={i} floor={floor} index={i} />
      ))}
    </div>
  );
}
