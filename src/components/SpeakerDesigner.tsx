import React, { useState, useRef, useMemo } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SceneObject, SpeakerModel, AcousticMaterial, SimulationResult } from '../types';
import * as THREE from 'three';
import { Save, PenTool, Activity, Share2, Code, Download, Speaker, Layers, Zap, PlusSquare, Play, Trash2, Maximize } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid } from '@react-three/drei';
import { SpectralEditor } from './SpectralEditor';

const SandboxRenderer: React.FC<{ 
  objects: SceneObject[], 
  selectedId: string | null, 
  onSelect: (id: string | null) => void,
  onUpdate: (id: string, updates: Partial<SceneObject>) => void,
  testMode: 'RAYTRACE' | 'FDTD',
  fdtdPlaneY: number,
  isFdtdRunning: boolean,
  pressureMapRef: React.MutableRefObject<Float32Array | null>
}> = ({ objects, selectedId, onSelect, onUpdate, testMode, fdtdPlaneY, isFdtdRunning, pressureMapRef }) => {
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
      {testMode === 'FDTD' && (
         <FdtdAnalysisPlane y={fdtdPlaneY} isRunning={isFdtdRunning} pressureMapRef={pressureMapRef} />
      )}
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
         obj.shape === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 32]} /> :
         obj.shape === 'tube' ? <cylinderGeometry args={[0.5, 0.5, 1, 32, 1, true]} /> :
         obj.shape === 'trapezoid' ? <cylinderGeometry args={[0.3, 0.8, 1, 4]} /> :
         <planeGeometry args={[1, 1]} />}

        {obj.type === 'source' ? (
          <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={isSelected ? 1 : 0.5} wireframe />
        ) : obj.type === 'receiver' ? (
          <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={isSelected ? 1 : 0.5} wireframe />
        ) : (
          <meshStandardMaterial color={isSelected ? "#FFF" : "#888"} opacity={0.8} transparent side={THREE.DoubleSide} />
        )}
      </mesh>
    </group>
  );
};

const FdtdAnalysisPlane: React.FC<{ y: number, isRunning: boolean, pressureMapRef: React.MutableRefObject<Float32Array | null> }> = ({ y, isRunning, pressureMapRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<THREE.CanvasTexture>(null);
  
  // Creates the canvas element dynamically if it doesn't exist
  const memCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 200;
    return c;
  }, []);

  useFrame(() => {
    if (!isRunning || !pressureMapRef.current || !textureRef.current) return;
    const ctx = memCanvas.getContext('2d');
    if (!ctx) return;
    
    const imgData = ctx.createImageData(200, 200);
    const buf = pressureMapRef.current;
    
    // Convert 1D pressure map to RGBA
    for (let i = 0; i < 40000; i++) {
       const p = buf[i];
       const val = Math.min(255, Math.max(0, Math.floor(Math.abs(p) * 2000)));
       const r = p > 0 ? val : 0;
       const b = p < 0 ? val : 0;
       
       imgData.data[i*4] = r;      // R
       imgData.data[i*4+1] = 0;    // G
       imgData.data[i*4+2] = b;    // B
       imgData.data[i*4+3] = val > 5 ? 220 : 0; // A
    }
    ctx.putImageData(imgData, 0, 0);
    textureRef.current.needsUpdate = true;
  });

  return (
    <group position={[0, y, 0]} rotation={[-Math.PI/2, 0, 0]}>
      <mesh position={[0, 0, 0.01]}> 
        <planeGeometry args={[4, 4]} />
        <meshBasicMaterial transparent side={THREE.DoubleSide} depthWrite={false}>
          <canvasTexture ref={textureRef} attach="map" args={[memCanvas]} magFilter={THREE.NearestFilter} />
        </meshBasicMaterial>
      </mesh>
      <mesh>
        <planeGeometry args={[4, 4]} />
        <meshBasicMaterial color="#ffff00" wireframe opacity={isRunning ? 0.0 : 0.2} transparent depthWrite={false} />
      </mesh>
    </group>
  );
};

const BodePlot: React.FC<{ freqs: number[], mags: number[], phases: number[] }> = ({ freqs, mags, phases }) => {
  if (freqs.length === 0) return <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', color:'var(--text-secondary)'}}>No Impedance Data</div>;

  const width = 360;
  const height = 150;
  const padding = 20;

  const minF = 50;
  const maxF = Math.max(...freqs, 2500);
  const logRange = Math.log10(maxF) - Math.log10(minF);
  const getX = (f: number) => padding + ((Math.log10(f) - Math.log10(minF)) / logRange) * (width - 2 * padding);

  const maxM = Math.max(...mags);
  const minM = Math.min(...mags);
  const logMaxM = Math.log10(maxM);
  const logMinM = Math.log10(Math.max(0.1, minM));
  const rngM = Math.max(0.1, logMaxM - logMinM);
  const getYMag = (m: number) => padding + (1 - (Math.log10(Math.max(0.1, m)) - logMinM) / rngM) * ((height - 2*padding)/2);

  const pHeight = (height - 2*padding) / 2;
  const getYPhase = (p: number) => padding + pHeight + (1 - (p + 180) / 360) * pHeight;

  let magPath = `M ${getX(freqs[0])},${getYMag(mags[0])}`;
  let phasePath = `M ${getX(freqs[0])},${getYPhase(phases[0])}`;
  for (let i = 1; i < freqs.length; i++) {
     magPath += ` L ${getX(freqs[i])},${getYMag(mags[i])}`;
     phasePath += ` L ${getX(freqs[i])},${getYPhase(phases[i])}`;
  }

  return (
     <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{background: 'rgba(0,0,0,0.4)', borderRadius: '8px'}}>
        <text x={padding} y={15} fill="#00ffff" fontSize="9">Magnitude (|Z|)</text>
        <path d={magPath} fill="none" stroke="#00ffff" strokeWidth="1.5" />
        
        <line x1={padding} y1={padding+pHeight} x2={width-padding} y2={padding+pHeight} stroke="#333" strokeDasharray="4" />
        
        <text x={padding} y={padding+pHeight+12} fill="#ff00ff" fontSize="9">Phase (°)</text>
        <path d={phasePath} fill="none" stroke="#ff00ff" strokeWidth="1" />
        
        {/* X Axis Labels */}
        <text x={padding} y={height - 5} fill="#666" fontSize="8" textAnchor="middle">50Hz</text>
        <text x={getX(1000)} y={height - 5} fill="#666" fontSize="8" textAnchor="middle">1kHz</text>
        <text x={width - padding} y={height - 5} fill="#666" fontSize="8" textAnchor="middle">2.5kHz</text>
     </svg>
  );
};

export const SpeakerDesigner: React.FC = () => {
  const { installModel, installMaterial, setCurrentView } = useProjectStore();
  
  const [designerMode, setDesignerMode] = useState<'source' | 'material'>('material');
  const [testMode, setTestMode] = useState<'RAYTRACE' | 'FDTD'>('RAYTRACE');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);

  // —— Identity State ——
  const [itemName, setItemName] = useState('New Sandbox Asset');
  const [itemCategory, setItemCategory] = useState('Custom');

  // —— FDTD State ——
  const [fdtdPlaneY, setFdtdPlaneY] = useState(0);
  const [fdtdMode, setFdtdMode] = useState<'impulse' | 'cw'>('impulse');
  const fdtdWorkerRef = useRef<Worker | null>(null);
  const pressureMapRef = useRef<Float32Array | null>(null);
  const [bodeData, setBodeData] = useState<{ freqs: number[], mags: number[], phases: number[] } | null>(null);

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

  const addSandboxPrimitive = (shape: SceneObject['shape']) => {
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

  const generateFdtdWalls = (objects: SceneObject[], planeY: number, nx: number, ny: number): Uint8Array => {
    const walls = new Uint8Array(nx * ny);
    const size = 4; // 4x4 meters sandbox
    const dx = size / nx;
    const dy = size / ny;

    for (let yi = 0; yi < ny; yi++) {
       for (let xi = 0; xi < nx; xi++) {
          const px = (xi * dx) - (size / 2) + (dx/2);
          const pz = (yi * dy) - (size / 2) + (dy/2);

          let isWall = false;
          for (const obj of objects) {
             if (obj.type !== 'mesh') continue;
             
             const hx = obj.scale[0] / 2;
             const hy = obj.scale[1] / 2;
             const hz = obj.scale[2] / 2;
             
             // Ensure current elevation is within object's Y bounds
             if (planeY < obj.position[1] - hy || planeY > obj.position[1] + hy) continue;

             const dx_p = px - obj.position[0];
             const dz_p = pz - obj.position[2];

             if (obj.shape === 'box' || obj.shape === 'plane' || obj.shape === 'mesh') {
                if (Math.abs(dx_p) <= hx && Math.abs(dz_p) <= hz) isWall = true;
             }
             else if (obj.shape === 'cylinder') {
                const r = Math.sqrt(dx_p*dx_p + dz_p*dz_p);
                if (r <= hx) isWall = true; // Assumes scale X = scale Z
             }
             else if (obj.shape === 'tube') {
                const r = Math.sqrt(dx_p*dx_p + dz_p*dz_p);
                // Hollow tube thickness approx 15% of radius
                if (r <= hx && r >= hx * 0.85) isWall = true;
             }
             else if (obj.shape === 'trapezoid') {
                // Tapered bounding check
                const yNormalized = (obj.position[1] + hy - planeY) / (hy * 2); // 0 at top, 1 at bottom
                // scale tapers from 0.8 (bottom) to 0.3 (top), which is ratio 1.0 to 0.375
                const taperFactor = 0.375 + (0.625 * yNormalized);
                if (Math.abs(dx_p) <= hx * taperFactor && Math.abs(dz_p) <= hz * taperFactor) isWall = true;
             }
             
             if (isWall) break;
          }
          if (isWall) walls[yi * nx + xi] = 1;
       }
    }
    return walls;
  };

  const stopFdtd = () => {
    if (fdtdWorkerRef.current) {
        fdtdWorkerRef.current.postMessage({ type: 'STOP' });
        fdtdWorkerRef.current.terminate();
        fdtdWorkerRef.current = null;
    }
    setIsSimulating(false);
  };

  const runImpedanceExtraction = () => {
    if (isSimulating) stopFdtd();
    setIsSimulating(true);
    setSimProgress(0);

    const nx = 200; const ny = 200; const size = 4;
    const walls = generateFdtdWalls(sandboxObjects, fdtdPlaneY, nx, ny);
    
    fdtdWorkerRef.current = new Worker(new URL('../engine/fdtd_worker.ts', import.meta.url), { type: 'module' });
    fdtdWorkerRef.current.onmessage = (e) => {
        if (e.data.type === 'PROGRESS') {
           setSimProgress(e.data.progress);
        } else if (e.data.type === 'IMPEDANCE_RESULTS') {
           setBodeData({
              freqs: e.data.freqs,
              mags: e.data.mags,
              phases: e.data.phases
           });
           setIsSimulating(false);
           if (fdtdWorkerRef.current) {
              fdtdWorkerRef.current.terminate();
              fdtdWorkerRef.current = null;
           }
        }
    };

    fdtdWorkerRef.current.postMessage({ 
        type: 'INIT', 
        payload: { nx, ny, walls, sourceX: 100, sourceY: 190, simMode: 'impedance', frequency: 500 } 
    });
  };

  const runSandboxSimulation = () => {
    if (testMode === 'FDTD') {
        if (isSimulating) {
           stopFdtd();
           return;
        }
        setIsSimulating(true);
        const nx = 200; const ny = 200; const size = 4;
        const walls = generateFdtdWalls(sandboxObjects, fdtdPlaneY, nx, ny);
        
        // Find source location on grid
        const srcObj = sandboxObjects.find(o => o.id === 'sandbox_src');
        let srcX = 100; let srcY = 100;
        if (srcObj) {
           srcX = Math.floor(((srcObj.position[0] + size/2) / size) * nx);
           srcY = Math.floor(((srcObj.position[2] + size/2) / size) * ny);
        }

        fdtdWorkerRef.current = new Worker(new URL('../engine/fdtd_worker.ts', import.meta.url), { type: 'module' });
        fdtdWorkerRef.current.onmessage = (e) => {
            if (e.data.type === 'RENDER') {
               pressureMapRef.current = new Float32Array(e.data.pressureMap);
            }
        };

        fdtdWorkerRef.current.postMessage({ 
            type: 'INIT', 
            payload: { nx, ny, walls, sourceX: srcX, sourceY: srcY, simMode: fdtdMode, frequency: 500 } 
        });
        return;
    }

    // --- RAYTRACING LOGIC ---
    setIsSimulating(true);
    setSimProgress(0);
    
    // Fake the triangles for primitives to feed BVH worker correctly
    const workerObjects = sandboxObjects.map(obj => {
      if (obj.type === 'mesh') {
         let geom: THREE.BufferGeometry;
         if (obj.shape === 'box') { geom = new THREE.BoxGeometry(1, 1, 1); }
         else if (obj.shape === 'plane') { geom = new THREE.PlaneGeometry(1, 1); }
         else if (obj.shape === 'cylinder') { geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); }
         else if (obj.shape === 'tube') { geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1, true); }
         else if (obj.shape === 'trapezoid') { geom = new THREE.CylinderGeometry(0.3, 0.8, 1, 4); }
         else { geom = new THREE.BoxGeometry(1, 1, 1); }
         
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
           <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Engine Mode</h4>
           <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '4px' }}>
              <button onClick={() => {if(isSimulating) stopFdtd(); setTestMode('RAYTRACE')}} style={{ flex: 1, padding: '6px', fontSize: '11px', border: 'none', background: testMode === 'RAYTRACE' ? '#fff' : 'transparent', color: testMode === 'RAYTRACE' ? '#000' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Broadband (Ray)
              </button>
              <button onClick={() => {if(isSimulating) setIsSimulating(false); setTestMode('FDTD')}} style={{ flex: 1, padding: '6px', fontSize: '11px', border: 'none', background: testMode === 'FDTD' ? '#fff' : 'transparent', color: testMode === 'FDTD' ? '#000' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Low Frequency (Wave)
              </button>
           </div>
        </section>

        {testMode === 'FDTD' && (
           <section style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Analysis Plane Control</h4>
              <div className="control-group" style={{ marginBottom: '15px' }}>
                 <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Slice Elevation (Y-Axis)</label>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <input type="range" min="-2" max="2" step="0.05" value={fdtdPlaneY} onChange={e => setFdtdPlaneY(parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent-primary)' }} />
                     <span style={{ fontSize: '12px', fontWeight: 'bold', width: '40px', color: 'var(--accent-primary)' }}>{fdtdPlaneY.toFixed(2)}m</span>
                 </div>
              </div>
              <div className="control-group" style={{ marginBottom: '15px' }}>
                 <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Excitation Signal</label>
                 <select className="input" value={fdtdMode} onChange={e => setFdtdMode(e.target.value as any)} style={{ width: '100%', borderRadius: '8px' }}>
                    <option value="impulse">Gaussian Impulse (Broadband)</option>
                    <option value="cw">Continuous Wave (500Hz Sine)</option>
                 </select>
              </div>
              
              <button 
                 className="button" 
                 onClick={runImpedanceExtraction}
                 disabled={isSimulating}
                 style={{ width: '100%', fontSize: '10px', height: '30px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              >
                 <Activity size={12} /> EXTRACT IMPEDANCE (BODE)
              </button>
           </section>
        )}

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '15px' }}>
             <button className="button" style={{ fontSize: '10px', padding: '6px 0', gap: '4px', flexDirection: 'column' }} onClick={() => addSandboxPrimitive('box')}>
               <PlusSquare size={14} /> Block
             </button>
             <button className="button" style={{ fontSize: '10px', padding: '6px 0', gap: '4px', flexDirection: 'column' }} onClick={() => addSandboxPrimitive('plane')}>
               <PlusSquare size={14} /> Plate
             </button>
             <button className="button" style={{ fontSize: '10px', padding: '6px 0', gap: '4px', flexDirection: 'column' }} onClick={() => addSandboxPrimitive('cylinder')}>
               <PlusSquare size={14} /> Cylinder
             </button>
             <button className="button" style={{ fontSize: '10px', padding: '6px 0', gap: '4px', flexDirection: 'column' }} onClick={() => addSandboxPrimitive('tube')}>
               <PlusSquare size={14} /> Hollow Tube
             </button>
             <button className="button" style={{ fontSize: '10px', padding: '6px 0', gap: '4px', flexDirection: 'column' }} onClick={() => addSandboxPrimitive('trapezoid')}>
               <PlusSquare size={14} /> Trapezoid
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
               disabled={isSimulating && testMode !== 'FDTD'}
               style={{ gap: '8px', borderRadius: '20px', padding: '8px 24px', background: isSimulating ? (testMode === 'FDTD' ? '#ff3333' : 'var(--text-secondary)') : 'var(--accent-primary)', color: isSimulating && testMode === 'FDTD' ? '#fff' : '#000', fontWeight: 'bold' }}
            >
               {isSimulating ? (testMode === 'FDTD' ? 'STOP FDTD ENGINE' : `SIMULATING (${simProgress}%)`) : <><Play size={16} fill="#000" /> {testMode === 'RAYTRACE' ? 'RUN ACOUSTIC TEST' : 'START FDTD ENGINE'}</>}
            </button>
         </div>

         <div style={{ position: 'absolute', top: '15px', right: '20px', zIndex: 10, textAlign: 'right', pointerEvents: 'none' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Micro Environment</h3>
            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Free-field Space (4x4m Bounding)</p>
         </div>

         <div className="glass-panel" style={{ width: '100%', height: '100%' }}>
            <Canvas shadows gl={{ antialias: true }} camera={{ position: [2, 2, 3], fov: 45 }}>
               <color attach="background" args={['#050508']} />
               <SandboxRenderer 
                  objects={sandboxObjects} 
                  selectedId={selectedSandboxId} 
                  onSelect={setSelectedSandboxId} 
                  onUpdate={handleUpdateSandboxObj}
                  testMode={testMode}
                  fdtdPlaneY={fdtdPlaneY}
                  isFdtdRunning={isSimulating && testMode === 'FDTD'}
                  pressureMapRef={pressureMapRef}
               />
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

         {testMode === 'RAYTRACE' ? (
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
         ) : (
            <div style={{ padding: '20px', flex: 1 }}>
               <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                  <Activity size={14} color="#ff00ff" /> Sample Impedance (Bode)
               </h4>
               
               <div style={{ width: '100%' }}>
                  <BodePlot freqs={bodeData?.freqs || []} mags={bodeData?.mags || []} phases={bodeData?.phases || []} />
               </div>
               
               <p style={{ fontSize: '9px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px', fontStyle: 'italic' }}>
                  Low-frequency Acoustic Impedance Z(f) measured via FDTD Two-Mic method.
               </p>
            </div>
         )}
      </div>

    </div>
  );
};
