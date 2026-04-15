import React, { useState } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SpeakerModel, DirectivityPattern } from '../types';

import { Save, PenTool, Activity, Share2, Code, Download } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { BalloonVisualizer } from './BalloonVisualizer';
import { NumericInput } from './NumericInput';

export const SpeakerDesigner: React.FC = () => {
  const { installModel, setCurrentView } = useProjectStore();
  
  const [model, setModel] = useState<Partial<SpeakerModel>>({
    name: 'New Custom Speaker',
    manufacturer: 'Beam Audio Designer',
    type: 'Point-Source'
  });

  const [hSpread, setHSpread] = useState(90);
  const [vSpread, setVSpread] = useState(60);
  const [tilt, setTilt] = useState(0); // Elevation
  const [pan, setPan] = useState(0);   // Azimuth
  
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
    const directivity = generateDirectivity(hSpread, vSpread);
    const finalModel: SpeakerModel = {
      id: `custom_${Date.now()}`,
      name: model.name || 'Untitled',
      manufacturer: model.manufacturer || 'Unknown',
      type: model.type || 'Point-Source',
      directivity,
      specs: `Custom profile generated with ${hSpread}x${vSpread} beamwidth.`
    };
    installModel(finalModel);
    alert('Model created and installed in your library.');
    setCurrentView('WORKSPACE');
  };

  const handleExport = () => {
    const directivity = generateDirectivity(hSpread, vSpread);
    const exportData = {
      id: `custom_${Date.now()}`,
      name: model.name || 'Untitled',
      manufacturer: model.manufacturer || 'Unknown',
      type: model.type || 'Point-Source',
      directivity,
      specs: `Custom profile generated with ${hSpread}x${vSpread} beamwidth.`
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportData.name}.rays_speaker`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="designer-container" style={{ display: 'flex', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)' }}>
      
      {/* LEFT: Properties & Sculpting */}
      <div style={{ width: '400px', borderRight: '1px solid var(--border-color)', padding: '20px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '30px', color: 'var(--accent-primary)' }}>
          <PenTool size={24} />
          <h2 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '0.05em' }}>BEAM AUDIO RAYS</h2>
        </div>

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
            <div className="control-group">
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Manufacturer</label>
              <input 
                className="input" 
                value={model.manufacturer} 
                onChange={e => setModel(m => ({ ...m, manufacturer: e.target.value }))}
                style={{ width: '100%', borderRadius: '8px' }}
              />
            </div>
            <div className="control-group">
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
        </section>

        <section style={{ marginBottom: '30px' }}>
          <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '15px' }}>Directivity Sculpting</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
             <div className="control-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                   <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Horizontal Beamwidth</label>
                   <div style={{ width: '60px' }}>
                     <NumericInput 
                        value={hSpread} 
                        onChange={setHSpread} 
                        min={5} 
                        max={180} 
                        step={1}
                        style={{ padding: '2px 4px', fontSize: '10px', textAlign: 'center' }}
                     />
                   </div>
                </div>
                <input type="range" min="10" max="180" step="10" value={hSpread} onChange={e => setHSpread(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
             </div>
             <div className="control-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                   <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Vertical Beamwidth</label>
                   <div style={{ width: '60px' }}>
                     <NumericInput 
                        value={vSpread} 
                        onChange={setVSpread} 
                        min={5} 
                        max={180} 
                        step={1}
                        style={{ padding: '2px 4px', fontSize: '10px', textAlign: 'center' }}
                     />
                   </div>
                </div>
                <input type="range" min="10" max="180" step="10" value={vSpread} onChange={e => setVSpread(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
             </div>
             <div className="control-group" style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                   <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Tilt (Elevation)</label>
                   <div style={{ width: '60px' }}>
                     <NumericInput 
                        value={tilt} 
                        onChange={setTilt} 
                        min={-90} 
                        max={90} 
                        step={1}
                        style={{ padding: '2px 4px', fontSize: '10px', textAlign: 'center' }}
                     />
                   </div>
                </div>
                <input type="range" min="-90" max="90" step="5" value={tilt} onChange={e => setTilt(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
             </div>
             <div className="control-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                   <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pan (Azimuth)</label>
                   <div style={{ width: '60px' }}>
                     <NumericInput 
                        value={pan} 
                        onChange={setPan} 
                        min={-180} 
                        max={180} 
                        step={1}
                        style={{ padding: '2px 4px', fontSize: '10px', textAlign: 'center' }}
                     />
                   </div>
                </div>
                <input type="range" min="-180" max="180" step="5" value={pan} onChange={e => setPan(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
             </div>
          </div>
        </section>

        <button 
          className="button primary" 
          style={{ width: '100%', height: '45px', borderRadius: '12px', gap: '8px', marginTop: '20px' }}
          onClick={handleSave}
        >
          <Save size={18} /> INITIALIZE & INSTALL MODEL
        </button>

        <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '30px', paddingTop: '20px' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              <Share2 size={16} />
              <h4 style={{ fontSize: '11px', textTransform: 'uppercase', margin: 0 }}>Community & Manufacturer Hub</h4>
           </div>
           
           <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '15px' }}>
             Want to see your speaker in the official marketplace? Export your design and submit it to our public repository.
           </p>

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

      {/* RIGHT: 3D Visualization */}
      <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, textAlign: 'right' }}>
           <h3 style={{ fontSize: '14px', color: 'var(--text-primary)' }}>3D Balloon Visualization</h3>
           <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Broadband energy distribution (0 dB center)</p>
        </div>

        <div className="glass-panel" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
           <Canvas shadows gl={{ antialias: true }}>
              <color attach="background" args={['#050510']} />
              <fog attach="fog" args={['#050510', 5, 15]} />
              <BalloonVisualizer hSpread={hSpread} vSpread={vSpread} tilt={tilt} pan={pan} />
           </Canvas>
           
           <div style={{ position: 'absolute', bottom: '20px', left: '20px', pointerEvents: 'none' }}>
              <div style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 'bold', textTransform: 'uppercase' }}>Live Geometry</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Adaptive Directivity Mesh</div>
           </div>
        </div>

        {/* BOTTOM: Spectral signature readout */}
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px', height: '140px', background: 'rgba(0,0,0,0.5)', borderRadius: '12px', padding: '15px', backdropFilter: 'blur(10px)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>On-Axis SPL</h4>
                <Activity size={12} color="var(--accent-primary)" />
            </div>
            <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end', gap: '2px', position: 'relative', borderBottom: '1px solid var(--border-color)', borderLeft: '1px solid var(--border-color)' }}>
              {/* Y-Axis labels */}
              <div style={{ position: 'absolute', top: 0, left: '-25px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-secondary)' }}>
                <span>110</span><span>95</span><span>80</span><span>65</span>
              </div>
              {/* Bars */}
              {OCTAVE_1_3_FREQS.map((f, i) => {
                const spl = 100 + 10 * Math.log10(f / 1000) - (f > 8000 ? 10 : 0);
                return <div key={i} style={{ flex: 1, background: 'var(--accent-primary)', height: `${((spl - 60) / 50) * 100}%`, opacity: 0.8, borderRadius: '1px' }} />;
              })}
              {/* X-Axis labels */}
              <div style={{ position: 'absolute', bottom: '-15px', width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-secondary)' }}>
                {OCTAVE_1_3_FREQS.filter((_, i) => i % 6 === 0).map(f => <span key={f}>{f/1000}k</span>)}
              </div>
            </div>
        </div>      </div>
    </div>
  );
};
