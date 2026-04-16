import React, { useState } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SpeakerModel, DirectivityPattern, AcousticMaterial } from '../types';

import { Save, PenTool, Activity, Share2, Code, Download, Layers, Zap } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { BalloonVisualizer } from './BalloonVisualizer';
import { NumericInput } from './NumericInput';
import { SpectralEditor } from './SpectralEditor';

export const SpeakerDesigner: React.FC = () => {
  const { installModel, installMaterial, setCurrentView } = useProjectStore();
  
  const [designerMode, setDesignerMode] = useState<'source' | 'material'>('source');

  // —— Source State ——
  const [model, setModel] = useState<Partial<SpeakerModel>>({
    name: 'New Custom Speaker',
    manufacturer: 'Beam Audio Designer',
    type: 'Point-Source'
  });
  const [hSpread, setHSpread] = useState(90);
  const [vSpread, setVSpread] = useState(60);
  const [tilt, setTilt] = useState(0); 
  const [pan, setPan] = useState(0);   
  const [pwl, setPwl] = useState(100);
  const [frequencyResponse, setFrequencyResponse] = useState<number[]>(Array(24).fill(0));

  // —— Material State ——
  const [material, setMaterial] = useState<Partial<AcousticMaterial>>({
    name: 'New Custom Material',
    category: 'Acoustic Treatment',
    type: 'broadband'
  });
  const [thickness, setThickness] = useState(0.1);
  const [flowResistivity, setFlowResistivity] = useState(10000);
  const [absorption, setAbsorption] = useState<number[]>(Array(24).fill(0.5));
  
  // Auto-generate directivity based on H/V spread
  const generateDirectivity = (h: number, v: number): DirectivityPattern => {
     const horizontal = Array.from({ length: 36 }, (_, i) => i * 10);
     const vertical = Array.from({ length: 19 }, (_, i) => i * 10);
     const attenuation: number[][] = [];

     for (let f = 0; f < 24; f++) {
       const band: number[] = [];
       // Simpler horn model: H/V Gaussian spread
       for (let vIdx = 0; vIdx < 19; vIdx++) {
         const vDeg = vIdx * 10 - 90;
         for (let hIdx = 0; hIdx < 36; hIdx++) {
           const hDeg = hIdx * 10 > 180 ? hIdx * 10 - 360 : hIdx * 10;
           const hDist = Math.max(0, Math.abs(hDeg) - h/2);
           const vDist = Math.max(0, Math.abs(vDeg) - v/2);
           const atten = -(hDist * 0.5 + vDist * 0.8);
           band.push(Math.max(-40, atten));
         }
       }
       attenuation.push(band);
     }
     return { name: model.name || 'Custom', horizontal, vertical, attenuation };
  };

  const handleSave = () => {
    if (designerMode === 'source') {
        const directivity = generateDirectivity(hSpread, vSpread);
        const finalModel: SpeakerModel = {
          id: `custom_source_${Date.now()}`,
          name: model.name || 'Untitled Source',
          manufacturer: model.manufacturer || 'Unknown',
          type: model.type || 'Point-Source',
          directivity,
          specs: `Custom profile generated with ${hSpread}x${vSpread} beamwidth. PWL: ${pwl}dB.`,
          pwl,
          frequencyResponse
        };
        installModel(finalModel);
        alert('Source Model created and installed in your library.');
    } else {
        const finalMaterial: AcousticMaterial = {
          name: material.name || 'Untitled Material',
          category: material.category || 'Custom',
          type: material.type,
          absorption,
          thickness,
          flowResistivity
        };
        installMaterial(finalMaterial);
        alert('Acoustic Material created and installed in your library.');
    }
    setCurrentView('WORKSPACE');
  };

  const handleExport = () => {
    let exportData;
    let extension = '';
    
    if (designerMode === 'source') {
        const directivity = generateDirectivity(hSpread, vSpread);
        exportData = {
          id: `custom_source_${Date.now()}`,
          name: model.name || 'Untitled Source',
          manufacturer: model.manufacturer || 'Unknown',
          type: model.type || 'Point-Source',
          directivity,
          specs: `Custom profile generated with ${hSpread}x${vSpread} beamwidth. PWL: ${pwl}dB.`,
          pwl,
          frequencyResponse
        };
        extension = '.rays_speaker';
    } else {
        exportData = {
          name: material.name || 'Untitled Material',
          category: material.category || 'Custom',
          type: material.type,
          absorption,
          thickness,
          flowResistivity
        };
        extension = '.rays_material';
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportData.name}${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="designer-container" style={{ display: 'flex', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)' }}>
      
      {/* LEFT: Properties & Sculpting */}
      <div style={{ width: '400px', borderRight: '1px solid var(--border-color)', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--accent-primary)' }}>
          <PenTool size={24} />
          <h2 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '0.05em' }}>MICRO DESIGNER</h2>
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px', marginBottom: '30px' }}>
            <button 
                onClick={() => setDesignerMode('source')}
                style={{ flex: 1, padding: '8px', border: 'none', background: designerMode === 'source' ? 'var(--accent-primary)' : 'transparent', color: designerMode === 'source' ? '#000' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <Zap size={16} /> Active Source
            </button>
            <button 
                onClick={() => setDesignerMode('material')}
                style={{ flex: 1, padding: '8px', border: 'none', background: designerMode === 'material' ? 'var(--accent-primary)' : 'transparent', color: designerMode === 'material' ? '#000' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <Layers size={16} /> Passive Material
            </button>
        </div>

        {designerMode === 'source' ? (
          <>
            <section style={{ marginBottom: '30px' }}>
              <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '15px' }}>Identity & Specs</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="control-group">
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Model Name</label>
                  <input 
                    className="input" 
                    value={model.name} 
                    onChange={e => setModel(m => ({ ...m, name: e.target.value }))}
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="control-group" style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Manufacturer</label>
                      <input 
                        className="input" 
                        value={model.manufacturer} 
                        onChange={e => setModel(m => ({ ...m, manufacturer: e.target.value }))}
                        style={{ width: '100%', borderRadius: '8px' }}
                      />
                    </div>
                    <div className="control-group" style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cabinet Type</label>
                      <select 
                        className="input" 
                        value={model.type} 
                        onChange={e => setModel(m => ({ ...m, type: e.target.value as any }))}
                        style={{ width: '100%', borderRadius: '8px' }}
                      >
                        <option value="Point-Source">Point-Source</option>
                        <option value="Line-Array">Line-Array</option>
                        <option value="Ceiling">Ceiling</option>
                      </select>
                    </div>
                </div>
                <div className="control-group">
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Max Sound Power Level (PWL)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="range" min="60" max="150" step="1" value={pwl} onChange={e => setPwl(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold', width: '40px', color: 'var(--accent-primary)' }}>{pwl} dB</span>
                    </div>
                </div>
              </div>
            </section>

            <section style={{ marginBottom: '30px' }}>
              <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '15px' }}>Directivity Sculpting</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 <div className="control-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                       <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Horizontal Beamwidth</label>
                       <div style={{ width: '60px' }}>
                         <NumericInput value={hSpread} onChange={setHSpread} min={5} max={180} step={1} style={{ padding: '2px 4px', fontSize: '10px', textAlign: 'center' }} />
                       </div>
                    </div>
                    <input type="range" min="10" max="180" step="1" value={hSpread} onChange={e => setHSpread(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                 </div>
                 <div className="control-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                       <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Vertical Beamwidth</label>
                       <div style={{ width: '60px' }}>
                         <NumericInput value={vSpread} onChange={setVSpread} min={5} max={180} step={1} style={{ padding: '2px 4px', fontSize: '10px', textAlign: 'center' }} />
                       </div>
                    </div>
                    <input type="range" min="10" max="180" step="1" value={vSpread} onChange={e => setVSpread(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                 </div>
                 <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <div className="control-group" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                           <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Tilt</label>
                           <NumericInput value={tilt} onChange={setTilt} min={-90} max={90} step={1} style={{ padding: '2px 4px', fontSize: '10px', width: '40px', textAlign: 'center' }} />
                        </div>
                    </div>
                    <div className="control-group" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                           <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pan</label>
                           <NumericInput value={pan} onChange={setPan} min={-180} max={180} step={1} style={{ padding: '2px 4px', fontSize: '10px', width: '40px', textAlign: 'center' }} />
                        </div>
                    </div>
                 </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section style={{ marginBottom: '30px' }}>
              <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '15px' }}>Material Properties</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="control-group">
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Material Name</label>
                  <input 
                    className="input" 
                    value={material.name} 
                    onChange={e => setMaterial(m => ({ ...m, name: e.target.value }))}
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="control-group" style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Category</label>
                      <input 
                        className="input" 
                        value={material.category} 
                        onChange={e => setMaterial(m => ({ ...m, category: e.target.value }))}
                        style={{ width: '100%', borderRadius: '8px' }}
                      />
                    </div>
                    <div className="control-group" style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Type</label>
                      <select 
                        className="input" 
                        value={material.type} 
                        onChange={e => setMaterial(m => ({ ...m, type: e.target.value as any }))}
                        style={{ width: '100%', borderRadius: '8px' }}
                      >
                        <option value="broadband">Broadband</option>
                        <option value="bass-trap">Bass Trap</option>
                        <option value="resonator">Resonator</option>
                        <option value="panel">Panel</option>
                      </select>
                    </div>
                </div>
                <div className="control-group">
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Thickness (m)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="range" min="0.01" max="1.0" step="0.01" value={thickness} onChange={e => setThickness(parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold', width: '40px', color: 'var(--accent-primary)' }}>{thickness.toFixed(2)} m</span>
                    </div>
                </div>
                <div className="control-group">
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Flow Resistivity (Rayls/m)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                            type="number" 
                            className="input" 
                            value={flowResistivity} 
                            onChange={e => setFlowResistivity(parseInt(e.target.value) || 0)} 
                            style={{ flex: 1, borderRadius: '8px' }} 
                        />
                    </div>
                </div>
              </div>
            </section>
          </>
        )}

        <div style={{ flex: 1 }}></div>

        <button 
          className="button primary" 
          style={{ width: '100%', height: '45px', borderRadius: '12px', gap: '8px', marginTop: '20px' }}
          onClick={handleSave}
        >
          <Save size={18} /> INITIALIZE & INSTALL
        </button>

        <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '30px', paddingTop: '20px' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              <Share2 size={16} />
              <h4 style={{ fontSize: '11px', textTransform: 'uppercase', margin: 0 }}>Community Hub</h4>
           </div>
           
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button 
                className="button" 
                style={{ fontSize: '11px', gap: '6px' }}
                onClick={handleExport}
              >
                <Download size={14} /> Export .rays
              </button>
              <a 
                href="https://github.com/BeamAudio/Rays/pulls" 
                target="_blank" 
                rel="noreferrer"
                className="button" 
                style={{ fontSize: '11px', gap: '6px', textDecoration: 'none' }}
              >
                <Code size={14} /> Submit PR
              </a>
           </div>
        </div>
      </div>

      {/* RIGHT: 3D Visualization & Spectral Profile */}
      <div style={{ flex: 1, position: 'relative', background: '#000', display: 'flex', flexDirection: 'column' }}>
        
        {/* Top: 3D Visualization (only for source) */}
        {designerMode === 'source' ? (
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, textAlign: 'right', pointerEvents: 'none' }}>
                   <h3 style={{ fontSize: '14px', color: 'var(--text-primary)' }}>3D Balloon Visualization</h3>
                   <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Broadband energy distribution (0 dB center)</p>
                </div>
                <div className="glass-panel" style={{ width: '100%', height: '100%' }}>
                   <Canvas shadows gl={{ antialias: true }}>
                      <color attach="background" args={['#050510']} />
                      <fog attach="fog" args={['#050510', 5, 15]} />
                      <BalloonVisualizer hSpread={hSpread} vSpread={vSpread} tilt={tilt} pan={pan} />
                   </Canvas>
                </div>
            </div>
        ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px', background: 'radial-gradient(circle at center, #111418 0%, #050510 100%)' }}>
                <Layers size={64} style={{ color: 'var(--border-color)', opacity: 0.5 }} />
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <h3 style={{ fontSize: '16px', color: 'var(--text-primary)' }}>Material Designer</h3>
                    <p style={{ fontSize: '12px', opacity: 0.8 }}>3D Visualization not applicable for passive surfaces.</p>
                </div>
            </div>
        )}

        {/* BOTTOM: Spectral Signature interactive builder */}
        <div style={{ 
            height: '280px', 
            background: 'var(--bg-secondary)', 
            borderTop: '1px solid var(--border-color)', 
            padding: '20px',
            flexShrink: 0
        }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={14} color="var(--accent-primary)" /> 
                  {designerMode === 'source' ? 'Spectral Response (dB)' : 'Absorption Profile (0.0 - 1.0)'}
              </h4>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Drag inside the editor to sculpt</span>
           </div>
           
           <div style={{ width: '100%' }}>
              {designerMode === 'source' ? (
                 <SpectralEditor 
                    data={frequencyResponse} 
                    onChange={setFrequencyResponse} 
                    mode="dB" 
                    minDb={-24} 
                    maxDb={24} 
                 />
              ) : (
                 <SpectralEditor 
                    data={absorption} 
                    onChange={setAbsorption} 
                    mode="coefficient" 
                 />
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
