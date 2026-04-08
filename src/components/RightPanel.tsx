import React from 'react';
import { useProjectStore } from '../state/project_state';
import type { AcousticMaterial } from '../state/project_state';
import { DraggableWindow } from './DraggableWindow';
import { DirectivityLibrary } from '../engine/directivity_library';
import { NumericInput } from './NumericInput';

export const RightPanel: React.FC = () => {
  const { 
    objects, selectedId, updateObject,
    environmentSettings, setEnvironmentSettings,
    selectedBand, setSelectedBand,
    results
  } = useProjectStore();
  
  const selectedObject = objects.find(o => o.id === selectedId);

  if (!selectedObject) {
    return (
      <DraggableWindow 
        title="Global Settings" 
        defaultPosition={{ x: window.innerWidth - 300, y: 60 }} 
        defaultSize={{ width: 280, height: 400 }}
      >
        <div className="sidebar-section properties">
          <h3>Environment (ISO 9613-1)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
            <div className="prop-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <NumericInput 
                label="Temp (°C)"
                value={environmentSettings.temperature} 
                onChange={(v) => setEnvironmentSettings({ temperature: v })}
                step={0.5}
              />
              <NumericInput 
                label="Humidity (%)"
                value={environmentSettings.humidity} 
                onChange={(v) => setEnvironmentSettings({ humidity: v })}
                step={1}
                min={0}
                max={100}
              />
            </div>
            <div className="prop-group">
              <NumericInput 
                label="Pressure (kPa)"
                value={environmentSettings.pressure} 
                onChange={(v) => setEnvironmentSettings({ pressure: v })}
                step={0.1}
              />
            </div>
          </div>
        </div>

        <div className="sidebar-section properties">
          <h3>Simulation Engine</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
            <div className="prop-group">
              <NumericInput 
                label="Number of Rays"
                step={1000}
                value={environmentSettings.rayCount} 
                onChange={(v) => setEnvironmentSettings({ rayCount: Math.round(v) })}
                min={100}
                max={200000}
              />
            </div>
            <div className="prop-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <NumericInput 
                label="Max Bounces"
                value={environmentSettings.maxBounces} 
                onChange={(v) => setEnvironmentSettings({ maxBounces: Math.round(v) })}
                min={1}
                max={100}
              />
              <NumericInput 
                label="ISM Order"
                value={environmentSettings.ismOrder} 
                onChange={(v) => setEnvironmentSettings({ ismOrder: Math.round(v) })}
                min={0}
                max={5}
              />
            </div>
          </div>
        </div>
      </DraggableWindow>
    );
  }

  if (results.length > 0 && selectedObject.type === 'receiver') {
    return (
      <DraggableWindow 
        title="Impact Analysis" 
        defaultPosition={{ x: window.innerWidth - 300, y: 60 }} 
        defaultSize={{ width: 280, height: 180 }}
      >
        <div className="sidebar-section properties">
          <div className="prop-group">
            <label style={labelStyle}>Analysis Band</label>
            <select 
              style={selectStyle}
              value={selectedBand}
              onChange={(e) => setSelectedBand(parseInt(e.target.value))}
            >
              {[50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000].map((f, i) => (
                <option key={f} value={i}>{f >= 1000 ? `${f/1000}k` : f} Hz</option>
              ))}
              <option value={24}>Broadband (1kHz BB)</option>
            </select>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '10px' }}>Receiver properties are view-only while simulation data is active.</p>
        </div>
      </DraggableWindow>
    );
  }

  return (
    <DraggableWindow 
        title="Properties Inspector" 
        defaultPosition={{ x: window.innerWidth - 300, y: 60 }} 
        defaultSize={{ width: 280, height: window.innerHeight * 0.8 }}
    >
      <div className="sidebar-section properties" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>{selectedObject.name}</h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div className="prop-group">
              <label style={labelStyle}>Position (m)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {['x', 'y', 'z'].map((axis, i) => (
                  <NumericInput 
                    key={axis}
                    label={axis.toUpperCase()}
                    value={selectedObject.position[i]} 
                    onChange={(val) => {
                      const newPos = [...selectedObject.position] as [number, number, number];
                      newPos[i] = val;
                      updateObject(selectedObject.id, { position: newPos });
                    }} 
                  />
                ))}
              </div>
          </div>
          
          <div className="prop-group">
              <label style={labelStyle}>Rotation (Euler deg)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {['x', 'y', 'z'].map((axis, i) => (
                  <NumericInput 
                    key={axis}
                    label={axis.toUpperCase()}
                    value={selectedObject.rotation?.[i] * 180 / Math.PI || 0} 
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
            <div className="prop-group">
              <label style={labelStyle}>Scale (m)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {['x', 'y', 'z'].map((axis, i) => (
                  <NumericInput 
                    key={axis}
                    label={axis.toUpperCase()}
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

          {selectedObject.type === 'mesh' && (
            <>
              <div className="prop-group">
                <label style={labelStyle}>Acoustic Material</label>
                <select 
                  style={selectStyle}
                  value={selectedObject.material?.name || 'generic'}
                  onChange={(e) => {
                    const material: AcousticMaterial = {
                      name: e.target.value,
                      absorption: Array(24).fill(0.1),
                      scattering: 0.1,
                      transmission: 0.8,
                      density: 2.5
                    };
                    updateObject(selectedObject.id, { material });
                  }}
                >
                  <option value="generic">Generic Wall</option>
                  <option value="concrete">Concrete</option>
                  <option value="wood">Wood Panel</option>
                  <option value="carpet">Carpet</option>
                  <option value="glass">Glass</option>
                </select>
              </div>

              <div className="prop-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <NumericInput 
                  label="Transmission"
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
                  label="Density (dB/m)"
                  value={selectedObject.material?.density || 0} 
                  onChange={(v) => {
                    const mat = { ...selectedObject.material! };
                    mat.density = v;
                    updateObject(selectedObject.id, { material: mat });
                  }}
                />
              </div>
              
              <div className="prop-group">
                <label style={labelStyle}>1/3rd Octave Absorption (0-1)</label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(4, 1fr)', 
                  gap: '5px', 
                  maxHeight: '150px', 
                  overflowY: 'auto', 
                  paddingRight: '5px',
                  background: 'rgba(0,0,0,0.2)',
                  padding: '5px',
                  borderRadius: '4px'
                }}>
                  {[50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000].map((freq, idx) => (
                    <div key={freq}>
                      <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>{freq >= 1000 ? `${freq/1000}k` : freq}</span>
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
                        step={0.05}
                        style={{ padding: '2px 4px', height: '20px', fontSize: '9px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {selectedObject.type === 'source' && (
            <>
              <div className="prop-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Source Type</label>
                  <select 
                    style={selectStyle}
                    value={selectedObject.sourceType || 'point'}
                    onChange={(e) => updateObject(selectedObject.id, { sourceType: e.target.value as any })}
                  >
                    <option value="point">Point Source</option>
                    <option value="line">Line Element</option>
                    <option value="volumetric">Volumetric</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Directivity Pattern</label>
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
                </div>
              </div>
              <div className="prop-group">
                <NumericInput 
                  label="Intensity (dB SPL @ 1m)"
                  value={selectedObject.intensity || 100} 
                  onChange={(v) => updateObject(selectedObject.id, { intensity: v })}
                />
              </div>
            </>
          )}

          {selectedObject.type === 'plane' && (
            <div className="prop-group">
              <NumericInput 
                label="Resolution (points per meter)"
                value={selectedObject.resolution || 2} 
                onChange={(v) => updateObject(selectedObject.id, { resolution: v })}
                min={0.1}
                max={20}
              />
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-secondary)',
  marginBottom: '5px',
  display: 'block',
  textTransform: 'uppercase'
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  color: 'white',
  padding: '6px',
  width: '100%',
  fontSize: '11px',
  borderRadius: '2px',
  outline: 'none',
  cursor: 'pointer'
};
