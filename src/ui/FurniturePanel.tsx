import { useState, useCallback } from 'react';
import { Sofa, X } from 'lucide-react';
import { useStore } from '../store';
import catalog from '../catalog.json';
import type { CatalogItem } from '../types';

const TOOLBAR_W = 80;
const PANEL_W   = 260;

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useState(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  });
  return mobile;
}

export function FurniturePanel() {
  const [catIndex, setCatIndex] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const addFurniture = useStore(s => s.addFurniture);
  const stageX     = useStore(s => s.stageX);
  const stageY     = useStore(s => s.stageY);
  const stageScale = useStore(s => s.stageScale);
  const visibleCats = catalog.categories.map(c => c.name === 'Wall' ? { ...c, name: 'Openings' } : c);
  const current = visibleCats[catIndex];

  const addItem = useCallback((item: CatalogItem) => {
    const tbW = isMobile ? 0 : TOOLBAR_W;
    const pW  = isMobile ? 0 : PANEL_W;
    const cx = (-stageX + tbW + (window.innerWidth - tbW - pW) / 2) / stageScale;
    const barH = isMobile ? 56 : 0;
    const cy = (-stageY + (window.innerHeight - barH) / 2) / stageScale;
    const x = cx + (Math.random() - 0.5) * 60;
    const y = cy + (Math.random() - 0.5) * 60;
    addFurniture(item, x, y);
    if (isMobile) setMobileOpen(false);
  }, [isMobile, stageX, stageY, stageScale, addFurniture]);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className={'mobile-panel-toggle' + (mobileOpen ? ' active' : '')}
        onClick={() => setMobileOpen(o => !o)}
      >
        {mobileOpen ? <X size={20} /> : <Sofa size={20} />}
      </button>

      {/* Backdrop on mobile when open */}
      {isMobile && mobileOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <div className={'furniture-panel' + (isMobile && !mobileOpen ? ' mobile-closed' : '')}>
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
    </>
  );
}
