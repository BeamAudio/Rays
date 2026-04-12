import React, { useState, useEffect, useRef } from 'react';
import type { AcousticMaterial } from '../types';

interface MaterialPickerProps {
  onSelect: (material: AcousticMaterial) => void;
  currentMaterial?: string;
}

const getCategoryColor = (category?: string) => {
  switch (category?.toLowerCase()) {
    case 'masonry': return "#888888";
    case 'wood': return "#8b5a2b";
    case 'flooring': return "#602020";
    case 'glass': return "#aaddff";
    case 'acoustic treatment': return "#22cc88";
    case 'fabric': return "#aa4488";
    case 'people': return "#ffcc88";
    default: return "#ffffff";
  }
};

export const MaterialPicker: React.FC<MaterialPickerProps> = ({ onSelect, currentMaterial }) => {
  const [materials, setMaterials] = useState<AcousticMaterial[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/materials.json`)
      .then(res => res.json())
      .then(data => setMaterials(data))
      .catch(err => console.error("Error loading materials:", err));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.category?.toLowerCase().includes(search.toLowerCase())
  );

  const categories = Array.from(new Set(filteredMaterials.map(m => m.category || 'Other'))).sort();

  const MiniSparkline = ({ data }: { data: number[] }) => (
    <div style={{ display: 'flex', gap: '1px', height: '12px', alignItems: 'flex-end', width: '40px' }}>
      {data.filter((_, i) => i % 4 === 0).map((v, i) => (
        <div key={i} style={{ flex: 1, background: 'var(--accent-primary)', height: `${v * 100}%`, minHeight: '1px', opacity: 0.5 }} />
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          color: 'white',
          padding: '8px 12px',
          fontSize: '11px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'border-color 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentMaterial || "Select Material..."}
        </span>
        <span style={{ fontSize: '8px', opacity: 0.5 }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#111418',
          border: '1px solid var(--accent-primary)',
          borderRadius: '4px',
          marginTop: '4px',
          zIndex: 1000,
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '8px', background: '#0a0c0e', borderBottom: '1px solid #222' }}>
            <input 
                autoFocus
                type="text"
                placeholder="Search masonry, wood, fabrics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                background: '#1a1d21',
                border: '1px solid #333',
                borderRadius: '4px',
                color: 'white',
                padding: '6px 10px',
                fontSize: '11px',
                outline: 'none',
                width: '100%'
                }}
            />
          </div>
          
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px' }}>
            {categories.map(cat => (
              <div key={cat}>
                <div style={{ 
                    fontSize: '9px', 
                    color: 'var(--text-secondary)', 
                    textTransform: 'uppercase', 
                    padding: '8px 8px 4px 8px',
                    letterSpacing: '0.05em',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: getCategoryColor(cat) }} />
                  {cat}
                </div>
                {filteredMaterials.filter(m => (m.category || 'Other') === cat).map((m, idx) => (
                  <div 
                    key={idx}
                    onClick={() => {
                      onSelect(m);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderRadius: '4px',
                      margin: '1px 4px'
                    }}
                    className="material-item"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ fontSize: '11px' }}>{m.name}</div>
                        <div style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>α_avg: {(m.absorption.reduce((a,b)=>a+b, 0) / 24).toFixed(2)}</div>
                    </div>
                    <MiniSparkline data={m.absorption} />
                  </div>
                ))}
              </div>
            ))}
            {filteredMaterials.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                No materials matching "{search}"
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        .material-item:hover {
          background: rgba(0, 229, 255, 0.1) !important;
          color: var(--accent-primary);
        }
        .material-item:hover div {
          color: inherit !important;
        }
      `}</style>
    </div>
  );
};
