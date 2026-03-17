# Arcada Planner v2

A free, browser-based 2D floor plan editor. Draw walls, furnish rooms from a catalog of 80+ items, manage multiple floors, and print your plans — all from the browser, no install needed.

> **Credit:** This project is heavily inspired by (and shares its name with) the original [Arcada](https://github.com/Arcada-Planner/arcada) floor planner. We rewrote the entire codebase from scratch with a different tech stack and added new features.

![Editor overview](docs/screenshots/editor-overview.png)
<!-- TODO: replace with an actual screenshot -->

---

## How it works

### 1. Draw the walls

Select the **Wall** tool and click on the canvas to place nodes — walls are drawn automatically between them. Click on an existing wall to split it. Right-click a wall to mark it as **exterior** (thicker, darker).

![Wall drawing](docs/screenshots/wall-drawing.gif)
<!-- TODO: replace with a GIF -->

### 2. Furnish the rooms

Browse the catalog on the right panel: Bedroom, Kitchen, Living Room, Bathroom, Office, and more. Click any item to drop it on the canvas — it's auto-selected and ready to move.

![Furniture placement](docs/screenshots/furniture-catalog.gif)
<!-- TODO: replace with a GIF -->

### 3. Adjust everything

Click any furniture to select it. Drag to move, pull the corner handles to resize, or drag the top circle to rotate. The floating panel lets you type exact values in **cm** and **degrees**.

![Resize and rotate](docs/screenshots/resize-rotate.gif)
<!-- TODO: replace with a GIF -->

### 4. Multiple floors

Use the arrows in the toolbar to add and navigate floors. Each floor is independent — its own walls and furniture. Remove a floor with the trash icon.

![Multi-floor](docs/screenshots/multi-floor.png)
<!-- TODO: replace with a screenshot -->

### 5. Save, load, print

- **Save** your project as a `.arcada` file and load it back anytime
- **Ctrl+S** for quick save to browser storage
- **Print** renders all floors on A4 pages with measurements, ready for PDF or paper

![Print view](docs/screenshots/print-view.png)
<!-- TODO: replace with a screenshot -->

---

## Tools

| Tool | What it does |
|---|---|
| **Select** | Click to select, drag to move, pull handles to resize/rotate, drag wall nodes to reshape |
| **Wall** | Click to place wall nodes, click on walls to split them |
| **Erase** | Click any element to delete it |

## Controls

| Input | Action |
|---|---|
| **Right-click drag** | Pan the canvas |
| **Scroll wheel** | Zoom in / out |
| **Right-click on wall** | Toggle exterior / interior |
| **Snap dropdown** | Set snap precision: Off, 5, 10, 25, or 50 cm |

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| **Escape** | Return to Select tool |
| **Ctrl+S** | Quick save |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Redo |
| **Ctrl+C / V / X** | Copy / Paste / Cut furniture |
| **Delete** | Remove selected furniture |

---

## Gallery

<!-- TODO: add your screenshots and GIFs here -->

| | | |
|---|---|---|
| ![](docs/screenshots/editor-overview.png) | ![](docs/screenshots/wall-drawing.gif) | ![](docs/screenshots/furniture-catalog.gif) |
| Editor overview | Drawing walls | Placing furniture |
| ![](docs/screenshots/resize-rotate.gif) | ![](docs/screenshots/multi-floor.png) | ![](docs/screenshots/print-view.png) |
| Resize & rotate | Multiple floors | Print view |

---

## For developers

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the code works under the hood
- [DEPLOY.md](DEPLOY.md) — how to build and deploy to GitHub Pages

---

## License

MIT
