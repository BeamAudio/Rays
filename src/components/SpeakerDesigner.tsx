import React, { useState, useRef, useMemo } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SceneObject, SpeakerModel, AcousticMaterial, SimulationResult } from '../types';
import * as THREE from 'three';
import { Save, PenTool, Activity, Share2, Code, Download, Speaker, Layers, Zap, PlusSquare, Play, Trash2, Maximize } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid } from '@react-three/drei';
import { SpectralEditor } from './SpectralEditor';

const SandboxRenderer: React.FC<{ 
  objects: SceneObject[], 
  selectedId: string | null, 
  onSelect: (id: string | null) => void,
  onUpdate: (id: string, updates: Partial<SceneObject>) => void
}> = ({ objects, selectedId, onSelect, onUpdate }) => {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <Grid infiniteGrid fadeDistance={20} fadeStrength={5} sectionColor="#004040" cellColor="#111" sectionSize={1} cellSize={0.2} />
      
      {objects.map(obj => (
        <SandboxObject 
          key={obj.id} 
          obj={obj} 
          isSelected={selectedId === obj.id} 
          onSelect={() => onSelect(obj.id)} 
          onUpdate={onUpdate} 
        />
      ))}
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.5} />
      <mesh onPointerMissed={() => onSelect(null)}>
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
};

const SandboxObject: React.FC<{ 
  obj: SceneObject, 
  isSelected: boolean, 
  onSelect: () => void,
  onUpdate: (id: string, updates: Partial<SceneObject>) => void
}> = ({ obj, isSelected, onSelect, onUpdate }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const handleTransform = () => {
    if (meshRef.current) {
      const { position, rotation, scale } = meshRef.current;
      onUpdate(obj.id, {
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [scale.x, scale.y, scale.z],
      });
    }
  };

  const isTestHardware = obj.id === 'sandbox_src' || obj.id === 'sandbox_mic';

  return (
    <group>
      {isSelected && (
        <TransformControls object={meshRef.current || undefined} onObjectChange={handleTransform} mode="translate" />
      )}
      <mesh
        ref={meshRef}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        {obj.shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : 
         obj.shape === 'sphere' ? <sphereGeometry args={[0.2, 16, 16]} /> : 
         <planeGeometry args={[1, 1]} />}

        {obj.type === 'source' ? (
          <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={isSelected ? 1 : 0.5} wireframe />
        ) : obj.type === 'receiver' ? (
          <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={isSelected ? 1 : 0.5} wireframe />
        ) : (
          <meshStandardMaterial color={isSelected ? "#FFF" : "#888"} opacity={0.8} transparent />
        )}
      </mesh>
    </group>
  );
};

export const SpeakerDesigner: React.FC = () => {
  const { installModel, installMaterial, setCurrentView } = useProjectStore();
  
  const [designerMode, setDesignerMode] = useState<'source' | 'material'>('material');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);

  // —— Identity State ——
  const [itemName, setItemName] = useState('New Sandbox Asset');
  const [itemCategory, setItemCategory] = useState('Custom');

  // —— Sandbox State ——
  const [sandboxObjects, setSandboxObjects] = useState<SceneObject[]>([
    { id: 'sandbox_src', name: 'Test Source', type: 'source', shape: 'sphere', position: [0, 0, 2], scale: [1,1,1], rotation: [0,0,0], sourceType: 'omni', intensity: 100 },
    { id: 'sandbox_mic', name: 'Measurement Mic', type: 'receiver', shape: 'sphere', position: [0, 0, -2], scale: [1,1,1], rotation: [0,0,0] },
    { id: `box_${Date.now()}`, name: 'Test geometry', type: 'mesh', shape: 'box', position: [0,0,0], scale: [1,1,0.2], rotation: [0,0,0] }
  ]);
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);

  // —— Results State ——
  const [frequencyResponse, setFrequencyResponse] = useState<number[]>(Array(24).fill(-24)); // dB
  const [absorption, setAbsorption] = useState<number[]>(Array(24).fill(0)); // 0-1
  const [etcData, setEtcData] = useState<{time: number, energy: number}[]>([]);

  const handleUpdateSandboxObj = (id: string, updates: Partial<SceneObject>) => {
    setSandboxObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const addSandboxPrimitive = (shape: 'box' | 'plane') => {
    const newObj: SceneObject = {
      id: `sandbox_${Date.now()}`,
      name: `Custom ${shape}`,
      type: 'mesh',
      shape,
      position: [Math.random() - 0.5, 0, Math.random() - 0.5],
      scale: [1, 1, shape === 'box' ? 1 : 1],
      rotation: [0, 0, 0]
    };
    setSandboxObjects([...sandboxObjects, newObj]);
    setSelectedSandboxId(newObj.id);
  };

  const removeSelectedPrimitive = () => {
    if (selectedSandboxId && selectedSandboxId !== 'sandbox_src' && selectedSandboxId !== 'sandbox_mic') {
      setSandboxObjects(prev => prev.filter(o => o.id !== selectedSandboxId));
      setSelectedSandboxId(null);
    }
  };

  const runSandboxSimulation = () => {
    setIsSimulating(true);
    setSimProgress(0);
    
    // Fake the triangles for primitives to feed BVH worker correctly
    const workerObjects = sandboxObjects.map(obj => {
      if (obj.type === 'mesh') {
         // Create a fake geometry just to extract triangles for the worker
         const geom = obj.shape === 'box' ? new THREE.BoxGeometry(1,1,1) : new THREE.PlaneGeometry(1,1);
         geom.scale(obj.scale[0], obj.scale[1], obj.scale[2]);
         geom.rotateX(obj.rotation[0]);
         geom.rotateY(obj.rotation[1]);
         geom.rotateZ(obj.rotation[2]);
         geom.translate(obj.position[0], obj.position[1], obj.position[2]);
         
         const posAttr = geom.attributes.position;
         const indexAttr = geom.index;
         const triangles = [];
         if (indexAttr) {
            for(let i=0; i<indexAttr.count; i+=3) {
               const a = indexAttr.getX(i); const b = indexAttr.getX(i+1); const c = indexAttr.getX(i+2);
               triangles.push(
                  posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a),
                  posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b),
                  posAttr.getX(c), posAttr.getY(c), posAttr.getZ(c)
               );
            }
         }
         return { ...obj, triangles };
      }
      return obj;
    });

    const worker = new Worker(new URL('../engine/simulation_worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'PROGRESS') {
        setSimProgress(e.data.progress);
      } else if (e.data.type === 'DONE') {
        const res: SimulationResult = e.data.results.find((r: any) => r.receiverId === 'sandbox_mic');
        if (res && res.metrics) {
           // Set Frequency Results
           if (designerMode === 'source') {
              setFrequencyResponse(res.metrics.spl.map(v => isFinite(v) ? v : -30));
           } else {
              // Mock absorption extraction: Normalize the received SPL against an ideal 0dB reflection
              const alpha = res.metrics.spl.map(v => isFinite(v) ? Math.max(0, Math.min(1, 1 - Math.pow(10, v/10)/100)) : 1);
              setAbsorption(alpha);
           }
           // Set Time-Domain Data (ETC)
           if (res.metrics.etc) setEtcData(res.metrics.etc);
        }
        setIsSimulating(false);
        worker.terminate();
      } else if (e.data.type === 'ERROR') {
        console.error('Sandbox Simulation Error:', e.data.error);
        setIsSimulating(false);
        worker.terminate();
      }
    };

    worker.postMessage({
       objects: workerObjects,
       sources: workerObjects.filter(o => o.type === 'source'),
       receivers: workerObjects.filter(o => o.type === 'receiver'),
       environmentSettings: { rayCount: 15000, maxBounces: 5, ismOrder: 2 } // High detail, few bounces for a local sandbox
    });
  };

  const handleSave = () => {
    if (designerMode === 'source') {
        const finalModel: SpeakerModel = {
          id: `sandbox_src_${Date.now()}`,
          name: itemName || 'Untitled Sandbox Source',
          manufacturer: itemCategory || 'Custom',
          type: 'Point-Source',
          directivity: { name: 'Omni', horizontal: [], vertical: [], attenuation: [] },
          specs: `Custom source derived from 3D Micro-Sandbox test.`,
          pwl: 100,
          frequencyResponse
        };
        installModel(finalModel);
        alert('Source Model created and installed in your library.');
    } else {
        const finalMaterial: AcousticMaterial = {
          name: itemName || 'Untitled Sandbox Material',
          category: itemCategory || 'Custom',
          type: 'broadband',
          absorption,
        };
        installMaterial(finalMaterial);
        alert('Acoustic Material created from Sandbox and installed.');
    }
    setCurrentView('WORKSPACE');
  };

  const maxEtc = useMemo(() => etcData.length > 0 ? Math.max(...etcData.map(e => e.energy)) : 1, [etcData]);

  return (
    <div className="designer-container" style={{ display: 'flex', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)' }}>
      
      {/* LEFT: Properties & Assets */}
      <div style={{ width: '350px', borderRight: '1px solid var(--border-color)', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--accent-primary)' }}>
          <Maximize size={24} />
          <h2 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '0.05em' }}>MICRO SANDBOX</h2>
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px', marginBottom: '20px' }}>
            <button onClick={() => setDesignerMode('source')} style={{ flex: 1, padding: '8px', border: 'none', background: designerMode === 'source' ? 'var(--accent-primary)' : 'transparent', color: designerMode === 'source' ? '#000' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <Zap size={14} /> Source
            </button>
            <button onClick={() => setDesignerMode('material')} style={{ flex: 1, padding: '8px', border: 'none', background: designerMode === 'material' ? 'var(--accent-primary)' : 'transparent', color: designerMode === 'material' ? '#000' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <Layers size={14} /> Material
            </button>
        </div>

        <section style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Identity Output</h4>
          <div className="control-group" style={{ marginBottom: '10px' }}>
             <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Asset Name</label>
             <input className="input" value={itemName} onChange={e => setItemName(e.target.value)} style={{ width: '100%', borderRadius: '8px' }} />
          </div>
          <div className="control-group">
             <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Category</label>
             <input className="input" value={itemCategory} onChange={e => setItemCategory(e.target.value)} style={{ width: '100%', borderRadius: '8px' }} />
          </div>
        </section>

        <section style={{ marginBottom: '20px', flex: 1 }}>
          <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Sandbox Construction</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
             <button className="button" style={{ fontSize: '11px', gap: '6px' }} onClick={() => addSandboxPrimitive('box')}>
               <PlusSquare size={14} /> Add Block
             </button>
             <button className="button" style={{ fontSize: '11px', gap: '6px' }} onClick={() => addSandboxPrimitive('plane')}>
               <PlusSquare size={14} /> Add Plate
             </button>
          </div>
          
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px', maxHeight: '180px', overflowY: 'auto' }}>
             {sandboxObjects.map(obj => (
                <div key={obj.id} onClick={() => setSelectedSandboxId(obj.id)} style={{ padding: '6px 8px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', background: selectedSandboxId === obj.id ? 'var(--bg-tertiary)' : 'transparent', borderLeft: selectedSandboxId === obj.id ? '2px solid var(--accent-primary)' : '2px solid transparent', cursor: 'pointer', marginBottom: '2px', color: obj.id === 'sandbox_src' ? '#00ffff' : obj.id === 'sandbox_mic' ? '#ff00ff' : '#fff' }}>
                   <span>{obj.name}</span>
                   {obj.id !== 'sandbox_src' && obj.id !== 'sandbox_mic' && selectedSandboxId === obj.id && (
                      <Trash2 size={12} color="#ff4444" onClick={(e) => { e.stopPropagation(); removeSelectedPrimitive(); }} />
                   )}
                </div>
             ))}
          </div>
        </section>

        <button className="button primary" style={{ width: '100%', height: '45px', borderRadius: '12px', gap: '8px' }} onClick={handleSave}>
          <Save size={18} /> INSTALL TO WORKSPACE
        </button>
        <button className="button" style={{ width: '100%', height: '35px', borderRadius: '8px', gap: '8px', marginTop: '10px', fontSize: '11px' }}>
          <Share2 size={14} /> PUBLISH TO MARKETPLACE
        </button>
      </div>

      {/* CENTER: 3D Sandbox View */}
      <div style={{ flex: 1, position: 'relative', background: '#050508', overflow: 'hidden', borderRight: '1px solid var(--border-color)' }}>
         <div style={{ position: 'absolute', top: '15px', left: '20px', zIndex: 10 }}>
            <button 
               className="button primary" 
               onClick={runSandboxSimulation}
               disabled={isSimulating}
               style={{ gap: '8px', borderRadius: '20px', padding: '8px 24px', background: isSimulating ? 'var(--text-secondary)' : 'var(--accent-primary)', color: '#000', fontWeight: 'bold' }}
            >
               {isSimulating ? `SIMULATING (${simProgress}%)` : <><Play size={16} fill="#000" /> RUN ACOUSTIC TEST</>}
            </button>
         </div>

         <div style={{ position: 'absolute', top: '15px', right: '20px', zIndex: 10, textAlign: 'right' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Micro Environment</h3>
            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Free-field Anechoic Space (1x1x1 Grid)</p>
         </div>

         <div className="glass-panel" style={{ width: '100%', height: '100%' }}>
            <Canvas shadows gl={{ antialias: true }} camera={{ position: [2, 2, 3], fov: 45 }}>
               <color attach="background" args={['#050508']} />
               <SandboxRenderer objects={sandboxObjects} selectedId={selectedSandboxId} onSelect={setSelectedSandboxId} onUpdate={handleUpdateSandboxObj} />
            </Canvas>
         </div>
      </div>

      {/* RIGHT: Extracted Analytics */}
      <div style={{ width: '400px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
         <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
               <Activity size={14} color="var(--accent-primary)" /> Time Domain (Impulse Response)
            </h4>
            <div style={{ width: '100%', height: '120px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', position: 'relative', overflow: 'hidden' }}>
               {etcData.length === 0 ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '10px' }}>Run test to generate ETC</div>
               ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', padding: '0 4px', gap: '1px' }}>
                     {etcData.map((pt, i) => (
                        <div key={i} style={{ flex: 1, minWidth: '2px', background: 'var(--accent-primary)', height: `${(pt.energy / maxEtc) * 100}%`, opacity: 0.8 }} />
                     ))}
                  </div>
               )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: 'var(--text-secondary)' }}>
               <span>0ms</span>
               <span>{etcData.length > 0 ? (etcData[etcData.length-1].time * 1000).toFixed(0) + 'ms' : 'T_max'}</span>
            </div>
         </div>

         <div style={{ padding: '20px', flex: 1 }}>
            <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
               <Activity size={14} color="var(--accent-primary)" /> Extracted Frequency Target
            </h4>
            
            <div style={{ width: '100%', pointerEvents: 'none' }}>
               {designerMode === 'source' ? (
                  <SpectralEditor data={frequencyResponse} onChange={() => {}} mode="dB" minDb={-24} maxDb={24} />
               ) : (
                  <SpectralEditor data={absorption} onChange={() => {}} mode="coefficient" />
               )}
            </div>
            <p style={{ fontSize: '9px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px', fontStyle: 'italic' }}>
               Analytic data derived from micro-simulation.
            </p>
         </div>
      </div>

    </div>
  );
};
