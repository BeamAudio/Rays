import React, { useState, useRef } from 'react';
import { OCTAVE_1_3_FREQS } from '../types';

interface SpectralEditorProps {
  data: number[]; // 24 bands of attenuation
  onChange: (newData: number[]) => void;
}

export const SpectralEditor: React.FC<SpectralEditorProps> = ({ data, onChange }) => {
  const [dragging, setDragging] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const newData = [...data];
    newData[dragging] = 1 - (y / 100);
    onChange(newData);
  };

  return (
    <div ref={containerRef} style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '2px', position: 'relative', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', padding: '10px' }}
         onPointerMove={handlePointerMove}
         onPointerUp={() => setDragging(null)}
         onPointerLeave={() => setDragging(null)}>
      {data.map((val, i) => (
        <div key={i} style={{ flex: 1, position: 'relative', height: '100%' }}>
            <div 
              style={{ position: 'absolute', bottom: `${val * 100}%`, left: 0, right: 0, height: '8px', background: 'var(--text-primary)', borderRadius: '2px', cursor: 'ns-resize' }}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(i); }}
            />
            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${val * 100}%`, background: 'rgba(255,255,255,0.2)' }} />
            {i % 6 === 0 && <span style={{ position: 'absolute', bottom: '-20px', left: 0, fontSize: '8px', color: 'var(--text-secondary)' }}>{OCTAVE_1_3_FREQS[i]/1000}k</span>}
        </div>
      ))}
    </div>
  );
};
