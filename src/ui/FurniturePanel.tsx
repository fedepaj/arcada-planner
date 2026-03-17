import { useState } from 'react';
import { useStore } from '../store';
import catalog from '../catalog.json';
import type { CatalogItem } from '../types';

const TOOLBAR_W = 80;
const PANEL_W   = 260;

export function FurniturePanel() {
  const [catIndex, setCatIndex] = useState(0);
  const addFurniture = useStore(s => s.addFurniture);
  const stageX     = useStore(s => s.stageX);
  const stageY     = useStore(s => s.stageY);
  const stageScale = useStore(s => s.stageScale);
  const visibleCats = catalog.categories.map(c => c.name === 'Wall' ? { ...c, name: 'Openings' } : c);
  const current = visibleCats[catIndex];

  function addItem(item: CatalogItem) {
    // Place at center of visible viewport, with small random offset to avoid stacking
    const cx = (-stageX + TOOLBAR_W + (window.innerWidth - TOOLBAR_W - PANEL_W) / 2) / stageScale;
    const cy = (-stageY + window.innerHeight / 2) / stageScale;
    const x = cx + (Math.random() - 0.5) * 60;
    const y = cy + (Math.random() - 0.5) * 60;
    addFurniture(item, x, y);
  }

  return (
    <div className="furniture-panel">
      <div className="cat-list">
        {visibleCats.map((c, i) => (
          <button
            key={c.name}
            className={'cat-list-btn' + (i === catIndex ? ' active' : '')}
            onClick={() => setCatIndex(i)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="items-grid">
        {current.items.map(item => (
          <button key={item.name} className="furniture-item" onClick={() => addItem(item as unknown as CatalogItem)}>
            <img src={`${import.meta.env.BASE_URL}assets/2d/${item.imagePath}.svg`} alt={item.name} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
