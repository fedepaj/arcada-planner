import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { EditorStage } from './ui/EditorStage';
import { Toolbar } from './ui/Toolbar';
import { FurniturePanel } from './ui/FurniturePanel';
import { PrintView } from './ui/PrintView';
import { useStore } from './store';
import { METER } from './constants';
import './App.css';

function SelectionPanel() {
  const selectedId   = useStore(s => s.selectedId);
  const floors       = useStore(s => s.floors);
  const fi           = useStore(s => s.fi);
  const stageX       = useStore(s => s.stageX);
  const stageY       = useStore(s => s.stageY);
  const stageScale   = useStore(s => s.stageScale);
  const updateFurniture = useStore(s => s.updateFurniture);
  const deleteFurniture = useStore(s => s.deleteFurniture);
  const select       = useStore(s => s.select);

  if (!selectedId) return null;
  const item = floors[fi].furniture.find(f => f.id === selectedId);
  if (!item) return null;

  // Screen coordinates: center-bottom of item (accounting for rotation)
  const rad = item.rot * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: item.x, y: item.y },
    { x: item.x + item.w * cos, y: item.y + item.w * sin },
    { x: item.x - item.h * sin, y: item.y + item.h * cos },
    { x: item.x + item.w * cos - item.h * sin, y: item.y + item.w * sin + item.h * cos },
  ];
  const centerX = corners.reduce((s, c) => s + c.x, 0) / 4;
  const maxY = Math.max(...corners.map(c => c.y));
  const sx = stageX + centerX * stageScale;
  const sy = stageY + maxY * stageScale + 12;

  const wCm = Math.round(item.w / METER * 100);
  const hCm = Math.round(item.h / METER * 100);
  const rot  = Math.round(item.rot);

  return (
    <div className="selection-panel" style={{ left: Math.max(8, Math.min(sx - 170, window.innerWidth - 340)), top: Math.min(window.innerHeight - (window.innerWidth < 768 ? 110 : 50), Math.max(8, sy)) }}>
      <label>W <input type="number" value={wCm} min={1}
        onChange={e => updateFurniture(selectedId, { w: +e.target.value / 100 * METER })} /> cm</label>
      <label>H <input type="number" value={hCm} min={1}
        onChange={e => updateFurniture(selectedId, { h: +e.target.value / 100 * METER })} /> cm</label>
      <label>R <input type="number" value={rot}
        onChange={e => updateFurniture(selectedId, { rot: +e.target.value })} /> °</label>
      <button className="sel-delete" title="Delete" onClick={() => { deleteFurniture(selectedId); select(null); }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, []);

  return (
    <div className="app">
      <EditorStage />
      <Toolbar />
      <FurniturePanel />
      <SelectionPanel />
      <PrintView />
    </div>
  );
}
