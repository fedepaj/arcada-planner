import { useEffect, useRef, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Line, Text, Image as KImage, Circle, Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useStore } from '../store';
import { Tool, WALL_THICKNESS, INTERIOR_WALL_THICKNESS, WORLD, METER } from '../constants';
import { dist, angleDeg, localToWorld, worldToLocal } from '../helpers';
import type { WallNode, Wall, FurnitureItem } from '../types';

const TOOLBAR_W = 80;
const PANEL_W = 260;
const NODE_RADIUS = 9;
const NODE_HIT_RADIUS = 14;
const NODE_HIT_RADIUS_WALL = 30; // generous radius for wall-mode node snapping (touch-friendly)
const HANDLE_SIZE = 8;
const HANDLE_HIT = 10;
const ROT_HANDLE_DIST = 30;
const MIN_SIZE = 10;

// ── Grid helpers ──────────────────────────────────────────────
const INTERVALS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
function getGridInterval(scale: number, minPx: number) {
  for (const iv of INTERVALS) if (iv * scale >= minPx) return iv;
  return INTERVALS[INTERVALS.length - 1];
}
function gridSnap(v: number, iv: number) { return Math.round(v / iv) * iv; }
function doSnap(x: number, y: number, snapSz: number) {
  return snapSz > 0 ? { x: gridSnap(x, snapSz), y: gridSnap(y, snapSz) } : { x: Math.round(x), y: Math.round(y) };
}

// ── Hit detection math ────────────────────────────────────────
function pointInRotatedRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number, rotDeg: number): boolean {
  const rad = -rotDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - rx;
  const dy = py - ry;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return localX >= 0 && localX <= rw && localY >= 0 && localY <= rh;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

// ── Handle definitions ────────────────────────────────────────
type HandleAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br';
const ANCHORS: { id: HandleAnchor; lx: (w: number) => number; ly: (h: number) => number; cursor: string }[] = [
  { id: 'tl', lx: () => 0,     ly: () => 0,     cursor: 'nwse-resize' },
  { id: 'tc', lx: (w) => w / 2, ly: () => 0,     cursor: 'ns-resize' },
  { id: 'tr', lx: (w) => w,     ly: () => 0,     cursor: 'nesw-resize' },
  { id: 'ml', lx: () => 0,     ly: (h) => h / 2, cursor: 'ew-resize' },
  { id: 'mr', lx: (w) => w,     ly: (h) => h / 2, cursor: 'ew-resize' },
  { id: 'bl', lx: () => 0,     ly: (h) => h,     cursor: 'nesw-resize' },
  { id: 'bc', lx: (w) => w / 2, ly: (h) => h,     cursor: 'ns-resize' },
  { id: 'br', lx: (w) => w,     ly: (h) => h,     cursor: 'nwse-resize' },
];

type DragState =
  | { type: 'furniture'; id: number; offX: number; offY: number }
  | { type: 'node'; id: number; offX: number; offY: number }
  | { type: 'resize'; id: number; anchor: HandleAnchor; startItem: FurnitureItem }
  | { type: 'rotate'; id: number; centerX: number; centerY: number; startAngle: number; startRot: number }
  | { type: 'wall-draw'; startNodeId: number; startPt: { x: number; y: number }; moved: boolean }
  | null;

const WALL_DRAG_THRESHOLD = 8; // px in world coords — distinguishes tap from drag

// ── Image cache (global, never GC'd per session) ─────────────
const imgCache = new Map<string, HTMLImageElement>();
const imgLoading = new Set<string>();
function useImage(src: string, onLoad: () => void): HTMLImageElement | null {
  const cached = imgCache.get(src);
  if (cached) return cached;
  if (!imgLoading.has(src)) {
    imgLoading.add(src);
    const el = new window.Image();
    el.onload = () => { imgCache.set(src, el); imgLoading.delete(src); onLoad(); };
    el.src = src;
  }
  return null;
}

// ── EditorStage ───────────────────────────────────────────────
export function EditorStage() {
  const stageRef  = useRef<Konva.Stage>(null);
  const isPanning = useRef(false);
  const panStart  = useRef({ x: 0, y: 0 });
  const posAtPan  = useRef({ x: 0, y: 0 });
  const dragRef   = useRef<DragState>(null);
  const pinchRef  = useRef<{ dist: number; midX: number; midY: number; scale0: number; posX0: number; posY0: number } | null>(null);

  const [pos,   setPos]   = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [size,  setSize]  = useState({ w: window.innerWidth, h: window.innerHeight });
  const [previewPt, setPreviewPt] = useState<{ x: number; y: number } | null>(null);
  const [, forceRender] = useState(0);

  const store         = useStore();
  const tool          = useStore(s => s.tool);
  const snapSize      = useStore(s => s.snapSize);
  const labelsVisible = useStore(s => s.labelsVisible);
  const wallStartId   = useStore(s => s.wallStartId);
  const selectedId    = useStore(s => s.selectedId);
  const floor         = useStore(s => s.floors[s.fi]);

  function updateStage(x: number, y: number, s: number) {
    setPos({ x, y });
    setScale(s);
    store.setStageTransform(x, y, s);
  }

  useEffect(() => {
    const mobile = window.innerWidth < 768;
    const tbW = mobile ? 0 : TOOLBAR_W;
    const pW  = mobile ? 0 : PANEL_W;
    const x = tbW + (window.innerWidth - tbW - pW) / 2 - WORLD / 2;
    const y = (window.innerHeight - (mobile ? 56 : 0)) / 2 - WORLD / 2;
    updateStage(x, y, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fn = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.code === 'KeyS') { e.preventDefault(); localStorage.setItem('arcada-autosave', store.save()); }
      if (mod && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); store.undo(); }
      if ((mod && e.shiftKey && e.code === 'KeyZ') || (mod && e.code === 'KeyY')) { e.preventDefault(); store.redo(); }
      if (mod && e.code === 'KeyC') { e.preventDefault(); store.copySelected(); }
      if (mod && e.code === 'KeyV') { e.preventDefault(); store.pasteClipboard(); }
      if (mod && e.code === 'KeyX') { e.preventDefault(); store.cutSelected(); }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (store.selectedId && !(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          store.deleteFurniture(store.selectedId);
          store.select(null);
        }
      }
      if (e.code === 'Escape') { store.setWallStart(null); store.select(null); store.setTool(Tool.Select); }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [store]);

  // Grid
  const minorIv = getGridInterval(scale, 12);
  const majorIv = getGridInterval(scale, 80);
  const viewL = Math.max(0, -pos.x / scale);
  const viewT = Math.max(0, -pos.y / scale);
  const viewR = Math.min(WORLD, viewL + size.w / scale);
  const viewB = Math.min(WORLD, viewT + size.h / scale);

  const mxT = useMemo(() => {
    const out: number[] = [];
    for (let v = Math.floor(viewL / minorIv) * minorIv; v <= viewR && v <= WORLD; v += minorIv) if (v >= 0) out.push(v);
    return out;
  }, [viewL, viewR, minorIv]);
  const myT = useMemo(() => {
    const out: number[] = [];
    for (let v = Math.floor(viewT / minorIv) * minorIv; v <= viewB && v <= WORLD; v += minorIv) if (v >= 0) out.push(v);
    return out;
  }, [viewT, viewB, minorIv]);
  const MxT = majorIv !== minorIv ? (() => { const out: number[] = []; for (let v = Math.floor(viewL / majorIv) * majorIv; v <= viewR && v <= WORLD; v += majorIv) if (v >= 0) out.push(v); return out; })() : [];
  const MyT = majorIv !== minorIv ? (() => { const out: number[] = []; for (let v = Math.floor(viewT / majorIv) * majorIv; v <= viewB && v <= WORLD; v += majorIv) if (v >= 0) out.push(v); return out; })() : [];
  const majSet = new Set([...MxT, ...MyT]);

  // ── Manual hit detection ────────────────────────────────────
  function getWorld(): { x: number; y: number } | null {
    return stageRef.current?.getRelativePointerPosition() ?? null;
  }

  function hitHandle(wx: number, wy: number): { type: 'resize'; anchor: HandleAnchor; cursor: string } | { type: 'rotate' } | null {
    if (selectedId === null) return null;
    const item = floor.furniture.find(f => f.id === selectedId);
    if (!item) return null;
    const thr = HANDLE_HIT / scale;

    // Check rotation handle first
    const rotPt = localToWorld(item.w / 2, -ROT_HANDLE_DIST / scale, item.x, item.y, item.rot);
    if (dist(wx, wy, rotPt.x, rotPt.y) < thr) return { type: 'rotate' };

    // Check resize handles
    for (const a of ANCHORS) {
      const hPt = localToWorld(a.lx(item.w), a.ly(item.h), item.x, item.y, item.rot);
      if (dist(wx, wy, hPt.x, hPt.y) < thr) return { type: 'resize', anchor: a.id, cursor: a.cursor };
    }
    return null;
  }

  function hitFurniture(wx: number, wy: number): FurnitureItem | null {
    for (let i = floor.furniture.length - 1; i >= 0; i--) {
      const f = floor.furniture[i];
      if (pointInRotatedRect(wx, wy, f.x, f.y, f.w, f.h, f.rot)) return f;
    }
    return null;
  }

  function hitNode(wx: number, wy: number, radius = NODE_HIT_RADIUS): WallNode | null {
    const thr = Math.max(radius, radius / scale);
    let best: WallNode | null = null, bestD = thr;
    for (const n of floor.nodes) {
      const d = dist(wx, wy, n.x, n.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function hitWall(wx: number, wy: number): Wall | null {
    for (const w of floor.walls) {
      const na = floor.nodes.find(n => n.id === w.a);
      const nb = floor.nodes.find(n => n.id === w.b);
      if (!na || !nb) continue;
      const thick = w.exterior ? WALL_THICKNESS : INTERIOR_WALL_THICKNESS;
      if (distToSegment(wx, wy, na.x, na.y, nb.x, nb.y) < thick / 2 + 4) return w;
    }
    return null;
  }

  // ── Resize math ─────────────────────────────────────────────
  function applyResize(wx: number, wy: number, anchor: HandleAnchor, startItem: FurnitureItem) {
    const local = worldToLocal(wx, wy, startItem.x, startItem.y, startItem.rot);
    let newX = startItem.x, newY = startItem.y;
    let newW = startItem.w, newH = startItem.h;

    const movesLeft   = anchor === 'tl' || anchor === 'ml' || anchor === 'bl';
    const movesTop    = anchor === 'tl' || anchor === 'tc' || anchor === 'tr';
    const movesRight  = anchor === 'tr' || anchor === 'mr' || anchor === 'br';
    const movesBottom = anchor === 'bl' || anchor === 'bc' || anchor === 'br';

    if (movesRight) newW = Math.max(MIN_SIZE, local.x);
    if (movesBottom) newH = Math.max(MIN_SIZE, local.y);
    if (movesLeft) {
      const clampedX = Math.min(local.x, startItem.w - MIN_SIZE);
      newW = startItem.w - clampedX;
      const origin = localToWorld(clampedX, 0, startItem.x, startItem.y, startItem.rot);
      newX = origin.x;
      newY = origin.y;
    }
    if (movesTop) {
      const clampedY = Math.min(local.y, startItem.h - MIN_SIZE);
      newH = startItem.h - clampedY;
      const origin = localToWorld(movesLeft ? Math.min(local.x, startItem.w - MIN_SIZE) : 0, clampedY, startItem.x, startItem.y, startItem.rot);
      newX = origin.x;
      newY = origin.y;
    }

    return { x: newX, y: newY, w: newW, h: newH };
  }

  // ── Shared pointer logic ────────────────────────────────────
  function handlePointerDown(pt: { x: number; y: number }) {
    // Remove tool
    if (tool === Tool.Remove) {
      const fur = hitFurniture(pt.x, pt.y);
      if (fur) { store.deleteFurniture(fur.id); store.select(null); return; }
      const node = hitNode(pt.x, pt.y);
      if (node) { store.deleteNode(node.id); return; }
      const wall = hitWall(pt.x, pt.y);
      if (wall) { store.deleteWall(wall.id); return; }
      return;
    }

    // Wall-add tool — drag-to-draw: down = start node, drag = preview, up = end node + wall
    if (tool === Tool.WallAdd) {
      // Try to snap to existing node or wall split
      const existingNode = hitNode(pt.x, pt.y, NODE_HIT_RADIUS_WALL);
      if (existingNode) {
        // If chaining from a previous wall, connect first
        if (wallStartId !== null && wallStartId !== existingNode.id) {
          store.addWall(wallStartId, existingNode.id);
        }
        store.setWallStart(existingNode.id);
        dragRef.current = { type: 'wall-draw', startNodeId: existingNode.id, startPt: pt, moved: false };
        return;
      }
      const wall = hitWall(pt.x, pt.y);
      if (wall) {
        const m = store.splitWall(wall.id, pt.x, pt.y);
        if (m !== null) {
          store.setWallStart(m);
          dragRef.current = { type: 'wall-draw', startNodeId: m, startPt: pt, moved: false };
        }
        return;
      }
      // Empty space — create a new node
      const p = doSnap(pt.x, pt.y, snapSize);
      const nearby = hitNode(p.x, p.y, NODE_HIT_RADIUS_WALL);
      let startId: number;
      if (nearby) {
        if (wallStartId !== null && wallStartId !== nearby.id) store.addWall(wallStartId, nearby.id);
        startId = nearby.id;
      } else {
        startId = store.addNode(p.x, p.y);
        if (wallStartId !== null) store.addWall(wallStartId, startId);
      }
      store.setWallStart(startId);
      dragRef.current = { type: 'wall-draw', startNodeId: startId, startPt: pt, moved: false };
      return;
    }

    // Select tool — handles, furniture, nodes
    const handle = hitHandle(pt.x, pt.y);
    if (handle) {
      const item = floor.furniture.find(f => f.id === selectedId)!;
      if (handle.type === 'resize') {
        dragRef.current = { type: 'resize', id: item.id, anchor: handle.anchor, startItem: { ...item } };
      } else {
        const center = localToWorld(item.w / 2, item.h / 2, item.x, item.y, item.rot);
        const startAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
        dragRef.current = { type: 'rotate', id: item.id, centerX: center.x, centerY: center.y, startAngle, startRot: item.rot };
      }
      return;
    }

    const fur = hitFurniture(pt.x, pt.y);
    if (fur) {
      store.select(fur.id);
      dragRef.current = { type: 'furniture', id: fur.id, offX: pt.x - fur.x, offY: pt.y - fur.y };
      return;
    }

    if (tool === Tool.Select) {
      const node = hitNode(pt.x, pt.y);
      if (node) {
        dragRef.current = { type: 'node', id: node.id, offX: pt.x - node.x, offY: pt.y - node.y };
        return;
      }
    }

    store.select(null);
  }

  function handlePointerDrag(pt: { x: number; y: number }) {
    const d = dragRef.current;
    if (!d) return;
    if (d.type === 'furniture') {
      store.updateFurniture(d.id, { x: pt.x - d.offX, y: pt.y - d.offY });
    } else if (d.type === 'node') {
      store.moveNode(d.id, pt.x - d.offX, pt.y - d.offY);
    } else if (d.type === 'resize') {
      const changes = applyResize(pt.x, pt.y, d.anchor, d.startItem);
      store.updateFurniture(d.id, changes);
    } else if (d.type === 'rotate') {
      const currentAngle = Math.atan2(pt.y - d.centerY, pt.x - d.centerX);
      let newRot = d.startRot + (currentAngle - d.startAngle) * 180 / Math.PI;
      if (snapSize > 0) newRot = Math.round(newRot / 15) * 15;
      store.updateFurniture(d.id, { rot: newRot });
    } else if (d.type === 'wall-draw') {
      // Mark as dragged once past threshold
      if (!d.moved && dist(pt.x, pt.y, d.startPt.x, d.startPt.y) > WALL_DRAG_THRESHOLD / scale) {
        d.moved = true;
      }
      if (d.moved) {
        // Show wall preview to snapped endpoint (or snap to nearby node)
        const nearNode = hitNode(pt.x, pt.y, NODE_HIT_RADIUS_WALL);
        if (nearNode) {
          setPreviewPt({ x: nearNode.x, y: nearNode.y });
        } else {
          setPreviewPt(doSnap(pt.x, pt.y, snapSize));
        }
      }
    }
  }

  function handlePointerUp() {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const pt = getWorld();

    if (d.type === 'wall-draw') {
      dragRef.current = null;
      if (!d.moved) {
        // Tap without drag → end the chain (deselect wallStart)
        store.setWallStart(null);
        setPreviewPt(null);
        return;
      }
      // Drag completed → create end node + wall
      if (!pt) { setPreviewPt(null); return; }
      const nearNode = hitNode(pt.x, pt.y, NODE_HIT_RADIUS_WALL);
      let endId: number;
      if (nearNode && nearNode.id !== d.startNodeId) {
        endId = nearNode.id;
      } else if (nearNode && nearNode.id === d.startNodeId) {
        // Dragged back to start — cancel
        setPreviewPt(null);
        return;
      } else {
        const p = doSnap(pt.x, pt.y, snapSize);
        const existing = hitNode(p.x, p.y, NODE_HIT_RADIUS_WALL);
        if (existing && existing.id !== d.startNodeId) {
          endId = existing.id;
        } else {
          endId = store.addNode(p.x, p.y);
        }
      }
      store.addWall(d.startNodeId, endId);
      store.setWallStart(endId); // chain: ready for next drag
      setPreviewPt(null);
      return;
    }

    if (pt) {
      if (d.type === 'furniture') {
        const p = doSnap(pt.x - d.offX, pt.y - d.offY, snapSize);
        store.updateFurniture(d.id, p);
      } else if (d.type === 'node') {
        const p = doSnap(pt.x - d.offX, pt.y - d.offY, snapSize);
        store.moveNode(d.id, p.x, p.y);
      }
    }
    dragRef.current = null;
  }

  // ── Mouse event handlers ───────────────────────────────────
  function onWheel(ev: KonvaEventObject<WheelEvent>) {
    ev.evt.preventDefault();
    const factor = ev.evt.deltaY < 0 ? 1.1 : 0.9;
    const ns = Math.max(0.1, Math.min(20, scale * factor));
    const ptr = stageRef.current!.getPointerPosition()!;
    updateStage(ptr.x - (ptr.x - pos.x) / scale * ns, ptr.y - (ptr.y - pos.y) / scale * ns, ns);
  }

  function onMouseDown(e: KonvaEventObject<MouseEvent>) {
    if (e.evt.button === 2) {
      const pt = getWorld();
      if (pt) {
        const wall = hitWall(pt.x, pt.y);
        if (wall) { store.toggleExterior(wall.id); return; }
      }
      isPanning.current = true;
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY };
      posAtPan.current = { ...pos };
      const container = stageRef.current?.container();
      if (container) container.style.cursor = 'grabbing';
      return;
    }
    if (e.evt.button !== 0) return;
    const pt = getWorld();
    if (!pt) return;
    handlePointerDown(pt);
  }

  function onMouseMove(e: KonvaEventObject<MouseEvent>) {
    if (isPanning.current) {
      updateStage(
        posAtPan.current.x + e.evt.clientX - panStart.current.x,
        posAtPan.current.y + e.evt.clientY - panStart.current.y,
        scale
      );
      return;
    }

    if (dragRef.current) {
      const pt = getWorld();
      if (!pt) return;
      handlePointerDrag(pt);
      return;
    }

    // Wall hover preview (mouse only — no button pressed, chain active)
    if (tool === Tool.WallAdd && wallStartId !== null) {
      const pt = getWorld();
      if (pt) setPreviewPt(doSnap(pt.x, pt.y, snapSize));
    } else if (previewPt && !dragRef.current) {
      setPreviewPt(null);
    }

    // Cursor hint
    const container = stageRef.current?.container();
    if (container) {
      const pt = getWorld();
      if (pt) {
        if (tool === Tool.Select) {
          const handle = hitHandle(pt.x, pt.y);
          if (handle) {
            container.style.cursor = handle.type === 'rotate' ? 'grab' : (handle as { cursor: string }).cursor;
          } else {
            const fur = hitFurniture(pt.x, pt.y);
            container.style.cursor = fur ? 'move' : 'default';
          }
        } else if (tool === Tool.Remove) {
          const fur = hitFurniture(pt.x, pt.y);
          const node = hitNode(pt.x, pt.y);
          const wall = hitWall(pt.x, pt.y);
          container.style.cursor = (fur || node || wall) ? 'pointer' : 'default';
        } else if (tool === Tool.WallAdd) {
          container.style.cursor = 'crosshair';
        } else {
          container.style.cursor = 'default';
        }
      }
    }
  }

  function onMouseUp(e: KonvaEventObject<MouseEvent>) {
    if (e.evt.button === 2) {
      isPanning.current = false;
      const container = stageRef.current?.container();
      if (container) container.style.cursor = 'default';
      return;
    }
    handlePointerUp();
  }

  // ── Touch event handlers ───────────────────────────────────
  function onTouchStart(e: KonvaEventObject<TouchEvent>) {
    e.evt.preventDefault();
    const touches = e.evt.touches;

    if (touches.length >= 2) {
      // Start pinch/pan — cancel any ongoing drag
      dragRef.current = null;
      const t0 = touches[0], t1 = touches[1];
      pinchRef.current = {
        dist: dist(t0.clientX, t0.clientY, t1.clientX, t1.clientY),
        midX: (t0.clientX + t1.clientX) / 2,
        midY: (t0.clientY + t1.clientY) / 2,
        scale0: scale, posX0: pos.x, posY0: pos.y,
      };
      return;
    }

    // Single touch = left click
    const pt = getWorld();
    if (!pt) return;
    handlePointerDown(pt);
  }

  function onTouchMove(e: KonvaEventObject<TouchEvent>) {
    e.evt.preventDefault();
    const touches = e.evt.touches;

    if (touches.length >= 2 && pinchRef.current) {
      const t0 = touches[0], t1 = touches[1];
      const newDist = dist(t0.clientX, t0.clientY, t1.clientX, t1.clientY);
      const newMidX = (t0.clientX + t1.clientX) / 2;
      const newMidY = (t0.clientY + t1.clientY) / 2;
      const p = pinchRef.current;

      const zoomFactor = newDist / p.dist;
      const ns = Math.max(0.1, Math.min(20, p.scale0 * zoomFactor));

      // Zoom centered on initial midpoint, then add pan offset
      let nx = p.midX - (p.midX - p.posX0) / p.scale0 * ns;
      let ny = p.midY - (p.midY - p.posY0) / p.scale0 * ns;
      nx += newMidX - p.midX;
      ny += newMidY - p.midY;

      updateStage(nx, ny, ns);
      return;
    }

    // Single touch drag (furniture, nodes, resize, rotate, wall-draw)
    if (dragRef.current) {
      const pt = getWorld();
      if (!pt) return;
      handlePointerDrag(pt);
      return;
    }
  }

  function onTouchEnd(e: KonvaEventObject<TouchEvent>) {
    e.evt.preventDefault();

    // If pinching and fingers lifted, clear pinch state
    if (pinchRef.current) {
      if (e.evt.touches.length < 2) pinchRef.current = null;
      return;
    }

    handlePointerUp();
  }

  const startNode = wallStartId !== null ? floor.nodes.find(n => n.id === wallStartId) : null;
  const selectedItem = selectedId !== null ? floor.furniture.find(f => f.id === selectedId) : null;
  const onImageLoaded = () => forceRender(c => c + 1);

  return (
    <Stage
      ref={stageRef}
      width={size.w} height={size.h}
      x={pos.x} y={pos.y} scaleX={scale} scaleY={scale}
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onContextMenu={(e: KonvaEventObject<MouseEvent>) => e.evt.preventDefault()}
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, touchAction: 'none' }}
    >
      {/* Grid */}
      <Layer listening={false}>
        <Rect x={0} y={0} width={WORLD} height={WORLD} fill="white" />
        {mxT.map(t => <Line key={`vx${t}`} points={[t, viewT, t, viewB]} stroke={majSet.has(t) ? '#d0d0d0' : '#ebebeb'} strokeWidth={majSet.has(t) ? 0.8 : 0.5} />)}
        {myT.map(t => <Line key={`hy${t}`} points={[viewL, t, viewR, t]} stroke={majSet.has(t) ? '#d0d0d0' : '#ebebeb'} strokeWidth={majSet.has(t) ? 0.8 : 0.5} />)}
      </Layer>

      {/* All shapes */}
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
              {labelsVisible && length > 30 && (
                <Text text={meters + ' m'} fontSize={11} fill="#555" x={length / 2} y={thick / 2 + 4} offsetX={meters.length * 3} />
              )}
            </Group>
          );
        })}

        {/* Nodes */}
        {floor.nodes.map(n => {
          const isStart = n.id === wallStartId;
          return (
            <Circle key={n.id} x={n.x} y={n.y} radius={NODE_RADIUS}
              fill={isStart ? '#1a73e8' : '#444'}
              stroke={isStart ? '#fff' : '#222'}
              strokeWidth={isStart ? 2 : 1} />
          );
        })}

        {/* Wall preview */}
        {startNode && previewPt && (
          <Line points={[startNode.x, startNode.y, previewPt.x, previewPt.y]}
            stroke="#1a73e8" strokeWidth={1.5} dash={[6, 4]} />
        )}

        {/* Furniture */}
        {floor.furniture.map(item => (
          <FurnitureVisual key={item.id} item={item} onImageLoaded={onImageLoaded} />
        ))}

        {/* Selection handles */}
        {selectedItem && <SelectionHandles item={selectedItem} scale={scale} />}
      </Layer>
    </Stage>
  );
}

// ── Selection handles (purely visual) ─────────────────────────
function SelectionHandles({ item, scale }: { item: FurnitureItem; scale: number }) {
  const hs = HANDLE_SIZE / scale;
  const rotDist = ROT_HANDLE_DIST / scale;
  const rotRadius = 5 / scale;
  const lineWidth = 1.5 / scale;

  return (
    <Group x={item.x} y={item.y} rotation={item.rot}>
      {/* Selection border */}
      <Rect x={-2 / scale} y={-2 / scale} width={item.w + 4 / scale} height={item.h + 4 / scale}
        stroke="#1a73e8" strokeWidth={lineWidth} dash={[6 / scale, 3 / scale]} />

      {/* Resize handles */}
      {ANCHORS.map(a => (
        <Rect key={a.id}
          x={a.lx(item.w) - hs / 2} y={a.ly(item.h) - hs / 2}
          width={hs} height={hs}
          fill="white" stroke="#1a73e8" strokeWidth={lineWidth} />
      ))}

      {/* Rotation handle line + circle */}
      <Line points={[item.w / 2, 0, item.w / 2, -rotDist]} stroke="#1a73e8" strokeWidth={lineWidth} />
      <Circle x={item.w / 2} y={-rotDist} radius={rotRadius}
        fill="white" stroke="#1a73e8" strokeWidth={lineWidth} />
    </Group>
  );
}

// ── Purely visual furniture ───────────────────────────────────
function FurnitureVisual({ item, onImageLoaded }: { item: FurnitureItem; onImageLoaded: () => void }) {
  const img = useImage(`${import.meta.env.BASE_URL}assets/2d/${item.path}.svg`, onImageLoaded);

  return (
    <Group x={item.x} y={item.y} rotation={item.rot}>
      {img && <KImage image={img} width={item.w} height={item.h} />}
      {!img && <Rect width={item.w} height={item.h} fill="#f0f0f0" stroke="#ccc" strokeWidth={1} dash={[4, 2]} />}
    </Group>
  );
}
