# Architecture — Arcada Planner v2

Technical documentation for developers who want to understand, modify, or extend the codebase.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 18 |
| Canvas rendering | Konva.js + react-konva |
| State management | Zustand v5 |
| Icons | lucide-react |
| Build tool | Vite 5 |
| Language | TypeScript 5.6 |

---

## Project structure

```
arcada-v2/
├── public/
│   └── assets/2d/           # SVG furniture sprites (80+ items)
├── src/
│   ├── main.tsx              # Entry point, renders <App />
│   ├── App.tsx               # Root layout: EditorStage + Toolbar + FurniturePanel + SelectionPanel + PrintView
│   ├── App.css               # All styles (single CSS file, no CSS modules)
│   ├── constants.ts          # METER, WALL_THICKNESS, WORLD size, Tool enum
│   ├── types.ts              # WallNode, Wall, FurnitureItem, FloorState, CatalogItem
│   ├── helpers.ts            # Geometry utilities: dist, angleDeg, localToWorld, worldToLocal
│   ├── store.ts              # Zustand store — single source of truth
│   ├── catalog.json          # Furniture catalog data (categories + items)
│   └── ui/
│       ├── EditorStage.tsx   # Main canvas: grid, walls, nodes, furniture, hit detection, drag logic
│       ├── Toolbar.tsx       # Left sidebar: tool buttons, floor controls, snap, save/load/print/help
│       ├── FurniturePanel.tsx # Right sidebar: category tabs + furniture grid
│       └── PrintView.tsx     # Hidden print-only rendering of all floors
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Core concepts

### Coordinate system

The world is a square of `WORLD × WORLD` pixels (default 5000×5000). One meter equals `METER = 100` world units. So a 3m wall is 300 world units long.

All positions (nodes, furniture, handles) are in world coordinates. The Stage has a pan offset (`pos.x`, `pos.y`) and a `scale` that convert between world and screen space:

```
screenX = pos.x + worldX * scale
worldX  = (screenX - pos.x) / scale
```

### Tool enum

```typescript
enum Tool { Select, Remove, WallAdd }
```

- **Select** — default. Click to select furniture or wall nodes, drag to move, use handles to resize/rotate.
- **Remove** — click any furniture, node, or wall to delete it.
- **WallAdd** — click to place wall nodes. Click an existing node to connect. Click on a wall to split it.

### Why there is no `Tool.View` or `Tool.Edit`

Originally there were separate View (pan-only) and Edit (allows dragging) tools. These were merged into a single **Select** tool because:
- Pan is always available via right-click drag, so a dedicated View tool was redundant.
- Users expected to be able to click and drag things in any mode.

---

## State management (Zustand)

All application state lives in a single Zustand store (`src/store.ts`). Key slices:

| Field | Type | Purpose |
|---|---|---|
| `tool` | `Tool` | Current active tool |
| `snapSize` | `number` | Snap grid size in world units (0 = off, 10 = 10cm default) |
| `floors` | `FloorState[]` | Array of floors, each with nodes, walls, furniture |
| `fi` | `number` | Current floor index |
| `selectedId` | `number \| null` | Currently selected furniture item |
| `wallStartId` | `number \| null` | Node where the current wall chain starts |
| `undoStack` | `FloorState[]` | Up to 50 snapshots for undo |
| `redoStack` | `FloorState[]` | Redo snapshots |
| `clipboard` | `FurnitureItem \| null` | Copy/paste buffer |

### Undo/Redo

Every mutation goes through `upFloor()`, which:
1. Clones the current floor state via `JSON.parse(JSON.stringify(...))`
2. Pushes it onto `undoStack` (max 50 entries)
3. Clears `redoStack`
4. Applies the mutation

Undo pops from `undoStack` and pushes current state to `redoStack`. Redo does the reverse.

### ID generation

A monotonically increasing `nextId` counter is stored in state. Every new node, wall, or furniture item gets a unique ID via `newId()`. IDs are persisted in save files to maintain consistency.

---

## Rendering architecture

### Why `listening={false}` everywhere

Konva's built-in hit detection uses a hidden "hit canvas" that re-renders shapes with unique colors. This approach was **fundamentally broken** in our setup — clicks consistently went to the Stage instead of individual shapes, regardless of configuration.

**Solution:** All Konva shapes are set to `listening={false}` (purely visual). Hit detection is done entirely through manual geometry math at the Stage level.

### Hit detection pipeline

On `mouseDown`, the code checks (in priority order):

1. **Resize/rotate handles** — distance from cursor to each handle's world position
2. **Furniture** — `pointInRotatedRect()`: transforms cursor into item-local space, checks bounding box
3. **Wall nodes** — distance to each node (with threshold)
4. **Walls** — `distToSegment()`: perpendicular distance to wall line segment

```typescript
// Point-in-rotated-rect: transform to local space, then simple AABB check
function pointInRotatedRect(px, py, rx, ry, rw, rh, rotDeg) {
  const rad = -rotDeg * Math.PI / 180;
  const localX = (px - rx) * cos(rad) - (py - ry) * sin(rad);
  const localY = (px - rx) * sin(rad) + (py - ry) * cos(rad);
  return localX >= 0 && localX <= rw && localY >= 0 && localY <= rh;
}
```

### Manual drag system

Dragging is a state machine stored in `dragRef`:

```typescript
type DragState =
  | { type: 'furniture'; id; offX; offY }    // dragging furniture
  | { type: 'node'; id; offX; offY }          // dragging wall node
  | { type: 'resize'; id; anchor; startItem }  // resizing furniture
  | { type: 'rotate'; id; centerX; centerY; startAngle; startRot }
  | null;
```

- **mouseDown** sets the appropriate drag state
- **mouseMove** applies the transform in real-time
- **mouseUp** snaps to grid (for furniture/node drags) and clears drag state

### Resize handles

8 resize handles (corners + midpoints) + 1 rotation handle. Positions are computed using `localToWorld()` to account for item rotation. Resize math uses `worldToLocal()` to convert the cursor back to item-local space, then adjusts width/height/origin based on which anchor is being dragged.

### Image loading

A global `Map<string, HTMLImageElement>` caches loaded SVG images. The `useImage()` hook returns `null` while loading (rendering a placeholder rect) and triggers a `forceRender` when the image is ready.

---

## Grid system

The visual grid uses a dynamic interval system — grid lines get coarser as you zoom out:

```typescript
const INTERVALS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
// Pick the smallest interval where lines are at least N pixels apart
```

**Important:** The snap grid is independent from the visual grid. Snap uses a fixed `snapSize` value chosen by the user (Off / 5cm / 10cm / 25cm / 50cm), while the visual grid adapts to zoom level.

---

## Walls and nodes

Walls are defined as edges between two nodes. Each wall stores:
- `a`, `b` — node IDs
- `exterior` — boolean (affects thickness and color)

Wall thickness:
- Exterior: `WALL_THICKNESS = 20` (20cm)
- Interior: `INTERIOR_WALL_THICKNESS = 16` (16cm)

Wall measurements displayed as labels show the clear span: `(length - WALL_THICKNESS) / METER` in meters.

### Splitting walls

Clicking on an existing wall in WallAdd mode:
1. Projects the click point onto the wall segment (parametric `t` value)
2. Deletes the original wall
3. Creates a new node at the projected point
4. Creates two new walls connecting original endpoints to the new node
5. Preserves the exterior flag on both new segments

---

## Multi-floor

Each floor is an independent `FloorState` (nodes + walls + furniture). Floor navigation resets undo/redo stacks and selection state. At least one floor must always exist.

---

## Save format

Files use `.arcada` extension (JSON content):

```json
{
  "version": "2.0.0",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "lastModified": "2024-01-15T12:45:00.000Z",
  "floors": [
    {
      "nodes": [{ "id": 1, "x": 500, "y": 500 }, ...],
      "walls": [{ "id": 10, "a": 1, "b": 2, "exterior": true }, ...],
      "furniture": [{ "id": 20, "path": "sofa", "x": 600, "y": 400, "w": 200, "h": 80, "rot": 0, "zi": 100 }, ...]
    }
  ],
  "nextId": 25
}
```

---

## Print system

`PrintView.tsx` renders all floors in a hidden `div` (`.print-view`) that becomes visible only during `@media print`. Each floor:

1. Computes bounding box of all nodes and furniture (accounting for rotation)
2. Scales to fit A4 dimensions (794 × 1123 px at 96dpi)
3. Centers content with padding
4. Renders walls, nodes, and furniture using Konva `<Stage>` (non-interactive)

---

## Key dependencies

| Package | Why |
|---|---|
| `konva` + `react-konva` | Canvas rendering with layer support, transforms, image rendering |
| `zustand` | Minimal state management with no boilerplate, supports `get()` for imperative access inside actions |
| `lucide-react` | Clean icon set for toolbar |
| `vite` | Fast HMR, simple config, good production builds |

---

## Adding new furniture

1. Add an SVG file to `public/assets/2d/` (e.g., `my-item.svg`)
2. Add an entry to `src/catalog.json`:

```json
{
  "name": "My Item",
  "imagePath": "my-item",
  "width": 1.2,
  "height": 0.8,
  "zIndex": 100
}
```

- `width` / `height` are in **meters**
- `imagePath` is the filename without `.svg` and without the `assets/2d/` prefix
- `zIndex` controls layering order (higher = on top)

3. Place it under the appropriate category in the catalog JSON.
