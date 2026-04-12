import React, { useState, useEffect, useRef } from 'react';
import type { AcousticMaterial } from '../types';

interface MaterialPickerProps {
  onSelect: (material: AcousticMaterial) => void;
  currentMaterial?: string;
}

export const MaterialPicker: React.FC<MaterialPickerProps> = ({ onSelect, currentMaterial }) => {
  const [materials, setMaterials] = useState<AcousticMaterial[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/data/materials.json')
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
          alignItems: 'center'
        }}
      >
        <span>{currentMaterial || "Select Material..."}</span>
        <span>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#1a1a1a',
          border: '1px solid var(--accent-primary)',
          borderRadius: '4px',
          marginTop: '4px',
          zIndex: 1000,
          maxHeight: '300px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
          <input 
            autoFocus
            type="text"
            placeholder="Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-color)',
              color: 'white',
              padding: '10px',
              fontSize: '11px',
              outline: 'none'
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredMaterials.map((m, idx) => (
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
                  borderBottom: '1px solid #2a2a2a',
                  display: 'flex',
                  flexDirection: 'column'
                }}
                className="material-item"
              >
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{m.name}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{m.category}</div>
              </div>
            ))}
            {filteredMaterials.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                No materials found
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        .material-item:hover {
          background: var(--accent-primary);
        }
      `}</style>
    </div>
  );
};
