import React, { useState, useRef, useEffect, useCallback } from 'react';
import { OCTAVE_1_3_FREQS } from '../types';

interface SpectralEditorProps {
  data: number[]; // 24 bands of values (dB or coefficients)
  onChange: (newData: number[]) => void;
  mode?: 'dB' | 'coefficient';
  minDb?: number;
  maxDb?: number;
}

export const SpectralEditor: React.FC<SpectralEditorProps> = ({ 
  data, 
  onChange, 
  mode = 'coefficient',
  minDb = -24,
  maxDb = 24
}) => {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Map value to 0-1 percentage for visual height
  const valueToPercent = (val: number) => {
    if (mode === 'coefficient') {
      return Math.max(0, Math.min(100, val * 100)); // 0-1 to 0-100%
    } else {
      const range = maxDb - minDb;
      const normalized = (val - minDb) / range;
      return Math.max(0, Math.min(100, normalized * 100));
    }
  };

  // Map 0-1 percentage to domain value
  const percentToValue = (percent: number) => {
    if (mode === 'coefficient') {
      return Number(Math.max(0, Math.min(1.0, percent / 100)).toFixed(2));
    } else {
      const range = maxDb - minDb;
      const val = minDb + (percent / 100) * range;
      // Snap to 0.5 dB
      return Number(Math.max(minDb, Math.min(maxDb, Math.round(val * 2) / 2)).toFixed(1));
    }
  };

  const handlePointerDrag = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (draggingIdx === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Find absolute coordinates
    const clientX = 'touches' in e ? (e as any).touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as any).touches[0].clientY : (e as MouseEvent).clientY;
    
    // Determine which band we are hovering over while dragging
    const bandWidth = rect.width / 24;
    const relativeX = clientX - rect.left;
    const hoveredBand = Math.max(0, Math.min(23, Math.floor(relativeX / bandWidth)));

    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    // SVG/DOM y=0 is top, so we invert.
    const newPercent = 100 - y;
    const newValue = percentToValue(newPercent);

    const newData = [...data];
    newData[hoveredBand] = newValue;
    onChange(newData);
    setHoverIdx(hoveredBand);
  }, [draggingIdx, data, onChange, mode, minDb, maxDb]);

  useEffect(() => {
    if (draggingIdx !== null) {
      window.addEventListener('pointermove', handlePointerDrag);
      window.addEventListener('pointerup', () => {
        setDraggingIdx(null);
        setHoverIdx(null);
      }, { once: true });
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerDrag);
    };
  }, [draggingIdx, handlePointerDrag]);

  const zeroPercent = mode === 'dB' ? valueToPercent(0) : 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '220px', display: 'flex', flexDirection: 'column' }}>
      
      {/* Y-Axis scale markers */}
      <div style={{ position: 'absolute', top: 0, bottom: '20px', left: 0, width: '100%', pointerEvents: 'none', zIndex: 0 }}>
        {mode === 'dB' ? (
          <>
            <div style={{ position: 'absolute', top: '0%', width: '100%', borderTop: '1px dashed var(--border-color)', opacity: 0.5 }}><span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>+{maxDb}dB</span></div>
            <div style={{ position: 'absolute', top: `${100 - valueToPercent(0)}%`, width: '100%', borderTop: '1px solid var(--accent-primary)', opacity: 0.8 }}><span style={{ fontSize: '9px', color: 'var(--accent-primary)' }}>0dB</span></div>
            <div style={{ position: 'absolute', top: '100%', width: '100%', borderTop: '1px dashed var(--border-color)', opacity: 0.5 }}><span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{minDb}dB</span></div>
          </>
        ) : (
          <>
            <div style={{ position: 'absolute', top: '0%', width: '100%', borderTop: '1px dashed var(--border-color)', opacity: 0.5 }}><span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>1.0</span></div>
            <div style={{ position: 'absolute', top: '50%', width: '100%', borderTop: '1px dashed var(--border-color)', opacity: 0.5 }}><span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>0.5</span></div>
            <div style={{ position: 'absolute', top: '100%', width: '100%', borderTop: '1px dashed var(--border-color)', opacity: 0.5 }}><span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>0.0</span></div>
          </>
        )}
      </div>

      <div 
        ref={containerRef} 
        style={{ 
          height: '200px', 
          display: 'flex', 
          alignItems: 'flex-end', 
          gap: '2px', 
          position: 'relative', 
          background: 'rgba(0,0,0,0.2)', 
          paddingBottom: '0',
          cursor: 'crosshair',
          zIndex: 1
        }}
        onPointerDown={(e) => {
           const rect = e.currentTarget.getBoundingClientRect();
           const bandWidth = rect.width / 24;
           const bandIdx = Math.max(0, Math.min(23, Math.floor((e.clientX - rect.left) / bandWidth)));
           setDraggingIdx(bandIdx);
           handlePointerDrag(e);
        }}
        onPointerLeave={() => { if(draggingIdx === null) setHoverIdx(null); }}
      >
        {data.map((val, i) => {
          const heightPercent = valueToPercent(val);
          const isHovered = hoverIdx === i;
          
          return (
            <div 
              key={i} 
              style={{ flex: 1, position: 'relative', height: '100%' }}
              onPointerEnter={() => { if(draggingIdx === null) setHoverIdx(i); }}
            >
                {/* Visual Bar */}
                {mode === 'coefficient' ? (
                  <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${heightPercent}%`, background: isHovered ? 'var(--accent-primary)' : 'rgba(0, 229, 255, 0.4)', borderRadius: '2px 2px 0 0', transition: draggingIdx === null ? 'background 0.1s' : 'none' }} />
                ) : (
                  <>
                    {val >= 0 ? (
                       <div style={{ position: 'absolute', bottom: `${zeroPercent}%`, width: '100%', height: `${heightPercent - zeroPercent}%`, background: isHovered ? 'var(--accent-primary)' : 'rgba(0, 229, 255, 0.6)', borderRadius: '2px 2px 0 0' }} />
                    ) : (
                       <div style={{ position: 'absolute', top: `${100 - zeroPercent}%`, width: '100%', height: `${zeroPercent - heightPercent}%`, background: isHovered ? '#ff4081' : 'rgba(255, 64, 129, 0.6)', borderRadius: '0 0 2px 2px' }} />
                    )}
                  </>
                )}

                {/* Handle/Point */}
                <div 
                  style={{ 
                    position: 'absolute', 
                    bottom: `calc(${heightPercent}% - 4px)`, 
                    left: '50%', 
                    transform: 'translateX(-50%)', 
                    width: '8px', 
                    height: '8px', 
                    background: isHovered ? '#fff' : (mode === 'dB' && val < 0 ? '#ff4081' : 'var(--accent-primary)'), 
                    borderRadius: '50%', 
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                    transition: draggingIdx === null ? 'all 0.1s' : 'none',
                    pointerEvents: 'none'
                  }}
                />

                {/* Tooltip */}
                {isHovered && (
                   <div style={{ 
                      position: 'absolute', 
                      bottom: `calc(${heightPercent}% + 10px)`, 
                      left: '50%', 
                      transform: 'translateX(-50%)', 
                      background: '#111', 
                      border: '1px solid var(--accent-primary)',
                      color: '#fff', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontSize: '10px', 
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      zIndex: 10
                   }}>
                     {OCTAVE_1_3_FREQS[i] >= 1000 ? `${OCTAVE_1_3_FREQS[i]/1000}k` : Math.round(OCTAVE_1_3_FREQS[i])}Hz: {val}{mode === 'dB' ? 'dB' : ''}
                   </div>
                )}
            </div>
          );
        })}
      </div>

      {/* X-Axis labels */}
      <div style={{ display: 'flex', gap: '2px', height: '20px', marginTop: '4px' }}>
        {data.map((_, i) => (
          <div key={i} style={{ flex: 1, position: 'relative' }}>
             {i % 4 === 0 && (
               <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: 'var(--text-secondary)' }}>
                 {OCTAVE_1_3_FREQS[i] >= 1000 ? `${OCTAVE_1_3_FREQS[i]/1000}k` : Math.round(OCTAVE_1_3_FREQS[i])}
               </span>
             )}
          </div>
        ))}
      </div>
    </div>
  );
};
