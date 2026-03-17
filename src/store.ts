import { create } from 'zustand';
import { Tool, METER } from './constants';
import type { WallNode, Wall, FurnitureItem, FloorState, CatalogItem } from './types';

function emptyFloor(): FloorState {
  return { nodes: [], walls: [], furniture: [] };
}

function cloneFloor(f: FloorState): FloorState {
  return JSON.parse(JSON.stringify(f));
}

interface Store {
  tool: Tool;
  snapSize: number; // 0 = off, otherwise world units (e.g. 10 = 10cm)
  labelsVisible: boolean;
  floors: FloorState[];
  fi: number;
  selectedId: number | null;
  wallStartId: number | null;
  nextId: number;
  stageX: number;
  stageY: number;
  stageScale: number;

  undoStack: FloorState[];
  redoStack: FloorState[];
  clipboard: FurnitureItem | null;
  fileCreatedAt: string | null;

  setTool(t: Tool): void;
  setSnapSize(s: number): void;
  toggleLabels(): void;
  select(id: number | null): void;
  setWallStart(id: number | null): void;
  setStageTransform(x: number, y: number, scale: number): void;

  addNode(x: number, y: number): number;
  addWall(a: number, b: number): void;
  deleteWall(id: number): void;
  deleteNode(id: number): void;
  moveNode(id: number, x: number, y: number): void;
  toggleExterior(id: number): void;
  splitWall(wallId: number, x: number, y: number): number | null;

  addFurniture(item: CatalogItem, cx: number, cy: number): number;
  deleteFurniture(id: number): void;
  updateFurniture(id: number, changes: Partial<FurnitureItem>): void;

  changeFloor(by: number): void;
  removeFloor(): boolean;

  undo(): void;
  redo(): void;
  copySelected(): void;
  pasteClipboard(): void;
  cutSelected(): void;

  save(): string;
  load(json: string): void;
}

export const useStore = create<Store>((set, get) => {
  function upFloor(fn: (f: FloorState) => FloorState) {
    const { fi, floors, undoStack } = get();
    const current = floors[fi];
    const newUndo = [...undoStack, cloneFloor(current)].slice(-50);
    set({
      floors: floors.map((f, i) => i === fi ? fn(f) : f),
      undoStack: newUndo,
      redoStack: [],
    });
  }
  function newId() {
    const id = get().nextId;
    set(s => ({ nextId: s.nextId + 1 }));
    return id;
  }

  return {
    tool: Tool.Select,
    snapSize: 10, // 10 world units = 10cm default
    labelsVisible: true,
    floors: [emptyFloor()],
    fi: 0,
    selectedId: null,
    wallStartId: null,
    nextId: 1,
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    undoStack: [],
    redoStack: [],
    clipboard: null,
    fileCreatedAt: null,

    setTool: (tool) => set({ tool, wallStartId: null, selectedId: null }),
    setSnapSize: (snapSize) => set({ snapSize }),
    toggleLabels: () => set(s => ({ labelsVisible: !s.labelsVisible })),
    select: (id) => set({ selectedId: id }),
    setWallStart: (id) => set({ wallStartId: id }),
    setStageTransform: (x, y, scale) => set({ stageX: x, stageY: y, stageScale: scale }),

    addNode(x, y) {
      const id = newId();
      upFloor(f => ({ ...f, nodes: [...f.nodes, { id, x, y }] }));
      return id;
    },

    addWall(a, b) {
      if (a === b) return;
      const f = get().floors[get().fi];
      if (f.walls.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return;
      const id = newId();
      upFloor(f => ({ ...f, walls: [...f.walls, { id, a, b, exterior: false }] }));
    },

    deleteWall(id) {
      const { fi, floors } = get();
      const wall = floors[fi].walls.find(w => w.id === id);
      if (!wall) return;
      upFloor(f => ({ ...f, walls: f.walls.filter(w => w.id !== id) }));
      const remaining = get().floors[get().fi].walls;
      const connected = new Set(remaining.flatMap(w => [w.a, w.b]));
      const orphans = [wall.a, wall.b].filter(nid => !connected.has(nid));
      if (orphans.length > 0)
        upFloor(f => ({ ...f, nodes: f.nodes.filter(n => !orphans.includes(n.id)) }));
    },

    deleteNode(nodeId) {
      if (get().wallStartId === nodeId) set({ wallStartId: null });
      upFloor(f => ({
        ...f,
        walls: f.walls.filter(w => w.a !== nodeId && w.b !== nodeId),
        nodes: f.nodes.filter(n => n.id !== nodeId),
      }));
    },

    moveNode(id, x, y) {
      upFloor(f => ({ ...f, nodes: f.nodes.map(n => n.id === id ? { ...n, x, y } : n) }));
    },

    toggleExterior(id) {
      upFloor(f => ({ ...f, walls: f.walls.map(w => w.id === id ? { ...w, exterior: !w.exterior } : w) }));
    },

    splitWall(wallId, x, y) {
      const f = get().floors[get().fi];
      const wall = f.walls.find(w => w.id === wallId);
      if (!wall) return null;
      const a = f.nodes.find(n => n.id === wall.a)!;
      const b = f.nodes.find(n => n.id === wall.b)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      const nx = a.x + t * dx;
      const ny = a.y + t * dy;
      const aId = wall.a, bId = wall.b, ext = wall.exterior;
      get().deleteWall(wallId);
      const mid = get().addNode(Math.round(nx), Math.round(ny));
      get().addWall(aId, mid);
      get().addWall(mid, bId);
      const { fi, floors } = get();
      const newWalls = floors[fi].walls.map(w =>
        (w.a === aId && w.b === mid) || (w.a === mid && w.b === bId)
          ? { ...w, exterior: ext }
          : w
      );
      set({ floors: floors.map((f, i) => i === fi ? { ...f, walls: newWalls } : f) });
      return mid;
    },

    addFurniture(item, cx, cy) {
      const id = newId();
      upFloor(f => ({
        ...f,
        furniture: [...f.furniture, {
          id,
          path: item.imagePath,
          x: cx - (item.width * METER) / 2,
          y: cy - (item.height * METER) / 2,
          w: item.width * METER,
          h: item.height * METER,
          rot: 0,
          zi: item.zIndex ?? 100,
        }],
      }));
      set({ selectedId: id, tool: Tool.Select });
      return id;
    },

    deleteFurniture(id) {
      upFloor(f => ({ ...f, furniture: f.furniture.filter(fi => fi.id !== id) }));
    },

    updateFurniture(id, changes) {
      upFloor(f => ({ ...f, furniture: f.furniture.map(fi => fi.id === id ? { ...fi, ...changes } : fi) }));
    },

    changeFloor(by) {
      const { fi, floors } = get();
      const newFi = fi + by;
      if (newFi < 0) return;
      const newFloors = newFi >= floors.length ? [...floors, emptyFloor()] : floors;
      set({ fi: newFi, floors: newFloors, selectedId: null, wallStartId: null, undoStack: [], redoStack: [] });
    },

    removeFloor() {
      const { fi, floors } = get();
      if (floors.length <= 1) return false;
      const newFi = Math.max(0, fi - 1);
      set({ fi: newFi, floors: floors.filter((_, i) => i !== fi), selectedId: null, wallStartId: null, undoStack: [], redoStack: [] });
      return true;
    },

    undo() {
      const { fi, floors, undoStack, redoStack } = get();
      if (undoStack.length === 0) return;
      const current = floors[fi];
      const prev = undoStack[undoStack.length - 1];
      set({
        floors: floors.map((f, i) => i === fi ? prev : f),
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, cloneFloor(current)],
        selectedId: null,
      });
    },

    redo() {
      const { fi, floors, undoStack, redoStack } = get();
      if (redoStack.length === 0) return;
      const current = floors[fi];
      const next = redoStack[redoStack.length - 1];
      set({
        floors: floors.map((f, i) => i === fi ? next : f),
        undoStack: [...undoStack, cloneFloor(current)],
        redoStack: redoStack.slice(0, -1),
        selectedId: null,
      });
    },

    copySelected() {
      const { selectedId, fi, floors } = get();
      if (!selectedId) return;
      const item = floors[fi].furniture.find(f => f.id === selectedId);
      if (item) set({ clipboard: JSON.parse(JSON.stringify(item)) });
    },

    pasteClipboard() {
      const { clipboard } = get();
      if (!clipboard) return;
      const id = newId();
      const pasted: FurnitureItem = { ...clipboard, id, x: clipboard.x + 20, y: clipboard.y + 20 };
      upFloor(f => ({ ...f, furniture: [...f.furniture, pasted] }));
      set({ selectedId: id });
    },

    cutSelected() {
      const { selectedId } = get();
      if (!selectedId) return;
      get().copySelected();
      get().deleteFurniture(selectedId);
      set({ selectedId: null });
    },

    save() {
      const { floors, nextId, fileCreatedAt } = get();
      const now = new Date().toISOString();
      const created = fileCreatedAt ?? now;
      if (!fileCreatedAt) set({ fileCreatedAt: created });
      return JSON.stringify({ version: '2.0.0', createdAt: created, lastModified: now, floors, nextId });
    },

    load(json) {
      const data = JSON.parse(json);
      set({
        floors: data.floors,
        nextId: data.nextId,
        fi: 0,
        selectedId: null,
        wallStartId: null,
        undoStack: [],
        redoStack: [],
        fileCreatedAt: data.createdAt ?? null,
      });
    },
  };
});
