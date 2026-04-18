import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SceneObject, SpeakerModel, AcousticMaterial, SimulationResult } from '../types';
import * as THREE from 'three';
import {
  Save, Activity, Share2, Layers, Zap, PlusSquare, Play, Trash2,
  Maximize, ArrowLeft, Settings, ChevronDown, ChevronUp, Terminal,
} from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, OrthographicCamera } from '@react-three/drei';
import { SpectralEditor } from './SpectralEditor';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SimAccuracy {
  gridRes: 100 | 200 | 300;
  domainSizeM: 2 | 4 | 8;
  fftSize: 4096 | 8192 | 16384;
}

// ─── 3D Components (inside Canvas) ───────────────────────────────────────────

/** Renders all sandbox objects + controls. Receives viewMode as a prop — no store hooks inside Canvas. */
const SandboxRenderer: React.FC<{
  objects: SceneObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<SceneObject>) => void;
  testMode: 'RAYTRACE' | 'FDTD';
  fdtdPlaneY: number;
  isFdtdRunning: boolean;
  pressureMapRef: React.MutableRefObject<Float32Array | null>;
  viewMode: '2D' | '3D';
}> = ({ objects, selectedId, onSelect, onUpdate, testMode, fdtdPlaneY, isFdtdRunning, pressureMapRef, viewMode }) => (
  <>
    <ambientLight intensity={0.35} />
    <directionalLight position={[5, 8, 5]} intensity={1.1} castShadow />
    <Grid
      infiniteGrid
      fadeDistance={12}
      fadeStrength={4}
      sectionColor="#1a1a1a"
      cellColor="#0d0d0d"
      sectionSize={1}
      cellSize={0.2}
    />
    {objects.map(obj => (
      <SandboxObject
        key={obj.id}
        obj={obj}
        isSelected={selectedId === obj.id}
        onSelect={() => onSelect(obj.id)}
        onUpdate={onUpdate}
      />
    ))}
    {viewMode === '2D' ? (
      <OrthographicCamera makeDefault position={[0, fdtdPlaneY + 8, 0]} rotation={[-Math.PI / 2, 0, 0]} zoom={80} />
    ) : (
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.7} />
    )}
    {testMode === 'FDTD' && (
      <FdtdAnalysisPlane y={fdtdPlaneY} isRunning={isFdtdRunning} pressureMapRef={pressureMapRef} />
    )}
    <mesh onPointerMissed={() => onSelect(null)}>
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  </>
);

const SandboxObject: React.FC<{
  obj: SceneObject;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (id: string, updates: Partial<SceneObject>) => void;
}> = ({ obj, isSelected, onSelect, onUpdate }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const handleTransform = () => {
    if (!meshRef.current) return;
    const { position, rotation, scale } = meshRef.current;
    onUpdate(obj.id, {
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      scale: [scale.x, scale.y, scale.z],
    });
  };

  // Blue-tint when a material is assigned, otherwise monochrome
  const meshColor = obj.material
    ? (isSelected ? '#99aaff' : '#4455bb')
    : (isSelected ? '#ffffff' : '#555555');

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
        onClick={e => { e.stopPropagation(); onSelect(); }}
        castShadow
        receiveShadow
      >
        {obj.shape === 'box'       ? <boxGeometry args={[1, 1, 1]} /> :
         obj.shape === 'sphere'    ? <sphereGeometry args={[0.2, 16, 16]} /> :
         obj.shape === 'cylinder'  ? <cylinderGeometry args={[0.5, 0.5, 1, 32]} /> :
         obj.shape === 'tube'      ? <cylinderGeometry args={[0.5, 0.5, 1, 32, 1, true]} /> :
         obj.shape === 'trapezoid' ? <cylinderGeometry args={[0.3, 0.8, 1, 4]} /> :
                                     <planeGeometry args={[1, 1]} />}

        {obj.type === 'source' ? (
          <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={isSelected ? 1.4 : 0.6} wireframe />
        ) : obj.type === 'receiver' ? (
          <meshStandardMaterial color="#cc00ff" emissive="#cc00ff" emissiveIntensity={isSelected ? 1.4 : 0.6} wireframe />
        ) : (
          <meshStandardMaterial
            color={meshColor}
            emissive={isSelected ? '#222' : '#000'}
            emissiveIntensity={0.3}
            opacity={0.88}
            transparent
            side={THREE.DoubleSide}
          />
        )}
      </mesh>
    </group>
  );
};

const FdtdAnalysisPlane: React.FC<{
  y: number;
  isRunning: boolean;
  pressureMapRef: React.MutableRefObject<Float32Array | null>;
}> = ({ y, isRunning, pressureMapRef }) => {
  const textureRef = useRef<THREE.CanvasTexture>(null);
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
    for (let i = 0; i < 40000; i++) {
      const p = buf[i];
      const val = Math.min(255, Math.max(0, Math.floor(Math.abs(p) * 2000)));
      imgData.data[i * 4]     = p > 0 ? val : 0;
      imgData.data[i * 4 + 1] = 0;
      imgData.data[i * 4 + 2] = p < 0 ? val : 0;
      imgData.data[i * 4 + 3] = val > 5 ? 220 : 0;
    }
    ctx.putImageData(imgData, 0, 0);
    textureRef.current.needsUpdate = true;
  });

  return (
    <group position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[4, 4]} />
        <meshBasicMaterial transparent side={THREE.DoubleSide} depthWrite={false}>
          <canvasTexture ref={textureRef} attach="map" args={[memCanvas]} magFilter={THREE.NearestFilter} />
        </meshBasicMaterial>
      </mesh>
      <mesh>
        <planeGeometry args={[4, 4]} />
        <meshBasicMaterial color="#ffff00" wireframe opacity={isRunning ? 0 : 0.15} transparent depthWrite={false} />
      </mesh>
    </group>
  );
};

// ─── Bode Plot ────────────────────────────────────────────────────────────────
const BodePlot: React.FC<{ freqs: number[]; mags: number[]; phases: number[] }> = ({ freqs, mags, phases }) => {
  if (freqs.length === 0) {
    return (
      <div style={{
        height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.3)',
        borderRadius: '6px', border: '1px solid var(--border-color)', fontStyle: 'italic',
      }}>
        Run "Extract Impedance" to generate Bode plot
      </div>
    );
  }

  const W = 320, H = 160, P = 24;
  const midY = P + (H - 2 * P) / 2;
  const pHeight = (H - 2 * P) / 2;

  const minF = 50, maxF = Math.max(...freqs, 2500);
  const logRange = Math.log10(maxF) - Math.log10(minF);
  const gx = (f: number) => P + ((Math.log10(f) - Math.log10(minF)) / logRange) * (W - 2 * P);

  const maxM = Math.max(...mags), minM = Math.min(...mags);
  const logMaxM = Math.log10(maxM), logMinM = Math.log10(Math.max(0.1, minM));
  const rngM = Math.max(0.1, logMaxM - logMinM);
  const gy_mag = (m: number) => P + (1 - (Math.log10(Math.max(0.1, m)) - logMinM) / rngM) * pHeight;
  const gy_ph  = (p: number) => P + pHeight + (1 - (p + 180) / 360) * pHeight;

  let magPath = `M ${gx(freqs[0])},${gy_mag(mags[0])}`;
  let phPath  = `M ${gx(freqs[0])},${gy_ph(phases[0])}`;
  for (let i = 1; i < freqs.length; i++) {
    magPath += ` L ${gx(freqs[i])},${gy_mag(mags[i])}`;
    phPath  += ` L ${gx(freqs[i])},${gy_ph(phases[i])}`;
  }

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
      style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
      <line x1={P} y1={midY} x2={W - P} y2={midY} stroke="#1a1a1a" strokeWidth={1} />
      <text x={P} y={P - 5} fill="#00e5ff" fontSize="8" fontWeight="600">|Z| MAGNITUDE</text>
      <text x={P} y={midY + 12} fill="#cc00ff" fontSize="8" fontWeight="600">PHASE (°)</text>
      <path d={magPath} fill="none" stroke="#00e5ff" strokeWidth={1.5} />
      <path d={phPath}  fill="none" stroke="#cc00ff" strokeWidth={1} strokeDasharray="3 2" />
      {[100, 500, 1000, 2000].map(f =>
        freqs.some(fr => fr <= f) ? (
          <g key={f}>
            <line x1={gx(f)} y1={H - P} x2={gx(f)} y2={H - P + 3} stroke="#222" />
            <text x={gx(f)} y={H - 5} fill="#444" fontSize="7" textAnchor="middle">
              {f >= 1000 ? `${f / 1000}k` : f}Hz
            </text>
          </g>
        ) : null
      )}
    </svg>
  );
};

// ─── Shared style objects ─────────────────────────────────────────────────────
const divider: React.CSSProperties = { height: '1px', background: 'var(--border-color)', margin: '14px 0' };
const secLabel: React.CSSProperties = {
  fontSize: '9px', fontWeight: '700', color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px',
  display: 'flex', alignItems: 'center', gap: '5px',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const SpeakerDesigner: React.FC = () => {
  const { installModel, installMaterial, setCurrentView, viewMode, setViewMode, installedMaterials } = useProjectStore();

  // ── Mode ──
  const [designerMode, setDesignerMode] = useState<'source' | 'material'>('material');
  const [testMode, setTestMode]         = useState<'RAYTRACE' | 'FDTD'>('RAYTRACE');

  // ── Simulation state ──
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress]   = useState(0);
  const [simLog, setSimLog]             = useState<string[]>([]);
  const addLog = useCallback((msg: string) => {
    setSimLog(prev => [...prev.slice(-40), `${new Date().toLocaleTimeString('en', { hour12: false })}  ${msg}`]);
  }, []);

  // ── Identity ──
  const [itemName, setItemName]         = useState('New Acoustic Device');
  const [itemCategory, setItemCategory] = useState('Custom');

  // ── FDTD ──
  const [fdtdPlaneY, setFdtdPlaneY] = useState(0);
  const [fdtdMode, setFdtdMode]     = useState<'impulse' | 'cw'>('impulse');
  const fdtdWorkerRef  = useRef<Worker | null>(null);
  const pressureMapRef = useRef<Float32Array | null>(null);
  const [bodeData, setBodeData] = useState<{ freqs: number[]; mags: number[]; phases: number[] } | null>(null);

  // ── Accuracy ──
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [simAccuracy, setSimAccuracy]   = useState<SimAccuracy>({ gridRes: 200, domainSizeM: 4, fftSize: 8192 });

  // ── Sandbox objects ──
  const [sandboxObjects, setSandboxObjects] = useState<SceneObject[]>([
    { id: 'sandbox_src', name: 'Test Source',      type: 'source',   shape: 'sphere', position: [0, 0.1,  1.5], scale: [0.15, 0.15, 0.15], rotation: [0, 0, 0], sourceType: 'omni', intensity: 100 },
    { id: 'sandbox_mic', name: 'Measurement Mic',  type: 'receiver', shape: 'sphere', position: [0, 0.1, -1.5], scale: [0.10, 0.10, 0.10], rotation: [0, 0, 0] },
    { id: `box_${Date.now()}`, name: 'Test Panel', type: 'mesh',     shape: 'box',    position: [0, 0.025, 0],  scale: [1, 0.05, 0.8],    rotation: [0, 0, 0] },
  ]);
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);

  // ── Results ──
  const [frequencyResponse, setFrequencyResponse] = useState<number[]>(Array(24).fill(-24));
  const [absorption, setAbsorption]               = useState<number[]>(Array(24).fill(0));
  const [etcData, setEtcData]                     = useState<{ time: number; energy: number }[]>([]);

  // ── Object mutations ──────────────────────────────────────────────────────────
  const handleUpdateObj = (id: string, updates: Partial<SceneObject>) =>
    setSandboxObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));

  const addPrimitive = (shape: SceneObject['shape']) => {
    const id = `sandbox_${Date.now()}`;
    const label = shape!.charAt(0).toUpperCase() + shape!.slice(1);
    setSandboxObjects(prev => [...prev, {
      id, name: label, type: 'mesh', shape,
      position: [(Math.random() - 0.5) * 1.5, 0.1, (Math.random() - 0.5) * 1.5],
      scale: [1, 1, 1], rotation: [0, 0, 0],
    }]);
    setSelectedSandboxId(id);
  };

  const removeSelected = () => {
    if (selectedSandboxId && !['sandbox_src', 'sandbox_mic'].includes(selectedSandboxId)) {
      setSandboxObjects(prev => prev.filter(o => o.id !== selectedSandboxId));
      setSelectedSandboxId(null);
    }
  };

  // ── FDTD wall rasteriser ──────────────────────────────────────────────────────
  const generateWalls = (objects: SceneObject[], planeY: number, nx: number, ny: number, size: number): Uint8Array => {
    const walls = new Uint8Array(nx * ny);
    const dx = size / nx, dy = size / ny;
    for (let yi = 0; yi < ny; yi++) {
      for (let xi = 0; xi < nx; xi++) {
        const px = (xi * dx) - size / 2 + dx / 2;
        const pz = (yi * dy) - size / 2 + dy / 2;
        for (const obj of objects) {
          if (obj.type !== 'mesh') continue;
          const hx = obj.scale[0] / 2, hy = obj.scale[1] / 2, hz = obj.scale[2] / 2;
          if (planeY < obj.position[1] - hy || planeY > obj.position[1] + hy) continue;
          const dpx = px - obj.position[0], dpz = pz - obj.position[2];
          let hit = false;
          if (obj.shape === 'box' || obj.shape === 'plane') {
            hit = Math.abs(dpx) <= hx && Math.abs(dpz) <= hz;
          } else if (obj.shape === 'cylinder') {
            hit = Math.sqrt(dpx * dpx + dpz * dpz) <= hx;
          } else if (obj.shape === 'tube') {
            const r = Math.sqrt(dpx * dpx + dpz * dpz);
            hit = r <= hx && r >= hx * 0.85;
          } else if (obj.shape === 'trapezoid') {
            const yN = (obj.position[1] + hy - planeY) / (hy * 2);
            const tf = 0.375 + 0.625 * yN;
            hit = Math.abs(dpx) <= hx * tf && Math.abs(dpz) <= hz * tf;
          }
          if (hit) { walls[yi * nx + xi] = 1; break; }
        }
      }
    }
    return walls;
  };

  // ── Stop FDTD ────────────────────────────────────────────────────────────────
  const stopFdtd = useCallback(() => {
    fdtdWorkerRef.current?.postMessage({ type: 'STOP' });
    fdtdWorkerRef.current?.terminate();
    fdtdWorkerRef.current = null;
    setIsSimulating(false);
    addLog('■ Simulation stopped.');
  }, [addLog]);

  // ── Impedance extraction (Bode) ───────────────────────────────────────────────
  const runImpedanceExtraction = () => {
    if (isSimulating) stopFdtd();
    setIsSimulating(true);
    setSimProgress(0);
    setBodeData(null);
    const { gridRes: nx, domainSizeM, fftSize } = simAccuracy;
    const chunkSize = fftSize === 4096 ? 512 : fftSize === 8192 ? 256 : 128;
    addLog(`▶ Impedance extraction — ${nx}×${nx} grid · ${domainSizeM}m domain · ${fftSize}-pt FFT`);

    const walls = generateWalls(sandboxObjects, fdtdPlaneY, nx, nx, domainSizeM);
    fdtdWorkerRef.current = new Worker(new URL('../engine/fdtd_worker.ts', import.meta.url), { type: 'module' });
    fdtdWorkerRef.current.onmessage = (e) => {
      if (e.data.type === 'PROGRESS') {
        setSimProgress(e.data.progress);
        if (e.data.progress % 10 === 0 && e.data.progress > 0)
          addLog(`FDTD  ${e.data.progress.toString().padStart(3)}%`);
      } else if (e.data.type === 'LOG') {
        addLog(e.data.message);
      } else if (e.data.type === 'IMPEDANCE_RESULTS') {
        setBodeData({ freqs: e.data.freqs, mags: e.data.mags, phases: e.data.phases });
        setIsSimulating(false);
        addLog(`✓ Done — ${e.data.freqs.length} frequency bins extracted`);
        fdtdWorkerRef.current?.terminate();
        fdtdWorkerRef.current = null;
      }
    };
    fdtdWorkerRef.current.postMessage({
      type: 'INIT',
      payload: {
        nx, ny: nx, walls,
        sourceX: Math.floor(nx / 2),
        sourceY: Math.floor(nx * 0.95),
        simMode: 'impedance',
        frequency: 500,
        fftSize,
        chunkSize,
      },
    });
  };

  // ── Full sandbox simulation (FDTD live or raytrace) ───────────────────────────
  const runSimulation = () => {
    if (testMode === 'FDTD') {
      if (isSimulating) { stopFdtd(); return; }
      setIsSimulating(true);
      const { gridRes: nx, domainSizeM: size } = simAccuracy;
      addLog(`▶ FDTD wave sim — ${nx}×${nx} · ${size}m domain · ${fdtdMode}`);
      const walls = generateWalls(sandboxObjects, fdtdPlaneY, nx, nx, size);
      const src = sandboxObjects.find(o => o.id === 'sandbox_src');
      let srcX = Math.floor(nx / 2), srcY = Math.floor(nx / 2);
      if (src) {
        srcX = Math.max(1, Math.min(nx - 2, Math.floor(((src.position[0] + size / 2) / size) * nx)));
        srcY = Math.max(1, Math.min(nx - 2, Math.floor(((src.position[2] + size / 2) / size) * nx)));
      }
      fdtdWorkerRef.current = new Worker(new URL('../engine/fdtd_worker.ts', import.meta.url), { type: 'module' });
      fdtdWorkerRef.current.onmessage = (e) => {
        if (e.data.type === 'RENDER')
          pressureMapRef.current = new Float32Array(e.data.pressureMap);
        else if (e.data.type === 'LOG')
          addLog(e.data.message);
      };
      fdtdWorkerRef.current.postMessage({
        type: 'INIT',
        payload: { nx, ny: nx, walls, sourceX: srcX, sourceY: srcY, simMode: fdtdMode, frequency: 500, fftSize: simAccuracy.fftSize, chunkSize: 256 },
      });
      return;
    }

    // ── Broadband raytrace ──
    setIsSimulating(true);
    setSimProgress(0);
    addLog('▶ Broadband ray tracing — 15 000 rays · 5 bounces');

    const workerObjects = sandboxObjects.map(obj => {
      if (obj.type !== 'mesh') return obj;
      let geom: THREE.BufferGeometry;
      if      (obj.shape === 'box')       geom = new THREE.BoxGeometry(1, 1, 1);
      else if (obj.shape === 'plane')     geom = new THREE.PlaneGeometry(1, 1);
      else if (obj.shape === 'cylinder')  geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
      else if (obj.shape === 'tube')      geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1, true);
      else if (obj.shape === 'trapezoid') geom = new THREE.CylinderGeometry(0.3, 0.8, 1, 4);
      else                                geom = new THREE.BoxGeometry(1, 1, 1);
      geom.scale(obj.scale[0], obj.scale[1], obj.scale[2]);
      geom.rotateX(obj.rotation[0]);
      geom.rotateY(obj.rotation[1]);
      geom.rotateZ(obj.rotation[2]);
      geom.translate(obj.position[0], obj.position[1], obj.position[2]);
      const pos = geom.attributes.position, idx = geom.index;
      const tris: number[] = [];
      if (idx) for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        tris.push(pos.getX(a), pos.getY(a), pos.getZ(a), pos.getX(b), pos.getY(b), pos.getZ(b), pos.getX(c), pos.getY(c), pos.getZ(c));
      }
      return { ...obj, triangles: tris };
    });

    const worker = new Worker(new URL('../engine/simulation_worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'PROGRESS') {
        setSimProgress(e.data.progress);
        if (e.data.progress % 25 === 0) addLog(`Ray sim  ${e.data.progress.toString().padStart(3)}%`);
      } else if (e.data.type === 'DONE') {
        const res: SimulationResult = e.data.results.find((r: any) => r.receiverId === 'sandbox_mic');
        if (res?.metrics) {
          if (designerMode === 'source')
            setFrequencyResponse(res.metrics.spl.map(v => isFinite(v) ? v : -30));
          else
            setAbsorption(res.metrics.spl.map(v => isFinite(v) ? Math.max(0, Math.min(1, 1 - Math.pow(10, v / 10) / 100)) : 1));
          if (res.metrics.etc) setEtcData(res.metrics.etc);
        }
        addLog('✓ Raytracing complete');
        setIsSimulating(false);
        worker.terminate();
      } else if (e.data.type === 'ERROR') {
        addLog(`✗ Error: ${e.data.error}`);
        setIsSimulating(false);
        worker.terminate();
      }
    };
    worker.postMessage({
      objects: workerObjects,
      sources: workerObjects.filter(o => o.type === 'source'),
      receivers: workerObjects.filter(o => o.type === 'receiver'),
      environmentSettings: { rayCount: 15000, maxBounces: 5, ismOrder: 2 },
    });
  };

  // ── Save / install to workspace ───────────────────────────────────────────────
  const handleInstall = () => {
    if (designerMode === 'source') {
      const model: SpeakerModel = {
        id: `sbx_${Date.now()}`,
        name: itemName || 'Unnamed Device',
        manufacturer: itemCategory || 'Custom',
        type: 'Point-Source',
        directivity: { name: 'Omni', horizontal: [], vertical: [], attenuation: [] },
        specs: `Sandbox-derived. Grid: ${simAccuracy.gridRes}², Domain: ${simAccuracy.domainSizeM}m.`,
        pwl: 100,
        frequencyResponse,
      };
      installModel(model);
    } else {
      const mat: AcousticMaterial = {
        name: itemName || 'Unnamed Material',
        category: itemCategory || 'Custom',
        type: 'broadband',
        absorption,
      };
      installMaterial(mat);
    }
    addLog(`✓ Installed "${itemName}" → workspace library`);
    setCurrentView('WORKSPACE');
  };

  const maxEtc = useMemo(() => etcData.length > 0 ? Math.max(...etcData.map(e => e.energy)) : 1, [etcData]);
  const selectedObj = sandboxObjects.find(o => o.id === selectedSandboxId);
  const dx_cm = (simAccuracy.domainSizeM / simAccuracy.gridRes * 100).toFixed(1);

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>

      {/* ══ LEFT PANEL ══════════════════════════════════════════════════════════ */}
      <div style={{ width: '290px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* ── Navigation header (matches Topbar style) */}
        <div style={{ height: '44px', padding: '0 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <button
            onClick={() => setCurrentView('WORKSPACE')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            <ArrowLeft size={11} /> Workspace
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border-color)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-primary)' }}>
            <Maximize size={12} />
            <span style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '0.12em' }}>MICRO SANDBOX</span>
          </div>
        </div>

        <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── Asset type tabs */}
          <div style={secLabel}><Layers size={9} />Asset Type</div>
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px', marginBottom: '14px' }}>
            {(['source', 'material'] as const).map(m => (
              <button key={m} onClick={() => setDesignerMode(m)} style={{
                flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer', borderRadius: '4px',
                background: designerMode === m ? 'var(--accent-primary)' : 'transparent',
                color: designerMode === m ? '#000' : 'var(--text-secondary)',
                fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.15s',
              }}>
                {m === 'source' ? <Zap size={10} /> : <Layers size={10} />} {m}
              </button>
            ))}
          </div>

          <div style={divider} />

          {/* ── Engine mode */}
          <div style={secLabel}><Activity size={9} />Simulation Engine</div>
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px', marginBottom: '14px' }}>
            {[{ id: 'RAYTRACE', label: 'Broadband Ray' }, { id: 'FDTD', label: 'Wave FDTD' }].map(({ id, label }) => (
              <button key={id} onClick={() => { if (isSimulating) stopFdtd(); setTestMode(id as any); }} style={{
                flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer', borderRadius: '4px',
                background: testMode === id ? '#fff' : 'transparent',
                color: testMode === id ? '#000' : 'var(--text-secondary)',
                fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {/* ── FDTD controls */}
          {testMode === 'FDTD' && (
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
              {/* Analysis plane */}
              <div style={{ ...secLabel, marginBottom: '5px' }}>Analysis Plane — Y Slice</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <input type="range" min="-2" max="2" step="0.05" value={fdtdPlaneY}
                  onChange={e => setFdtdPlaneY(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent-primary)' }} />
                <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--accent-primary)', fontFamily: 'monospace', minWidth: '40px' }}>
                  {fdtdPlaneY.toFixed(2)}m
                </span>
              </div>

              {/* Excitation */}
              <div style={{ ...secLabel, marginBottom: '5px' }}>Excitation Signal</div>
              <select value={fdtdMode} onChange={e => setFdtdMode(e.target.value as any)}
                style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '5px', padding: '6px 8px', fontSize: '9px', marginBottom: '12px' }}>
                <option value="impulse">Gaussian Impulse (Broadband)</option>
                <option value="cw">Continuous Wave — 500 Hz Sine</option>
              </select>

              {/* Accuracy — collapsible */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <button onClick={() => setShowAccuracy(v => !v)} style={{
                  width: '100%', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: showAccuracy ? '10px' : '0',
                }}>
                  <Settings size={9} /> Accuracy Settings
                  <span style={{ marginLeft: 'auto' }}>{showAccuracy ? <ChevronUp size={10} /> : <ChevronDown size={10} />}</span>
                </button>
                {showAccuracy && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Grid resolution */}
                    <div>
                      <div style={{ ...secLabel, marginBottom: '5px' }}>Grid Resolution</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {([100, 200, 300] as const).map(r => (
                          <button key={r} onClick={() => setSimAccuracy(s => ({ ...s, gridRes: r }))} style={{
                            flex: 1, padding: '5px 0', border: '1px solid var(--border-color)', cursor: 'pointer', borderRadius: '4px',
                            background: simAccuracy.gridRes === r ? 'var(--accent-primary)' : 'transparent',
                            color: simAccuracy.gridRes === r ? '#000' : 'var(--text-secondary)',
                            fontSize: '9px', fontWeight: '700',
                          }}>
                            {r === 100 ? 'Low' : r === 200 ? 'Med' : 'High'}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: '8px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                        {simAccuracy.gridRes}×{simAccuracy.gridRes} · dx = {dx_cm} cm
                      </div>
                    </div>
                    {/* Domain size */}
                    <div>
                      <div style={{ ...secLabel, marginBottom: '5px' }}>Sandbox Domain</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {([2, 4, 8] as const).map(d => (
                          <button key={d} onClick={() => setSimAccuracy(s => ({ ...s, domainSizeM: d }))} style={{
                            flex: 1, padding: '5px 0', border: '1px solid var(--border-color)', cursor: 'pointer', borderRadius: '4px',
                            background: simAccuracy.domainSizeM === d ? 'var(--accent-primary)' : 'transparent',
                            color: simAccuracy.domainSizeM === d ? '#000' : 'var(--text-secondary)',
                            fontSize: '9px', fontWeight: '700',
                          }}>{d}m</button>
                        ))}
                      </div>
                    </div>
                    {/* FFT / analysis length */}
                    <div>
                      <div style={{ ...secLabel, marginBottom: '5px' }}>Analysis Length (Bode)</div>
                      <select value={simAccuracy.fftSize} onChange={e => setSimAccuracy(s => ({ ...s, fftSize: parseInt(e.target.value) as any }))}
                        style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '5px', padding: '6px 8px', fontSize: '9px' }}>
                        <option value={4096}>4 096 pts — Δf ≈ 50 Hz  (Fast)</option>
                        <option value={8192}>8 192 pts — Δf ≈ 25 Hz  (Balanced)</option>
                        <option value={16384}>16 384 pts — Δf ≈ 12 Hz  (Precise)</option>
                      </select>
                    </div>
                    {/* Extract impedance (Bode) button */}
                    <button className="button" onClick={runImpedanceExtraction} disabled={isSimulating}
                      style={{ fontSize: '9px', height: '28px', background: 'rgba(0,229,255,0.06)', borderColor: 'rgba(0,229,255,0.25)', color: '#00e5ff' }}>
                      <Activity size={10} /> Extract Impedance (Bode)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={divider} />

          {/* ── Identity */}
          <div style={secLabel}>Identity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
            {[{ label: 'Asset Name', val: itemName, set: setItemName }, { label: 'Category', val: itemCategory, set: setItemCategory }].map(({ label, val, set }) => (
              <div key={label}>
                <label style={{ fontSize: '8px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</label>
                <input value={val} onChange={e => set(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '5px', padding: '7px 8px', fontSize: '11px' }} />
              </div>
            ))}
            {/* Surface material — shown when a custom mesh is selected */}
            {selectedObj?.type === 'mesh' && (
              <div>
                <label style={{ fontSize: '8px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Surface Material — <span style={{ color: '#00e5ff' }}>{selectedObj.name}</span>
                </label>
                <select
                  value={selectedObj.material?.name || ''}
                  onChange={e => {
                    const mat = installedMaterials.find(m => m.name === e.target.value);
                    handleUpdateObj(selectedSandboxId!, { material: mat || undefined });
                  }}
                  style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid rgba(0,229,255,0.2)', color: '#fff', borderRadius: '5px', padding: '7px 8px', fontSize: '9px' }}>
                  <option value="">Rigid / Reflective (default)</option>
                  {installedMaterials.map(m => (
                    <option key={m.name} value={m.name}>{m.name} ({m.category})</option>
                  ))}
                </select>
                {selectedObj.material && (
                  <div style={{ fontSize: '8px', color: '#00e5ff', marginTop: '3px', fontFamily: 'monospace' }}>
                    ᾱ = {(selectedObj.material.absorption.reduce((a, b) => a + b, 0) / selectedObj.material.absorption.length).toFixed(3)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={divider} />

          {/* ── Construction */}
          <div style={secLabel}><PlusSquare size={9} />Sandbox Construction</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px', marginBottom: '10px' }}>
            {[{ s: 'box', l: 'Block' }, { s: 'plane', l: 'Plate' }, { s: 'cylinder', l: 'Cylinder' }, { s: 'tube', l: 'Tube' }, { s: 'trapezoid', l: 'Wedge' }]
              .map(({ s, l }) => (
                <button key={s} className="button" onClick={() => addPrimitive(s as SceneObject['shape'])}
                  style={{ fontSize: '9px', padding: '6px 0', flexDirection: 'column', gap: '3px' }}>
                  <PlusSquare size={10} />{l}
                </button>
              ))}
          </div>

          {/* Object list */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '14px', overflow: 'hidden', maxHeight: '160px', overflowY: 'auto' }}>
            {sandboxObjects.map(obj => (
              <div key={obj.id} onClick={() => setSelectedSandboxId(obj.id)} style={{
                padding: '7px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '6px',
                background: selectedSandboxId === obj.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderLeft: selectedSandboxId === obj.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                color: obj.id === 'sandbox_src' ? '#00e5ff' : obj.id === 'sandbox_mic' ? '#cc00ff' : (obj.material ? '#99aaff' : 'var(--text-primary)'),
              }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{obj.name}</span>
                {obj.material && <span style={{ fontSize: '7px', background: 'rgba(0,229,255,0.1)', color: '#00e5ff', padding: '1px 4px', borderRadius: '3px' }}>MAT</span>}
                {!['sandbox_src', 'sandbox_mic'].includes(obj.id) && selectedSandboxId === obj.id && (
                  <Trash2 size={10} color="#ff4444" style={{ cursor: 'pointer', flexShrink: 0 }} onClick={e => { e.stopPropagation(); removeSelected(); }} />
                )}
              </div>
            ))}
          </div>

          {/* ── Action buttons */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <button className="button primary" style={{ width: '100%', height: '38px', borderRadius: '20px', gap: '7px', fontSize: '10px' }} onClick={handleInstall}>
              <Save size={13} /> Install to Workspace
            </button>
            <button className="button" style={{ width: '100%', height: '30px', borderRadius: '20px', gap: '6px', fontSize: '9px' }}>
              <Share2 size={11} /> Publish to Marketplace
            </button>
          </div>
        </div>
      </div>

      {/* ══ CENTER — 3D Viewport ════════════════════════════════════════════════ */}
      <div style={{ flex: 1, position: 'relative', background: '#050508', overflow: 'hidden' }}>
        {/* Floating run button + progress bar */}
        <div style={{ position: 'absolute', top: '14px', left: '14px', zIndex: 10, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="button primary"
            onClick={runSimulation}
            disabled={isSimulating && testMode !== 'FDTD'}
            style={{
              gap: '6px', borderRadius: '20px', padding: '7px 18px', fontSize: '10px', fontWeight: '800',
              background: isSimulating && testMode === 'FDTD' ? '#cc2200' : 'var(--accent-primary)',
              color: isSimulating && testMode === 'FDTD' ? '#fff' : '#000',
            }}
          >
            <Play size={12} fill="currentColor" />
            {isSimulating ? (testMode === 'FDTD' ? '■  Stop FDTD' : `${simProgress.toFixed(0)}%`) : (testMode === 'FDTD' ? 'Run FDTD' : 'Run Acoustic Test')}
          </button>
          {isSimulating && (
            <div style={{ width: '80px', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${simProgress}%`, background: testMode === 'FDTD' ? '#00e5ff' : 'var(--accent-primary)', transition: 'width 0.3s' }} />
            </div>
          )}
        </div>

        {/* Top-right info badge */}
        <div style={{ position: 'absolute', top: '14px', right: '14px', zIndex: 10, pointerEvents: 'none', textAlign: 'right' }}>
          <div style={{ fontSize: '8px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {viewMode === '2D' ? 'Top-Down Slice' : '3D Perspective'} · {testMode}
          </div>
          <div style={{ fontSize: '8px', color: 'var(--text-tertiary)' }}>
            {simAccuracy.domainSizeM}m ·  {simAccuracy.gridRes}² · dx = {dx_cm} cm
          </div>
        </div>

        {/* 2D / 3D toggle — use the Topbar's existing viewMode state */}
        <div style={{ position: 'absolute', bottom: '14px', right: '14px', zIndex: 10, display: 'flex', gap: '4px' }}>
          {(['2D', '3D'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{
                padding: '5px 12px', border: '1px solid var(--border-color)', cursor: 'pointer', borderRadius: '20px',
                background: viewMode === m ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.6)',
                color: viewMode === m ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '9px', fontWeight: '700', backdropFilter: 'blur(8px)',
              }}>{m}</button>
          ))}
        </div>

        <Canvas shadows gl={{ antialias: true }}
          camera={{ position: viewMode === '2D' ? [0, 8, 0] : [2.5, 2, 3.5], fov: 45, up: [0, 1, 0] }}
          style={{ width: '100%', height: '100%' }}
        >
          <color attach="background" args={['#050508']} />
          <SandboxRenderer
            objects={sandboxObjects}
            selectedId={selectedSandboxId}
            onSelect={setSelectedSandboxId}
            onUpdate={handleUpdateObj}
            testMode={testMode}
            fdtdPlaneY={fdtdPlaneY}
            isFdtdRunning={isSimulating && testMode === 'FDTD'}
            pressureMapRef={pressureMapRef}
            viewMode={viewMode}
          />
        </Canvas>
      </div>

      {/* ══ RIGHT PANEL — Measurement Data ═════════════════════════════════════ */}
      <div style={{ width: '340px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: '44px', padding: '0 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Activity size={12} color="var(--accent-primary)" />
          <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Measurement Data</span>
        </div>

        {/* ETC — Time Domain */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <div style={secLabel}>Time Domain — ETC</div>
          <div style={{ height: '72px', background: 'rgba(0,0,0,0.4)', borderRadius: '5px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
            {etcData.length === 0 ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                Run test to generate ETC
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', padding: '0 2px', gap: '1px' }}>
                {etcData.map((pt, i) => (
                  <div key={i} style={{ flex: 1, minWidth: '1px', background: 'var(--accent-primary)', height: `${(pt.energy / maxEtc) * 100}%`, opacity: 0.85 }} />
                ))}
              </div>
            )}
          </div>
          {etcData.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '7px', color: 'var(--text-tertiary)' }}>
              <span>0 ms</span>
              <span>{(etcData[etcData.length - 1].time * 1000).toFixed(0)} ms</span>
            </div>
          )}
        </div>

        {/* Frequency Response or Bode Plot */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          {testMode === 'RAYTRACE' ? (
            <>
              <div style={secLabel}>
                {designerMode === 'source' ? 'Frequency Response (dB)' : 'Absorption Coefficient α(f)'}
              </div>
              <div style={{ pointerEvents: 'none' }}>
                {designerMode === 'source'
                  ? <SpectralEditor data={frequencyResponse} onChange={() => {}} mode="dB" minDb={-24} maxDb={24} />
                  : <SpectralEditor data={absorption} onChange={() => {}} mode="coefficient" />}
              </div>
            </>
          ) : (
            <>
              <div style={secLabel}>Acoustic Impedance Z(f) — Bode</div>
              <BodePlot freqs={bodeData?.freqs || []} mags={bodeData?.mags || []} phases={bodeData?.phases || []} />
            </>
          )}
        </div>

        {/* Simulation Log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 14px', overflow: 'hidden' }}>
          <div style={{ ...secLabel, marginBottom: '6px' }}>
            <Terminal size={9} /> Simulation Log
            {simLog.length > 0 && (
              <button onClick={() => setSimLog([])} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '8px' }}>
                clear
              </button>
            )}
          </div>
          <div style={{
            flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.5)', borderRadius: '5px',
            border: '1px solid var(--border-color)', padding: '8px', fontFamily: 'monospace',
            fontSize: '9px', lineHeight: '1.65',
          }}>
            {simLog.length === 0
              ? <span style={{ color: '#2a2a2a' }}>// simulation output will appear here</span>
              : simLog.map((line, i) => (
                  <div key={i} style={{ color: i === simLog.length - 1 ? '#00e5ff' : '#444' }}>{line}</div>
                ))
            }
          </div>
        </div>
      </div>

    </div>
  );
};
