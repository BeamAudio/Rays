import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SceneObject, SpeakerModel, AcousticMaterial, SimulationResult } from '../types';
import * as THREE from 'three';
import {
  Save, Activity, Share2, Layers, Zap, PlusSquare, Play, Trash2,
  Maximize, ArrowLeft, Settings, Terminal,
  Move, RotateCw, Maximize2, Search, X,
} from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, OrthographicCamera } from '@react-three/drei';
import { SpectralEditor } from './SpectralEditor';
import { MATERIALS_LIBRARY, MATERIAL_CATEGORIES, avgAlpha } from '../engine/materials_library';

// ─── Local Types ──────────────────────────────────────────────────────────────
interface SimAccuracy {
  gridRes: 100 | 200 | 300;
  domainSizeM: 2 | 4 | 8;
  fftSize: 4096 | 8192 | 16384;
}
type TransformMode = 'translate' | 'rotate' | 'scale';

// ─── Mini shared components ───────────────────────────────────────────────────

/** 8-bar mini absorption chart. */
const AbsBar: React.FC<{ values: number[]; height?: number }> = ({ values, height = 24 }) => {
  const idxs = [1, 4, 7, 10, 13, 16, 19, 22]; // octave centres in the 24-band array
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1px', height: `${height}px` }}>
      {idxs.map((bi, i) => (
        <div key={i} style={{
          flex: 1, background: 'var(--accent-primary)', borderRadius: '1px',
          opacity: 0.65, height: `${Math.max(4, (values[bi] ?? 0) * 100)}%`,
        }} />
      ))}
    </div>
  );
};

/** Inline number input with axis label. */
const NumField: React.FC<{
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; unit?: string;
}> = ({ label, value, onChange, step = 0.001, min = -100, max = 100, unit = 'm' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
    <span style={{ fontSize: '8px', color: 'var(--text-tertiary)', fontWeight: '700', width: '12px', textAlign: 'center' }}>{label}</span>
    <input
      type="number"
      value={parseFloat(value.toFixed(4))}
      step={step} min={min} max={max}
      onChange={e => onChange(isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))}
      style={{
        flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
        color: '#fff', borderRadius: '4px', padding: '4px 6px', fontSize: '10px',
        fontFamily: 'monospace', textAlign: 'right', outline: 'none',
      }}
    />
    <span style={{ fontSize: '8px', color: 'var(--text-tertiary)', width: '10px' }}>{unit}</span>
  </div>
);

// ─── 3D Scene Components ──────────────────────────────────────────────────────

const SandboxRenderer: React.FC<{
  objects: SceneObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateObj: (id: string, updates: Partial<SceneObject>) => void;
  testMode: 'RAYTRACE' | 'FDTD';
  pressureMapRef: React.MutableRefObject<Float32Array | null>;
  isRunning: boolean;
  sliceOffset: number;
  sliceAxis: 'X' | 'Y' | 'Z';
  nx: number;
  viewMode: '2D' | '3D';
  transformMode: TransformMode;
}> = ({ objects, selectedId, onSelect, onUpdateObj, testMode, pressureMapRef, isRunning, sliceOffset, sliceAxis, nx, viewMode, transformMode }) => (
  <>
    <ambientLight intensity={0.35} />
    <directionalLight position={[5, 8, 5]} intensity={1.1} castShadow />
    <Grid infiniteGrid fadeDistance={12} fadeStrength={4}
      sectionColor="#1a1a1a" cellColor="#0d0d0d" sectionSize={1} cellSize={0.2} />
    {objects.map(obj => (
      <SandboxObject
        key={obj.id}
        obj={obj}
        isSelected={selectedId === obj.id}
        onSelect={() => onSelect(obj.id)}
        onUpdate={onUpdateObj}
        transformMode={transformMode}
      />
    ))}
    {viewMode === '2D' ? (
      <OrthographicCamera makeDefault position={[0, sliceOffset + 8, 0]} rotation={[-Math.PI / 2, 0, 0]} zoom={80} />
    ) : (
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.7} />
    )}
    {testMode === 'FDTD' && (
      <FdtdAnalysisPlane
        offset={sliceOffset}
        axis={sliceAxis}
        isRunning={isRunning}
        pressureMapRef={pressureMapRef}
        nx={nx}
      />
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
  transformMode: TransformMode;
}> = ({ obj, isSelected, onSelect, onUpdate, transformMode }) => {
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

  const meshColor = obj.material
    ? (isSelected ? '#99aaff' : '#4455bb')
    : (isSelected ? '#ffffff' : '#555555');

  return (
    <group>
      {isSelected && (
        <TransformControls
          object={meshRef.current || undefined}
          onObjectChange={handleTransform}
          mode={transformMode}
        />
      )}
      <mesh
        ref={meshRef}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        onClick={e => { e.stopPropagation(); onSelect(); }}
        castShadow receiveShadow
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
            color={meshColor} emissive={isSelected ? '#222' : '#000'} emissiveIntensity={0.3}
            opacity={0.88} transparent side={THREE.DoubleSide}
          />
        )}
      </mesh>
    </group>
  );
};

const FdtdAnalysisPlane: React.FC<{
  offset: number; axis: 'X' | 'Y' | 'Z'; isRunning: boolean; pressureMapRef: React.MutableRefObject<Float32Array | null>; nx: number;
}> = ({ offset, axis, isRunning, pressureMapRef, nx }) => {
  const textureRef = useRef<THREE.CanvasTexture>(null);
  const memCanvas = useMemo(() => {
    const c = document.createElement('canvas'); c.width = nx; c.height = nx; return c;
  }, [nx]);

  useFrame(() => {
    if (!isRunning || !pressureMapRef.current || !textureRef.current) return;
    const ctx = memCanvas.getContext('2d'); if (!ctx) return;
    const imgData = ctx.createImageData(nx, nx);
    const buf = pressureMapRef.current;
    
    // Check if buffer size matches nx * nx
    if (buf.length < nx * nx) return;

    for (let i = 0; i < nx * nx; i++) {
      const p = buf[i], val = Math.min(255, Math.max(0, Math.floor(Math.abs(p) * 2000)));
      imgData.data[i*4]=p>0?val:0; 
      imgData.data[i*4+1]=0; 
      imgData.data[i*4+2]=p<0?val:0; 
      imgData.data[i*4+3]=val>5?220:0;
    }
    ctx.putImageData(imgData, 0, 0);
    textureRef.current.needsUpdate = true;
  });

  const rotation: [number, number, number] = 
    axis === 'X' ? [0, Math.PI / 2, 0] : 
    axis === 'Y' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  
  const position: [number, number, number] = 
    axis === 'X' ? [offset, 0, 0] : 
    axis === 'Y' ? [0, offset, 0] : [0, 0, offset];

  return (
    <group position={position} rotation={rotation}>
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
  if (freqs.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid var(--border-color)', fontStyle: 'italic' }}>
      Run "Extract Impedance" to generate Bode plot
    </div>
  );
  const W=320,H=160,P=24, midY=P+(H-2*P)/2, pH=(H-2*P)/2;
  const minF=50, maxF=Math.max(...freqs,2500), lr=Math.log10(maxF)-Math.log10(minF);
  const gx=(f:number)=>P+((Math.log10(f)-Math.log10(minF))/lr)*(W-2*P);
  const lmx=Math.log10(Math.max(...mags)), lmn=Math.log10(Math.max(0.1,Math.min(...mags))), rm=Math.max(0.1,lmx-lmn);
  const gym=(m:number)=>P+(1-(Math.log10(Math.max(0.1,m))-lmn)/rm)*pH;
  const gyp=(p:number)=>P+pH+(1-(p+180)/360)*pH;
  let mp=`M ${gx(freqs[0])},${gym(mags[0])}`, pp=`M ${gx(freqs[0])},${gyp(phases[0])}`;
  for(let i=1;i<freqs.length;i++){mp+=` L ${gx(freqs[i])},${gym(mags[i])}`;pp+=` L ${gx(freqs[i])},${gyp(phases[i])}`;}
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{background:'rgba(0,0,0,0.3)',borderRadius:'6px',border:'1px solid var(--border-color)'}}>
      <line x1={P} y1={midY} x2={W-P} y2={midY} stroke="#1a1a1a" strokeWidth={1} />
      <text x={P} y={P-5} fill="#00e5ff" fontSize="8" fontWeight="600">|Z| MAGNITUDE</text>
      <text x={P} y={midY+12} fill="#cc00ff" fontSize="8" fontWeight="600">PHASE (°)</text>
      <path d={mp} fill="none" stroke="#00e5ff" strokeWidth={1.5} />
      <path d={pp} fill="none" stroke="#cc00ff" strokeWidth={1} strokeDasharray="3 2" />
      {[100,500,1000,2000].map(f=>freqs.some(fr=>fr<=f)?(
        <g key={f}><line x1={gx(f)} y1={H-P} x2={gx(f)} y2={H-P+3} stroke="#222" />
        <text x={gx(f)} y={H-5} fill="#444" fontSize="7" textAnchor="middle">{f>=1000?`${f/1000}k`:f}Hz</text></g>
      ):null)}
    </svg>
  );
};

// ─── Material Browser ─────────────────────────────────────────────────────────
const MaterialBrowser: React.FC<{
  installedMaterials: AcousticMaterial[];
  current: AcousticMaterial | undefined;
  onAssign: (m: AcousticMaterial | undefined) => void;
  onClose: () => void;
}> = ({ installedMaterials, current, onAssign, onClose }) => {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [tab, setTab] = useState<'library' | 'custom'>('library');

  // Merge: library + custom (those not in library)
  const libNames = useMemo(() => new Set(MATERIALS_LIBRARY.map(m => m.name)), []);
  const customMats = useMemo(() => installedMaterials.filter(m => !libNames.has(m.name)), [installedMaterials, libNames]);
  const source = tab === 'library' ? MATERIALS_LIBRARY : customMats;

  const filtered = useMemo(() => source.filter(m => {
    const ok = (!search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.category ?? '').toLowerCase().includes(search.toLowerCase()));
    const okCat = !cat || m.category === cat;
    return ok && okCat;
  }), [source, search, cat]);

  const typeColor: Record<string, string> = {
    broadband: '#888', resonator: '#ffaa00', panel: '#4499ff',
    'bass-trap': '#aa44ff', custom: '#00e5ff',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ height: '44px', padding: '0 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <Layers size={12} color="var(--accent-primary)" />
        <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1 }}>Material Browser</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '8px 12px 0', gap: '4px', flexShrink: 0 }}>
        {(['library', 'custom'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '6px', border: 'none', borderRadius: '5px', cursor: 'pointer',
            background: tab === t ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            color: tab === t ? '#000' : 'var(--text-secondary)',
            fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {t === 'library' ? `Library (${MATERIALS_LIBRARY.length})` : `My Materials (${customMats.length})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', flexShrink: 0, position: 'relative' }}>
        <Search size={10} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search materials…"
          style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '5px', padding: '6px 8px 6px 24px', fontSize: '10px' }}
        />
      </div>

      {/* Category pills */}
      {tab === 'library' && (
        <div style={{ display: 'flex', gap: '4px', padding: '0 12px 8px', overflowX: 'auto', flexShrink: 0 }}>
          <button onClick={() => setCat(null)} style={{ padding: '3px 8px', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer', background: !cat ? 'var(--accent-primary)' : 'transparent', color: !cat ? '#000' : 'var(--text-secondary)', fontSize: '8px', fontWeight: '700', whiteSpace: 'nowrap' }}>All</button>
          {MATERIAL_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(cat === c ? null : c)} style={{ padding: '3px 8px', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer', background: cat === c ? 'var(--accent-primary)' : 'transparent', color: cat === c ? '#000' : 'var(--text-secondary)', fontSize: '8px', fontWeight: '700', whiteSpace: 'nowrap' }}>{c}</button>
          ))}
        </div>
      )}

      {/* Material list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {/* Clear / "No material" option */}
        <div
          onClick={() => onAssign(undefined)}
          style={{
            padding: '8px 10px', marginBottom: '4px', borderRadius: '6px', cursor: 'pointer',
            background: !current ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: !current ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          <div style={{ fontSize: '9px', color: 'var(--text-secondary)', flex: 1, fontStyle: 'italic' }}>None — Rigid / Reflective</div>
          {!current && <span style={{ fontSize: '7px', color: 'var(--accent-primary)', fontWeight: '700' }}>ASSIGNED</span>}
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '9px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            {tab === 'custom' ? 'No custom materials. Design one in Material mode.' : 'No results.'}
          </div>
        )}

        {filtered.map(m => {
          const isActive = current?.name === m.name;
          return (
            <div key={m.name} onClick={() => onAssign(m)} style={{
              padding: '8px 10px', marginBottom: '4px', borderRadius: '6px', cursor: 'pointer',
              background: isActive ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.02)',
              border: isActive ? '1px solid rgba(0,229,255,0.4)' : '1px solid var(--border-color)',
              transition: 'all 0.1s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '600', color: isActive ? '#00e5ff' : 'var(--text-primary)' }}>{m.name}</span>
                  {isActive && <span style={{ fontSize: '7px', color: '#00e5ff', fontWeight: '700' }}>●</span>}
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {m.type && <span style={{ fontSize: '7px', padding: '1px 5px', borderRadius: '3px', background: `${typeColor[m.type] ?? '#888'}18`, color: typeColor[m.type] ?? '#888', fontWeight: '700' }}>{m.type}</span>}
                  <span style={{ fontSize: '8px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>ᾱ={avgAlpha(m)}</span>
                </div>
              </div>
              <AbsBar values={m.absorption} height={20} />
              {(m.thickness || m.flowResistivity) && (
                <div style={{ fontSize: '7px', color: 'var(--text-tertiary)', marginTop: '3px', fontFamily: 'monospace' }}>
                  {m.thickness ? `${(m.thickness * 1000).toFixed(0)}mm` : ''}
                  {m.thickness && m.flowResistivity ? ' · ' : ''}
                  {m.flowResistivity ? `${m.flowResistivity.toLocaleString()} Rayls/m` : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Object Inspector ─────────────────────────────────────────────────────────
const ObjectInspector: React.FC<{
  obj: SceneObject;
  onUpdate: (updates: Partial<SceneObject>) => void;
  installedMaterials: AcousticMaterial[];
  onOpenMaterialBrowser: () => void;
  onRemove: () => void;
}> = ({ obj, onUpdate, onOpenMaterialBrowser, onRemove }) => {
  const isFixed = obj.id === 'sandbox_src' || obj.id === 'sandbox_mic';
  const pos = obj.position;
  const rot = obj.rotation.map(r => parseFloat((r * 180 / Math.PI).toFixed(2))) as [number, number, number];
  const sc  = obj.scale;

  const setPos = (axis: 0 | 1 | 2, v: number) => {
    const p = [...pos] as [number, number, number];
    p[axis] = v;
    onUpdate({ position: p });
  };
  const setRot = (axis: 0 | 1 | 2, deg: number) => {
    const r = [...obj.rotation] as [number, number, number];
    r[axis] = deg * Math.PI / 180;
    onUpdate({ rotation: r });
  };
  const setSc = (axis: 0 | 1 | 2, v: number) => {
    const s = [...sc] as [number, number, number];
    s[axis] = Math.max(0.001, v);
    onUpdate({ scale: s });
  };
  const setScUniform = (v: number) => onUpdate({ scale: [Math.max(0.001, v), Math.max(0.001, v), Math.max(0.001, v)] });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Name */}
      <div>
        <label style={lbl}>Name</label>
        <input
          value={obj.name}
          onChange={e => onUpdate({ name: e.target.value })}
          disabled={isFixed}
          style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '5px', padding: '5px 8px', fontSize: '10px' }}
        />
      </div>

      {/* Position */}
      <div>
        <label style={lbl}>Position</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {(['X','Y','Z'] as const).map((ax, i) => (
            <NumField key={ax} label={ax} value={pos[i]} onChange={v => setPos(i as 0|1|2, v)} step={0.01} min={-10} max={10} />
          ))}
        </div>
      </div>

      {/* Rotation */}
      <div>
        <label style={lbl}>Rotation</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {(['X','Y','Z'] as const).map((ax, i) => (
            <NumField key={ax} label={ax} value={rot[i]} onChange={v => setRot(i as 0|1|2, v)} step={1} min={-180} max={180} unit="°" />
          ))}
        </div>
      </div>

      {/* Shape-specific dimensions */}
      {obj.type === 'mesh' && (
        <div>
          <label style={lbl}>Dimensions</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {obj.shape === 'box' && (<>
              <NumField label="W" value={sc[0]} onChange={v => setSc(0, v)} step={0.01} min={0.001} max={20} />
              <NumField label="H" value={sc[1]} onChange={v => setSc(1, v)} step={0.01} min={0.001} max={20} />
              <NumField label="D" value={sc[2]} onChange={v => setSc(2, v)} step={0.01} min={0.001} max={20} />
            </>)}
            {(obj.shape === 'cylinder' || obj.shape === 'tube') && (<>
              <NumField label="R" value={sc[0]} onChange={v => onUpdate({ scale: [Math.max(0.001, v), sc[1], Math.max(0.001, v)] })} step={0.01} min={0.001} max={10} />
              <NumField label="H" value={sc[1]} onChange={v => onUpdate({ scale: [sc[0], Math.max(0.001, v), sc[2]] })} step={0.01} min={0.001} max={20} />
            </>)}
            {obj.shape === 'trapezoid' && (<>
              <NumField label="W" value={sc[0]} onChange={v => onUpdate({ scale: [Math.max(0.001, v), sc[1], Math.max(0.001, v)] })} step={0.01} min={0.001} max={10} />
              <NumField label="H" value={sc[1]} onChange={v => onUpdate({ scale: [sc[0], Math.max(0.001, v), sc[2]] })} step={0.01} min={0.001} max={20} />
            </>)}
            {obj.shape === 'plane' && (<>
              <NumField label="W" value={sc[0]} onChange={v => onUpdate({ scale: [Math.max(0.001, v), sc[1], sc[2]] })} step={0.01} min={0.001} max={20} />
              <NumField label="H" value={sc[1]} onChange={v => onUpdate({ scale: [sc[0], Math.max(0.001, v), sc[2]] })} step={0.01} min={0.001} max={20} />
            </>)}

            {obj.shape === 'sphere' && (
              <NumField label="R" value={sc[0]} onChange={v => setScUniform(v)} step={0.01} min={0.001} max={10} />
            )}


          </div>
        </div>
      )}

      {/* Material */}
      {obj.type === 'mesh' && (
        <div>
          <label style={lbl}>Surface Material</label>
          <div
            onClick={onOpenMaterialBrowser}
            style={{
              padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border-color)',
              background: obj.material ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.15s',
            }}
          >
            {obj.material ? (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: '600', color: '#00e5ff' }}>{obj.material.name}</span>
                <span style={{ fontSize: '8px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>ᾱ={avgAlpha(obj.material)}</span>
              </div>
              <AbsBar values={obj.material.absorption} height={20} />
            </>) : (
              <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', textAlign: 'center', fontStyle: 'italic' }}>
                Rigid / Reflective — click to assign
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete */}
      {!isFixed && (
        <button onClick={onRemove} className="button" style={{ fontSize: '9px', height: '28px', color: '#ff4444', borderColor: 'rgba(255,68,68,0.3)' }}>
          <Trash2 size={10} /> Remove Object
        </button>
      )}
    </div>
  );
};

// ─── Tiny style helpers ───────────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  fontSize: '8px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px',
  textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700',
};
const divider: React.CSSProperties = { height: '1px', background: 'var(--border-color)', margin: '12px 0' };
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
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');

  // ── Simulation ──
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress]   = useState(0);
  const [simLog, setSimLog]             = useState<string[]>([]);
  const [stepsPerFrame, setStepsPerFrame] = useState(15);
  const [dtScale, setDtScale]           = useState(1.0);
  const [sliceAxis, setSliceAxis]       = useState<'X' | 'Y' | 'Z'>('Y');

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
  const [simAccuracy, setSimAccuracy]   = useState<SimAccuracy>({ gridRes: 200, domainSizeM: 4, fftSize: 8192 });

  // ── Sandbox objects ──
  const [sandboxObjects, setSandboxObjects] = useState<SceneObject[]>([
    { id: 'sandbox_src', name: 'Test Source',      type: 'source',   shape: 'sphere', position: [0, 0.1,  1.5], scale: [0.15, 0.15, 0.15], rotation: [0, 0, 0], sourceType: 'omni', intensity: 100 },
    { id: 'sandbox_mic', name: 'Measurement Mic',  type: 'receiver', shape: 'sphere', position: [0, 0.1, -1.5], scale: [0.10, 0.10, 0.10], rotation: [0, 0, 0] },
    { id: `box_${Date.now()}`, name: 'Test Panel', type: 'mesh',     shape: 'box',    position: [0, 0.025, 0],  scale: [1, 0.05, 0.8],    rotation: [0, 0, 0] },
  ]);
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);
  const [showMaterialBrowser, setShowMaterialBrowser] = useState(false);

  // ── Results ──
  const [frequencyResponse, setFrequencyResponse] = useState<number[]>(Array(24).fill(-24));
  const [absorption, setAbsorption]               = useState<number[]>(Array(24).fill(0));
  const [etcData, setEtcData]                     = useState<{ time: number; energy: number }[]>([]);

  // ── Object mutations ──────────────────────────────────────────────────────────
  const handleUpdateObj = (id: string, updates: Partial<SceneObject>) =>
    setSandboxObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));

  const addPrimitive = (shape: SceneObject['shape']) => {
    const id = `sandbox_${Date.now()}`;
    setSandboxObjects(prev => [...prev, {
      id, name: shape!.charAt(0).toUpperCase() + shape!.slice(1), type: 'mesh', shape,
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

  // ── Wall rasterisation ──────────────────────────────────────────────────────
  const generateWalls = (objects: SceneObject[], offset: number, nx: number, ny: number, size: number, axis: 'X' | 'Y' | 'Z'): Uint8Array => {
    const walls = new Uint8Array(nx * ny);
    const dx = size / nx;

    for (let yi = 0; yi < ny; yi++) {
      for (let xi = 0; xi < nx; xi++) {
        // Calculate 3D pick-point based on 2D grid indices and slice axis
        let px = 0, py = 0, pz = 0;
        const coord1 = -size / 2 + xi * dx;
        const coord2 = -size / 2 + yi * dx;

        if (axis === 'X') { px = offset; py = coord2; pz = coord1; }
        else if (axis === 'Y') { px = coord1; py = offset; pz = coord2; }
        else { px = coord1; py = coord2; pz = offset; }

        for (const obj of objects) {
          if (obj.type !== 'mesh') continue;
          const hx = obj.scale[0] / 2, hy = obj.scale[1] / 2, hz = obj.scale[2] / 2;
          
          // Check if slice plane intersects the object along the normal axis
          if (axis === 'X' && (offset < obj.position[0] - hx || offset > obj.position[0] + hx)) continue;
          if (axis === 'Y' && (offset < obj.position[1] - hy || offset > obj.position[1] + hy)) continue;
          if (axis === 'Z' && (offset < obj.position[2] - hz || offset > obj.position[2] + hz)) continue;

          // Local hit test in the other two axes
          const dx_ = px - obj.position[0], dy_ = py - obj.position[1], dz_ = pz - obj.position[2];
          let hit = false;
          
          if (obj.shape === 'box' || obj.shape === 'plane') {
            hit = Math.abs(dx_) <= hx && Math.abs(dy_) <= hy && Math.abs(dz_) <= hz;
          } else if (obj.shape === 'cylinder' || obj.shape === 'tube') {
            const distSq = dx_ * dx_ + dz_ * dz_;
            const rSq = hx * hx;
            hit = distSq <= rSq && Math.abs(dy_) <= hy;
            if (obj.shape === 'tube') hit = hit && distSq >= rSq * 0.7;
          } else if (obj.shape === 'trapezoid') {
            const yN = (obj.position[1] + hy - py) / (hy * 2);
            const tf = 0.375 + 0.625 * yN;
            hit = Math.abs(dx_) <= hx * tf && Math.abs(dz_) <= hz * tf && Math.abs(dy_) <= hy;
          }

          if (hit) { walls[yi * nx + xi] = 1; break; }
        }
      }
    }
    return walls;
  };

  // ── Stop FDTD ──────────────────────────────────────────────────────────────
  const stopFdtd = useCallback(() => {
    fdtdWorkerRef.current?.postMessage({ type: 'STOP' });
    fdtdWorkerRef.current?.terminate();
    fdtdWorkerRef.current = null;
    setIsSimulating(false);
    addLog('■ Simulation stopped.');
  }, [addLog]);

  // ── Impedance extraction ───────────────────────────────────────────────────
  const runImpedanceExtraction = () => {
    if (isSimulating) stopFdtd();
    setIsSimulating(true); setSimProgress(0); setBodeData(null);
    const { gridRes: nx, domainSizeM, fftSize } = simAccuracy;
    const chunkSize = fftSize === 4096 ? 512 : fftSize === 8192 ? 256 : 128;
    addLog(`▶ Impedance — ${nx}×${nx} · ${domainSizeM}m · ${fftSize}-pt FFT`);
    const walls = generateWalls(sandboxObjects, fdtdPlaneY, nx, nx, domainSizeM, sliceAxis);
    fdtdWorkerRef.current = new Worker(new URL('../engine/fdtd_worker.ts', import.meta.url), { type: 'module' });
    fdtdWorkerRef.current.onmessage = (e) => {
      if (e.data.type === 'PROGRESS') { setSimProgress(e.data.progress); if (e.data.progress%10===0&&e.data.progress>0) addLog(`FDTD  ${String(e.data.progress).padStart(3)}%`); }
      else if (e.data.type === 'LOG') addLog(e.data.message);
      else if (e.data.type === 'IMPEDANCE_RESULTS') {
        setBodeData({ freqs: e.data.freqs, mags: e.data.mags, phases: e.data.phases });
        setIsSimulating(false); addLog(`✓ ${e.data.freqs.length} bins extracted`);
        fdtdWorkerRef.current?.terminate(); fdtdWorkerRef.current = null;
      }
    };
    fdtdWorkerRef.current.postMessage({ type:'INIT', payload:{ nx, ny:nx, walls, sourceX:Math.floor(nx/2), sourceY:Math.floor(nx*0.95), simMode:'impedance', frequency:500, fftSize, chunkSize, domainSizeM, stepsPerFrame, dtScale } });
  };

  // ── Run simulation ─────────────────────────────────────────────────────────
  const runSimulation = () => {
    if (testMode === 'FDTD') {
      if (isSimulating) { stopFdtd(); return; }
      setIsSimulating(true);
      const { gridRes: nx, domainSizeM: size } = simAccuracy;
      addLog(`▶ FDTD wave — ${nx}×${nx} · ${size}m · ${fdtdMode}`);
      const walls = generateWalls(sandboxObjects, fdtdPlaneY, nx, nx, size, sliceAxis);
      const src = sandboxObjects.find(o => o.id === 'sandbox_src');
      let srcX = Math.floor(nx/2), srcY = Math.floor(nx/2);
      if (src) {
        // Calculate source projection onto the 2D grid based on selected axis
        const sP = src.position;
        if (sliceAxis === 'X') { srcX = ((sP[2] + size/2) / size) * nx; srcY = ((sP[1] + size/2) / size) * nx; }
        else if (sliceAxis === 'Y') { srcX = ((sP[0] + size/2) / size) * nx; srcY = ((sP[2] + size/2) / size) * nx; }
        else { srcX = ((sP[0] + size/2) / size) * nx; srcY = ((sP[1] + size/2) / size) * nx; }
        srcX = Math.max(15, Math.min(nx-15, Math.floor(srcX)));
        srcY = Math.max(15, Math.min(nx-15, Math.floor(srcY)));
      }
      fdtdWorkerRef.current = new Worker(new URL('../engine/fdtd_worker.ts', import.meta.url), { type: 'module' });
      fdtdWorkerRef.current.onmessage = (e) => {
        if (e.data.type === 'RENDER') pressureMapRef.current = new Float32Array(e.data.pressureMap);
        else if (e.data.type === 'LOG') addLog(e.data.message);
      };
      fdtdWorkerRef.current.postMessage({ type:'INIT', payload:{ nx, ny:nx, walls, sourceX:srcX, sourceY:srcY, simMode:fdtdMode, frequency:500, fftSize:simAccuracy.fftSize, chunkSize:256, domainSizeM:size, stepsPerFrame, dtScale } });
      return;
    }
    setIsSimulating(true); setSimProgress(0); addLog('▶ Raytracer — 15k rays · 5 bounces');
    const workerObjects = sandboxObjects.map(obj => {
      if (obj.type !== 'mesh') return obj;
      let geom: THREE.BufferGeometry;
      if      (obj.shape==='box')       geom=new THREE.BoxGeometry(1,1,1);
      else if (obj.shape==='plane')     geom=new THREE.PlaneGeometry(1,1);
      else if (obj.shape==='cylinder')  geom=new THREE.CylinderGeometry(0.5,0.5,1,32);
      else if (obj.shape==='tube')      geom=new THREE.CylinderGeometry(0.5,0.5,1,32,1,true);
      else if (obj.shape==='trapezoid') geom=new THREE.CylinderGeometry(0.3,0.8,1,4);
      else                              geom=new THREE.BoxGeometry(1,1,1);
      geom.scale(obj.scale[0],obj.scale[1],obj.scale[2]);
      geom.rotateX(obj.rotation[0]); geom.rotateY(obj.rotation[1]); geom.rotateZ(obj.rotation[2]);
      geom.translate(obj.position[0],obj.position[1],obj.position[2]);
      const pos=geom.attributes.position, idx=geom.index, tris: number[]=[];
      if(idx) for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);tris.push(pos.getX(a),pos.getY(a),pos.getZ(a),pos.getX(b),pos.getY(b),pos.getZ(b),pos.getX(c),pos.getY(c),pos.getZ(c));}
      return { ...obj, triangles: tris };
    });
    const worker = new Worker(new URL('../engine/simulation_worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type==='PROGRESS') { setSimProgress(e.data.progress); if(e.data.progress%25===0) addLog(`Ray  ${String(e.data.progress).padStart(3)}%`); }
      else if (e.data.type==='DONE') {
        const res: SimulationResult = e.data.results.find((r:any)=>r.receiverId==='sandbox_mic');
        if(res?.metrics){
          if(designerMode==='source') setFrequencyResponse(res.metrics.spl.map(v=>isFinite(v)?v:-30));
          else setAbsorption(res.metrics.spl.map(v=>isFinite(v)?Math.max(0,Math.min(1,1-Math.pow(10,v/10)/100)):1));
          if(res.metrics.etc) setEtcData(res.metrics.etc);
        }
        addLog('✓ Raytracing complete'); setIsSimulating(false); worker.terminate();
      } else if (e.data.type==='ERROR') { addLog(`✗ ${e.data.error}`); setIsSimulating(false); worker.terminate(); }
    };
    worker.postMessage({ objects:workerObjects, sources:workerObjects.filter(o=>o.type==='source'), receivers:workerObjects.filter(o=>o.type==='receiver'), environmentSettings:{ rayCount:15000, maxBounces:5, ismOrder:2 } });
  };

  // ── Install ────────────────────────────────────────────────────────────────
  const handleInstall = () => {
    if (designerMode === 'source') {
      installModel({ id:`sbx_${Date.now()}`, name:itemName||'Unnamed', manufacturer:itemCategory||'Custom', type:'Point-Source', directivity:{name:'Omni',horizontal:[],vertical:[],attenuation:[]}, specs:`Sandbox-derived. Grid:${simAccuracy.gridRes}², Domain:${simAccuracy.domainSizeM}m.`, pwl:100, frequencyResponse } as SpeakerModel);
    } else {
      installMaterial({ name:itemName||'Unnamed', category:itemCategory||'Custom', type:'broadband', absorption } as AcousticMaterial);
    }
    addLog(`✓ Installed "${itemName}"`);
    setCurrentView('WORKSPACE');
  };

  const maxEtc = useMemo(() => etcData.length>0 ? Math.max(...etcData.map(e=>e.energy)) : 1, [etcData]);
  const selectedObj = sandboxObjects.find(o => o.id === selectedSandboxId);
  const dx_cm = (simAccuracy.domainSizeM / simAccuracy.gridRes * 100).toFixed(1);

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'calc(100vh - 60px)', background:'var(--bg-primary)', overflow:'hidden' }}>

      {/* ══ LEFT PANEL ═════════════════════════════════════════════════════════ */}
      <div style={{ width:'290px', background:'var(--bg-secondary)', borderRight:'1px solid var(--border-color)', display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>

        {/* Material browser overlay */}
        {showMaterialBrowser && selectedSandboxId && (
          <MaterialBrowser
            installedMaterials={installedMaterials}
            current={selectedObj?.material}
            onAssign={m => { handleUpdateObj(selectedSandboxId, { material: m }); setShowMaterialBrowser(false); }}
            onClose={() => setShowMaterialBrowser(false)}
          />
        )}

        {/* Nav header */}
        <div style={{ height:'44px', padding:'0 14px', borderBottom:'1px solid var(--border-color)', display:'flex', alignItems:'center', gap:'12px', flexShrink:0 }}>
          <button onClick={() => setCurrentView('WORKSPACE')} style={{ background:'transparent', border:'none', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px', fontSize:'10px', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            <ArrowLeft size={11} /> Workspace
          </button>
          <div style={{ width:'1px', height:'16px', background:'var(--border-color)' }} />
          <div style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--accent-primary)' }}>
            <Maximize size={12} />
            <span style={{ fontSize:'10px', fontWeight:'800', letterSpacing:'0.12em' }}>MICRO SANDBOX</span>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column' }}>

          {/* Asset type tabs */}
          <div style={secLabel}><Layers size={9} />Asset Type</div>
          <div style={{ display:'flex', background:'var(--bg-tertiary)', borderRadius:'6px', padding:'3px', marginBottom:'14px' }}>
            {(['source','material'] as const).map(m => (
              <button key={m} onClick={() => setDesignerMode(m)} style={{ flex:1, padding:'7px 0', border:'none', cursor:'pointer', borderRadius:'4px', background:designerMode===m?'var(--accent-primary)':'transparent', color:designerMode===m?'#000':'var(--text-secondary)', fontSize:'9px', fontWeight:'800', textTransform:'uppercase', letterSpacing:'0.08em', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', transition:'all 0.15s' }}>
                {m==='source'?<Zap size={10}/>:<Layers size={10}/>} {m}
              </button>
            ))}
          </div>

          <div style={divider} />

          {/* Engine mode */}
          <div style={secLabel}><Activity size={9} />Simulation Engine</div>
          <div style={{ display:'flex', background:'var(--bg-tertiary)', borderRadius:'6px', padding:'3px', marginBottom:'14px' }}>
            {[{id:'RAYTRACE',l:'Broadband Ray'},{id:'FDTD',l:'Wave FDTD'}].map(({id,l}) => (
              <button key={id} onClick={() => { if(isSimulating) stopFdtd(); setTestMode(id as any); }} style={{ flex:1, padding:'6px 0', border:'none', cursor:'pointer', borderRadius:'4px', background:testMode===id?'#fff':'transparent', color:testMode===id?'#000':'var(--text-secondary)', fontSize:'9px', fontWeight:'700', textTransform:'uppercase', transition:'all 0.15s' }}>{l}</button>
            ))}
          </div>

          {/* FDTD controls */}
          {testMode === 'FDTD' && (
            <div style={{ background:'var(--bg-tertiary)', borderRadius:'8px', padding:'12px', marginBottom:'14px' }}>
              <div style={secLabel}><Maximize size={9} />Analysis Plane</div>
              <div style={{ display:'flex', background:'var(--bg-primary)', borderRadius:'4px', padding:'2px', marginBottom:'10px' }}>
                {(['X','Y','Z'] as const).map(a => (
                  <button key={a} onClick={() => setSliceAxis(a)} style={{ flex:1, padding:'4px 0', border:'none', cursor:'pointer', borderRadius:'3px', background:sliceAxis===a?'var(--accent-primary)':'transparent', color:sliceAxis===a?'#000':'var(--text-tertiary)', fontSize:'9px', fontWeight:'800' }}>{a}</button>
                ))}
              </div>

              <div style={{ ...secLabel, marginBottom:'5px' }}>Plane Offset (M)</div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                <input type="range" min="-3" max="3" step="0.05" value={fdtdPlaneY} onChange={e=>setFdtdPlaneY(parseFloat(e.target.value))} style={{ flex:1, accentColor:'var(--accent-primary)' }} />
                <span style={{ fontSize:'10px', fontWeight:'700', color:'var(--accent-primary)', fontFamily:'monospace', minWidth:'40px' }}>{fdtdPlaneY.toFixed(2)}m</span>
              </div>

              <div style={divider} />

              <div style={secLabel}><Activity size={9} />Simulation Speed</div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                <input type="range" min="1" max="60" step="1" value={stepsPerFrame} onChange={e=>setStepsPerFrame(parseInt(e.target.value))} style={{ flex:1, accentColor:'var(--accent-primary)' }} />
                <span style={{ fontSize:'10px', color:'var(--text-secondary)', minWidth:'45px' }}>{stepsPerFrame}×</span>
              </div>

              <div style={secLabel}><Zap size={9} />Time Resolution</div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                <input type="range" min="0.1" max="1.0" step="0.1" value={dtScale} onChange={e=>setDtScale(parseFloat(e.target.value))} style={{ flex:1, accentColor:'var(--accent-primary)' }} />
                <span style={{ fontSize:'10px', color:'var(--text-secondary)', minWidth:'45px' }}>{dtScale.toFixed(1)} <span style={{ fontSize:'8px', opacity:0.6 }}>CFL</span></span>
              </div>

              <div style={divider} />

              <div style={{ ...secLabel, marginBottom:'5px' }}>Excitation Signal</div>
              <select value={fdtdMode} onChange={e=>setFdtdMode(e.target.value as any)} style={{ width:'100%', background:'var(--bg-secondary)', border:'1px solid var(--border-color)', color:'#fff', borderRadius:'5px', padding:'6px 8px', fontSize:'9px', marginBottom:'12px' }}>
                <option value="impulse">Gaussian Impulse (Broadband)</option>
                <option value="cw">Continuous Wave — 500 Hz Sine</option>
              </select>

              <div style={{ ...secLabel, marginBottom:'5px' }}>Grid Resolution</div>
              <div style={{ display:'flex', gap:'4px', marginBottom:'10px' }}>
                {([100,200,300] as const).map(r=>(
                  <button key={r} onClick={()=>setSimAccuracy(s=>({...s,gridRes:r}))} style={{ flex:1, padding:'5px 0', border:'1px solid var(--border-color)', cursor:'pointer', borderRadius:'4px', background:simAccuracy.gridRes===r?'var(--accent-primary)':'transparent', color:simAccuracy.gridRes===r?'#000':'var(--text-secondary)', fontSize:'9px', fontWeight:'700' }}>
                    {r===100?'Low':r===200?'Med':'High'}
                  </button>
                ))}
              </div>

              <div style={{ ...secLabel, marginBottom:'5px' }}>Analysis Length (Bode)</div>
              <select value={simAccuracy.fftSize} onChange={e=>setSimAccuracy(s=>({...s,fftSize:parseInt(e.target.value) as any}))} style={{ width:'100%', background:'var(--bg-secondary)', border:'1px solid var(--border-color)', color:'#fff', borderRadius:'5px', padding:'6px 8px', fontSize:'9px', marginBottom:'12px' }}>
                <option value={4096}>4 096 pts — Δf ≈ 50 Hz</option>
                <option value={8192}>8 192 pts — Δf ≈ 25 Hz</option>
                <option value={16384}>16 384 pts — Δf ≈ 12 Hz</option>
              </select>

              <button className="button" onClick={runImpedanceExtraction} disabled={isSimulating} style={{ width:'100%', fontSize:'9px', height:'28px', background:'rgba(0,229,255,0.06)', borderColor:'rgba(0,229,255,0.25)', color:'#00e5ff' }}>
                <Activity size={10} /> Extract Impedance (Bode)
              </button>
            </div>
          )}


          <div style={divider} />

          {/* Construction */}
          <div style={secLabel}><PlusSquare size={9} />Sandbox Construction</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'5px', marginBottom:'10px' }}>
            {[{s:'box',l:'Block'},{s:'plane',l:'Plate'},{s:'cylinder',l:'Cylinder'},{s:'tube',l:'Tube'},{s:'trapezoid',l:'Wedge'}].map(({s,l})=>(
              <button key={s} className="button" onClick={()=>addPrimitive(s as SceneObject['shape'])} style={{ fontSize:'9px', padding:'6px 0', flexDirection:'column', gap:'3px' }}>
                <PlusSquare size={10}/>{l}
              </button>
            ))}
          </div>
          <div style={{ background:'var(--bg-tertiary)', borderRadius:'6px', border:'1px solid var(--border-color)', marginBottom:'14px', overflow:'hidden', maxHeight:'130px', overflowY:'auto' }}>
            {sandboxObjects.map(obj => (
              <div key={obj.id} onClick={() => { setSelectedSandboxId(obj.id); setShowMaterialBrowser(false); }} style={{
                padding:'6px 10px', fontSize:'10px', display:'flex', alignItems:'center', gap:'6px',
                background:selectedSandboxId===obj.id?'rgba(255,255,255,0.04)':'transparent',
                borderLeft:selectedSandboxId===obj.id?'2px solid var(--accent-primary)':'2px solid transparent',
                borderBottom:'1px solid var(--border-color)', cursor:'pointer',
                color:obj.id==='sandbox_src'?'#00e5ff':obj.id==='sandbox_mic'?'#cc00ff':(obj.material?'#99aaff':'var(--text-primary)'),
              }}>
                <div style={{ width:'5px', height:'5px', borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{obj.name}</span>
                {obj.material && <span style={{ fontSize:'7px', background:'rgba(0,229,255,0.1)', color:'#00e5ff', padding:'1px 4px', borderRadius:'3px' }}>MAT</span>}
              </div>
            ))}
          </div>

          {/* Object Inspector — shown when an object is selected */}
          {selectedObj && (<>
            <div style={divider} />
            <div style={{ ...secLabel, marginBottom:'10px' }}>
              <Settings size={9} /> Inspector — <span style={{ color:'var(--text-secondary)', fontWeight:'400', textTransform:'none', letterSpacing:0 }}>{selectedObj.name}</span>
            </div>
            <ObjectInspector
              obj={selectedObj}
              onUpdate={updates => handleUpdateObj(selectedSandboxId!, updates)}
              installedMaterials={installedMaterials}
              onOpenMaterialBrowser={() => setShowMaterialBrowser(true)}
              onRemove={removeSelected}
            />
          </>)}

          <div style={divider} />

          {/* Identity */}
          <div style={secLabel}>Identity</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'14px' }}>
            {[{label:'Asset Name',val:itemName,set:setItemName},{label:'Category',val:itemCategory,set:setItemCategory}].map(({label,val,set})=>(
              <div key={label}>
                <label style={lbl}>{label}</label>
                <input value={val} onChange={e=>set(e.target.value)} style={{ width:'100%', background:'var(--bg-tertiary)', border:'1px solid var(--border-color)', color:'#fff', borderRadius:'5px', padding:'7px 8px', fontSize:'11px' }} />
              </div>
            ))}
          </div>

          <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:'7px' }}>
            <button className="button primary" style={{ width:'100%', height:'38px', borderRadius:'20px', gap:'7px', fontSize:'10px' }} onClick={handleInstall}>
              <Save size={13} /> Install to Workspace
            </button>
            <button className="button" style={{ width:'100%', height:'30px', borderRadius:'20px', gap:'6px', fontSize:'9px' }}>
              <Share2 size={11} /> Publish to Marketplace
            </button>
          </div>
        </div>
      </div>

      {/* ══ CENTER — 3D Viewport ════════════════════════════════════════════════ */}
      <div style={{ flex:1, position:'relative', background:'#050508', overflow:'hidden' }}>

        {/* Top-left: Run button + progress */}
        <div style={{ position:'absolute', top:'14px', left:'14px', zIndex:10, display:'flex', gap:'8px', alignItems:'center' }}>
          <button className="button primary" onClick={runSimulation} disabled={isSimulating && testMode!=='FDTD'}
            style={{ gap:'6px', borderRadius:'20px', padding:'7px 18px', fontSize:'10px', fontWeight:'800', background:isSimulating&&testMode==='FDTD'?'#cc2200':'var(--accent-primary)', color:isSimulating&&testMode==='FDTD'?'#fff':'#000' }}>
            <Play size={12} fill="currentColor" />
            {isSimulating?(testMode==='FDTD'?'■  Stop FDTD':`${simProgress.toFixed(0)}%`):(testMode==='FDTD'?'Run FDTD':'Run Acoustic Test')}
          </button>
          {isSimulating && (
            <div style={{ width:'70px', height:'3px', background:'rgba(255,255,255,0.08)', borderRadius:'2px', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${simProgress}%`, background:testMode==='FDTD'?'#00e5ff':'var(--accent-primary)', transition:'width 0.3s' }} />
            </div>
          )}
        </div>

        {/* Transform mode (T / R / S) — shown when an object is selected */}
        {selectedObj && (
          <div style={{ position:'absolute', top:'14px', left:'50%', transform:'translateX(-50%)', zIndex:10, display:'flex', gap:'3px', background:'rgba(0,0,0,0.7)', padding:'3px', borderRadius:'20px', border:'1px solid var(--border-color)', backdropFilter:'blur(8px)' }}>
            {([
              { mode:'translate' as TransformMode, Icon:Move,      label:'T' },
              { mode:'rotate'    as TransformMode, Icon:RotateCw,  label:'R' },
              { mode:'scale'     as TransformMode, Icon:Maximize2, label:'S' },
            ] as const).map(({ mode, Icon, label }) => (
              <button key={mode} onClick={() => setTransformMode(mode)} title={mode}
                style={{ padding:'5px 14px', border:'none', borderRadius:'16px', cursor:'pointer', background:transformMode===mode?'var(--accent-primary)':'transparent', color:transformMode===mode?'#000':'var(--text-secondary)', fontSize:'9px', fontWeight:'800', display:'flex', alignItems:'center', gap:'4px', transition:'all 0.15s' }}>
                <Icon size={10}/>{label}
              </button>
            ))}
          </div>
        )}

        {/* Top-right: mode / accuracy info */}
        <div style={{ position:'absolute', top:'14px', right:'14px', zIndex:10, pointerEvents:'none', textAlign:'right' }}>
          <div style={{ fontSize:'8px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{viewMode==='2D'?'Top-Down Slice':'3D Perspective'} · {testMode}</div>
          <div style={{ fontSize:'8px', color:'var(--text-tertiary)' }}>{simAccuracy.domainSizeM}m · {simAccuracy.gridRes}² · dx={dx_cm}cm</div>
        </div>

        {/* 2D/3D cam toggle */}
        <div style={{ position:'absolute', bottom:'14px', right:'14px', zIndex:10, display:'flex', gap:'4px' }}>
          {(['2D','3D'] as const).map(m => (
            <button key={m} onClick={()=>setViewMode(m)} style={{ padding:'5px 12px', border:'1px solid var(--border-color)', cursor:'pointer', borderRadius:'20px', background:viewMode===m?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.6)', color:viewMode===m?'var(--accent-primary)':'var(--text-secondary)', fontSize:'9px', fontWeight:'700', backdropFilter:'blur(8px)' }}>{m}</button>
          ))}
        </div>

        {/* Viewport content */}

        <Canvas shadows gl={{ antialias:true }} camera={{ position:viewMode==='2D'?[0,8,0]:[2.5,2,3.5], fov:45, up:[0,1,0] }} style={{ width:'100%', height:'100%' }}>
          <color attach="background" args={['#050508']} />
          <SandboxRenderer
            objects={sandboxObjects}
            selectedId={selectedSandboxId}
            onSelect={setSelectedSandboxId}
            onUpdateObj={handleUpdateObj}
            testMode={testMode}
            pressureMapRef={pressureMapRef}
            isRunning={isSimulating && testMode === 'FDTD'}
            sliceOffset={fdtdPlaneY}
            sliceAxis={sliceAxis}
            nx={simAccuracy.gridRes}
            viewMode={viewMode}
            transformMode={transformMode}
          />
        </Canvas>
      </div>

      {/* ══ RIGHT PANEL ════════════════════════════════════════════════════════ */}
      <div style={{ width:'340px', background:'var(--bg-secondary)', borderLeft:'1px solid var(--border-color)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ height:'44px', padding:'0 14px', borderBottom:'1px solid var(--border-color)', display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
          <Activity size={12} color="var(--accent-primary)" />
          <span style={{ fontSize:'10px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.1em' }}>Measurement Data</span>
        </div>

        {/* ETC */}
        <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border-color)', flexShrink:0 }}>
          <div style={secLabel}>Time Domain — ETC</div>
          <div style={{ height:'72px', background:'rgba(0,0,0,0.4)', borderRadius:'5px', border:'1px solid var(--border-color)', position:'relative', overflow:'hidden' }}>
            {etcData.length===0?(
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'9px', color:'var(--text-tertiary)', fontStyle:'italic' }}>Run test to generate ETC</div>
            ):(
              <div style={{ display:'flex', alignItems:'flex-end', height:'100%', padding:'0 2px', gap:'1px' }}>
                {etcData.map((pt,i)=><div key={i} style={{ flex:1, minWidth:'1px', background:'var(--accent-primary)', height:`${(pt.energy/maxEtc)*100}%`, opacity:0.85 }} />)}
              </div>
            )}
          </div>
          {etcData.length>0&&(
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:'2px', fontSize:'7px', color:'var(--text-tertiary)' }}>
              <span>0 ms</span><span>{(etcData[etcData.length-1].time*1000).toFixed(0)} ms</span>
            </div>
          )}
        </div>

        {/* Frequency / Bode */}
        <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border-color)', flexShrink:0 }}>
          {testMode==='RAYTRACE'?(
            <>
              <div style={secLabel}>{designerMode==='source'?'Frequency Response (dB)':'Absorption Coefficient α(f)'}</div>
              <div style={{ pointerEvents:'none' }}>
                {designerMode==='source'?<SpectralEditor data={frequencyResponse} onChange={()=>{}} mode="dB" minDb={-24} maxDb={24} />:<SpectralEditor data={absorption} onChange={()=>{}} mode="coefficient" />}
              </div>
            </>
          ):(
            <>
              <div style={secLabel}>Acoustic Impedance Z(f) — Bode</div>
              <BodePlot freqs={bodeData?.freqs||[]} mags={bodeData?.mags||[]} phases={bodeData?.phases||[]} />
            </>
          )}
        </div>

        {/* Simulation Log */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'12px 14px', overflow:'hidden' }}>
          <div style={{ ...secLabel, marginBottom:'6px' }}>
            <Terminal size={9} /> Simulation Log
            {simLog.length>0&&<button onClick={()=>setSimLog([])} style={{ marginLeft:'auto', background:'transparent', border:'none', color:'var(--text-tertiary)', cursor:'pointer', fontSize:'8px' }}>clear</button>}
          </div>
          <div style={{ flex:1, overflowY:'auto', background:'rgba(0,0,0,0.5)', borderRadius:'5px', border:'1px solid var(--border-color)', padding:'8px', fontFamily:'monospace', fontSize:'9px', lineHeight:'1.65' }}>
            {simLog.length===0?<span style={{ color:'#2a2a2a' }}>// simulation output will appear here</span>:simLog.map((line,i)=><div key={i} style={{ color:i===simLog.length-1?'#00e5ff':'#444' }}>{line}</div>)}
          </div>
        </div>
      </div>

    </div>
  );
};
