import React from 'react';
import { useProjectStore } from '../state/project_state';

import { DraggableWindow } from './DraggableWindow';
import { DirectivityLibrary } from '../engine/directivity_library';
import { NumericInput } from './NumericInput';
import { MaterialPicker } from './MaterialPicker';
import { OCTAVE_1_3_FREQS } from '../types';

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--text-secondary)',
  marginBottom: '4px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: '600'
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid var(--border-color)',
  color: '#E2E8F0',
  padding: '6px 10px',
  width: '100%',
  fontSize: '11px',
  borderRadius: '4px',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 'bold',
  color: 'var(--accent-primary)',
  marginBottom: '12px',
  marginTop: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: '8px',
  padding: '12px',
  border: '1px solid rgba(255,255,255,0.05)',
  marginBottom: '12px'
};

export const RightPanel: React.FC = () => {
  const {
    objects, selectedId, updateObject,
    selectedBand, setSelectedBand,
    results
  } = useProjectStore();

  const selectedObject = objects.find(o => o.id === selectedId);

  if (!selectedObject) {
    return null;
  }

  if (results.length > 0 && selectedObject.type === 'receiver') {
    return (
      <DraggableWindow 
        title="Impact Analysis" 
        defaultPosition={{ x: window.innerWidth - 300, y: 80 }} 
        defaultSize={{ width: 280, height: 180 }}
      >
        <div className="sidebar-section properties" style={{ padding: '16px' }}>
          <div className="prop-group">
            <label style={labelStyle}>Selected Frequency Band</label>
            <div style={{ position: 'relative' }}>
              <select 
                style={selectStyle}
                value={selectedBand}
                onChange={(e) => setSelectedBand(parseInt(e.target.value))}
              >
                {OCTAVE_1_3_FREQS.map((f, i) => (
                  <option key={f} value={i}>{f >= 1000 ? `${f/1000}k` : f} Hz (1/3 Oct)</option>
                ))}
                <option value={24}>Broadband (A-Weighted)</option>
              </select>
              <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }}>▼</div>
            </div>
          </div>
          <div style={{ marginTop: '20px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <p style={{ fontSize: '10px', color: 'var(--accent-primary)', margin: 0, lineHeight: '1.4' }}>
              Analysis mode active. Geometric properties are locked for the current simulation set.
            </p>
          </div>
        </div>
      </DraggableWindow>
    );
  }

  return (
    <DraggableWindow 
        title="Inspector" 
        defaultPosition={{ x: window.innerWidth - 300, y: 80 }} 
        defaultSize={{ width: 280, height: window.innerHeight * 0.8 }}
    >
      <div className="sidebar-section properties" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          <h2 style={{ fontSize: '16px', margin: 0, color: '#F8FAFC' }}>{selectedObject.name}</h2>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{selectedObject.type} {selectedObject.shape}</span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          
          <div style={sectionHeaderStyle}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor' }} />
            Geometry
          </div>

          <div style={cardStyle}>
            <label style={labelStyle}>Position (meters)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {['X', 'Y', 'Z'].map((axis, i) => (
                <NumericInput 
                  key={axis}
                  label={axis}
                  value={selectedObject.position[i]} 
                  onChange={(val) => {
                    const newPos = [...selectedObject.position] as [number, number, number];
                    newPos[i] = val;
                    updateObject(selectedObject.id, { position: newPos });
                  }} 
                />
              ))}
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={labelStyle}>Rotation (degrees)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {['X', 'Y', 'Z'].map((axis, i) => (
                  <NumericInput 
                    key={axis}
                    label={axis}
                    value={Math.round((selectedObject.rotation?.[i] || 0) * 180 / Math.PI)} 
                    onChange={(val) => {
                      const newRot = [...(selectedObject.rotation || [0,0,0])] as [number, number, number];
                      newRot[i] = val * Math.PI / 180;
                      updateObject(selectedObject.id, { rotation: newRot });
                    }} 
                    step={1}
                  />
                ))}
              </div>
            </div>

            {selectedObject.type !== 'source' && selectedObject.type !== 'receiver' && (
              <div style={{ marginTop: '12px' }}>
                <label style={labelStyle}>Scale</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {['X', 'Y', 'Z'].map((axis, i) => (
                    <NumericInput 
                      key={axis}
                      label={axis}
                      value={selectedObject.scale[i]} 
                      onChange={(val) => {
                        const newScale = [...selectedObject.scale] as [number, number, number];
                        newScale[i] = val;
                        updateObject(selectedObject.id, { scale: newScale });
                      }} 
                      min={0.01}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {selectedObject.type === 'mesh' && (
            <>
              <div style={sectionHeaderStyle}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor' }} />
                Acoustic Surface
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>Standard Material</label>
                <MaterialPicker 
                  currentMaterial={selectedObject.material?.name}
                  onSelect={(material) => {
                    updateObject(selectedObject.id, { 
                      material: {
                        ...material,
                        transmission: selectedObject.material?.transmission || 0,
                        density: selectedObject.material?.density || 0
                      } 
                    });
                  }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                  <NumericInput 
                    label="Transmission (0-1)"
                    value={selectedObject.material?.transmission || 0} 
                    onChange={(v) => {
                      const mat = { ...selectedObject.material! };
                      mat.transmission = v;
                      updateObject(selectedObject.id, { material: mat });
                    }}
                    min={0}
                    max={1}
                  />
                  <NumericInput 
                    label="Volume Density (dB/m)"
                    value={selectedObject.material?.density || 0} 
                    onChange={(v) => {
                      const mat = { ...selectedObject.material! };
                      mat.density = v;
                      updateObject(selectedObject.id, { material: mat });
                    }}
                  />
                </div>
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>Absorption Spectrum (1/3rd Octave)</label>
                {/* Visual sparkline/bar chart for absorption */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-end', 
                  gap: '1px', 
                  height: '60px', 
                  background: 'rgba(0,0,0,0.2)', 
                  padding: '4px', 
                  borderRadius: '4px',
                  marginBottom: '10px'
                }}>
                  {OCTAVE_1_3_FREQS.map((_, idx) => {
                    const alpha = selectedObject.material?.absorption?.[idx] ?? 0.1;
                    return (
                      <div 
                        key={idx}
                        style={{ 
                          flex: 1, 
                          height: `${alpha * 100}%`, 
                          background: 'var(--accent-primary)',
                          opacity: 0.4 + (alpha * 0.6),
                          borderRadius: '1px 1px 0 0'
                        }}
                      />
                    );
                  })}
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(4, 1fr)', 
                  gap: '4px', 
                  maxHeight: '140px', 
                  overflowY: 'auto', 
                  paddingRight: '4px'
                }}>
                  {OCTAVE_1_3_FREQS.map((freq, idx) => (
                    <div key={freq} style={{ background: 'rgba(0,0,0,0.1)', padding: '2px', borderRadius: '3px' }}>
                      <div style={{ fontSize: '7px', color: 'var(--text-secondary)', textAlign: 'center' }}>{freq >= 1000 ? `${freq/1000}k` : freq}</div>
                      <NumericInput
                        value={selectedObject.material?.absorption?.[idx] ?? 0.1}
                        onChange={(val) => {
                          const mat = { ...selectedObject.material! };
                          mat.absorption = [...(mat.absorption || Array(24).fill(0.1))];
                          mat.absorption[idx] = val;
                          updateObject(selectedObject.id, { material: mat });
                        }}
                        min={0}
                        max={1}
                        step={0.01}
                        style={{ padding: '0px 2px', height: '18px', fontSize: '9px', border: 'none', background: 'transparent' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {selectedObject.type === 'source' && (
            <>
              <div style={sectionHeaderStyle}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor' }} />
                Electro-Acoustics
              </div>
              <div style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Source Type</label>
                    <div style={{ position: 'relative' }}>
                      <select 
                        style={selectStyle}
                        value={selectedObject.sourceType || 'point'}
                        onChange={(e) => updateObject(selectedObject.id, { sourceType: e.target.value as any })}
                      >
                        <option value="point">Point Source</option>
                        <option value="line">Line Element</option>
                        <option value="volumetric">Volumetric</option>
                      </select>
                      <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5, fontSize: '10px' }}>▼</div>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Directivity</label>
                    <div style={{ position: 'relative' }}>
                      <select 
                        style={selectStyle}
                        value={selectedObject.directivityData?.name === '90x60 Horn' ? 'horn_90x60' : (selectedObject.directivityData?.name === '60x60 Ceiling Speaker' ? 'ceiling_60' : (selectedObject.directivity || 'omni'))}
                        onChange={(e) => {
                          const patternKey = e.target.value;
                          const directivity = (patternKey === 'omni' || patternKey === 'cardioid') ? patternKey : 'custom';
                          const directivityData = DirectivityLibrary[patternKey];
                          updateObject(selectedObject.id, { directivity, directivityData });
                        }}
                      >
                        <option value="omni">Omnidirectional</option>
                        <option value="cardioid">Cardioid (Analytic)</option>
                        <option value="horn_90x60">90x60 Horn</option>
                        <option value="ceiling_60">60x60 Ceiling</option>
                      </select>
                      <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5, fontSize: '10px' }}>▼</div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <NumericInput 
                    label="Emission Level (dB SPL @ 1m)"
                    value={selectedObject.intensity || 100} 
                    onChange={(v) => updateObject(selectedObject.id, { intensity: v })}
                  />
                </div>
              </div>
            </>
          )}

          {selectedObject.type === 'plane' && (
            <div style={cardStyle}>
               <label style={labelStyle}>Mesh Grid Settings</label>
               <NumericInput 
                label="Resolution (points/m)"
                value={selectedObject.resolution || 2} 
                onChange={(v) => updateObject(selectedObject.id, { resolution: v })}
                min={0.1}
                max={20}
              />
              <p style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Higher resolution increases computation time exponentially.
              </p>
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};
