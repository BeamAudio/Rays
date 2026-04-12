import React, { useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, TransformControls, PerspectiveCamera, OrthographicCamera, Line, Html } from '@react-three/drei';
import { useProjectStore } from '../state/project_state';
import type { SceneObject } from '../types';
import { calculateRoomModes } from '../engine/numerical';
import type { RoomMode } from '../engine/numerical';

const ObjectRenderer: React.FC<{ obj: SceneObject; isSelected: boolean; onSelect: () => void }> = ({ obj, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { updateObject, results, showHeatmap, selectedBand } = useProjectStore();

  const getMaterialProps = (mat?: { name?: string, category?: string }) => {
    if (!mat) return { color: "#ffffff", opacity: 0.4, roughness: 0.2, metalness: 0.5, transparent: true };
    const category = mat.category?.toLowerCase();
    switch (category) {
      case 'masonry': return { color: "#888888", opacity: 1.0, roughness: 0.9, metalness: 0.1, transparent: false };
      case 'wood': return { color: "#8b5a2b", opacity: 1.0, roughness: 0.7, metalness: 0.1, transparent: false };
      case 'flooring': return { color: "#602020", opacity: 1.0, roughness: 1.0, metalness: 0.0, transparent: false };
      case 'glass': return { color: "#aaddff", opacity: 0.25, roughness: 0.05, metalness: 0.9, transparent: true };
      case 'acoustic treatment': return { color: "#22cc88", opacity: 1.0, roughness: 0.8, metalness: 0.0, transparent: false };
      case 'fabric': return { color: "#aa4488", opacity: 1.0, roughness: 1.0, metalness: 0.0, transparent: false };
      default: return { color: "#ffffff", opacity: 0.4, roughness: 0.2, metalness: 0.5, transparent: true };
    }
  };

  const handleTransform = () => {
    if (meshRef.current) {
      const { position, rotation, scale } = meshRef.current;
      const snap = (v: number) => Math.round(v * 2) / 2;
      const snappedPos: [number, number, number] = [snap(position.x), snap(position.y), snap(position.z)];
      updateObject(obj.id, {
        position: snappedPos,
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [scale.x, scale.y, scale.z],
      });
    }
  };

  const isPlane = obj.shape === 'plane' || obj.type === 'plane';
  const planeResults = isPlane ? results.filter(r => r.receiverId.startsWith(obj.id + '_')) : [];
  const showPlaneResults = isPlane && planeResults.length > 0 && showHeatmap;
  const isReceiver = obj.type === 'receiver';
  const receiverResult = isReceiver ? results.find(r => r.receiverId === obj.id) : null;
  const showHUD = isReceiver && receiverResult;
  const matProps = getMaterialProps(obj.material);

  return (
    <>
      {isSelected && (
        <TransformControls object={meshRef.current || undefined} onObjectChange={handleTransform} />
      )}

      {showPlaneResults ? (
        <group position={obj.position} rotation={obj.rotation} scale={obj.scale}>
          <PlaneHeatmap obj={obj} results={planeResults} selectedBand={selectedBand} />
        </group>
      ) : (
        <mesh
          ref={meshRef}
          position={obj.position}
          rotation={obj.rotation}
          scale={obj.scale}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          {obj.shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : 
           obj.shape === 'sphere' ? <sphereGeometry args={[obj.type === 'source' ? 0.2 : 0.5, 32, 32]} /> : 
           obj.shape === 'plane' ? <planeGeometry args={[1, 1]} /> : 
           obj.shape === 'mesh' && obj.triangles ? (
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array(obj.triangles), 3]} count={obj.triangles.length / 3} />
            </bufferGeometry>
          ) : <boxGeometry args={[1, 1, 1]} />}

          {obj.type === 'mesh' ? (
            <meshStandardMaterial color={isSelected ? "#00e5ff" : matProps.color} transparent={matProps.transparent || isSelected} opacity={isSelected ? 0.8 : matProps.opacity} roughness={matProps.roughness} metalness={matProps.metalness} side={THREE.DoubleSide} depthWrite={!matProps.transparent} />
          ) : obj.type === 'source' ? (
            <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} />
          ) : obj.type === 'plane' ? (
            <meshStandardMaterial color="#008080" transparent opacity={0.3} side={THREE.DoubleSide} wireframe />
          ) : (
            <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={1} />
          )}

          {isReceiver && (
            <group rotation={[Math.PI / 2, 0, 0]}>
              <mesh position={[0, 0, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.08, 0.2, 16]} />
                <meshBasicMaterial color="#ff00ff" />
              </mesh>
            </group>
          )}

          {showHUD && (
            <Html position={[0, 1, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
              <div style={{ background: 'rgba(10,10,10,0.9)', padding: '10px', borderRadius: '8px', border: '1px solid var(--accent-primary)', backdropFilter: 'blur(4px)', color: 'white', fontFamily: 'var(--font-main)', width: '120px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--accent-primary)', marginBottom: '5px', fontWeight: 'bold' }}>{obj.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '11px' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>T30</div><div>{receiverResult!.metrics.t30[selectedBand === 24 ? 13 : selectedBand].toFixed(2)}s</div>
                  <div style={{ color: 'var(--text-secondary)' }}>SPL</div><div>{receiverResult!.metrics.spl[selectedBand === 24 ? 13 : selectedBand].toFixed(1)}dB</div>
                </div>
              </div>
            </Html>
          )}
        </mesh>
      )}
    </>
  );
};

const PlaneHeatmap: React.FC<{ obj: SceneObject; results: any[]; selectedBand: number }> = ({ obj, results, selectedBand }) => {
  const { colors, nx, ny } = React.useMemo(() => {
    if (!results || results.length === 0) return { colors: new Float32Array(0), nx: 0, ny: 0 };
    const res = obj.resolution || 2;
    const nx = Math.ceil((obj.scale?.[0] || 1) * res);
    const ny = Math.ceil((obj.scale?.[1] || 1) * res);
    const expected = (nx + 1) * (ny + 1);
    const colorOutput = new Float32Array(expected * 3);
    const color = new THREE.Color();
    const bandIdx = selectedBand === 24 ? 13 : selectedBand;
    const spls = results.map(r => r.metrics?.spl?.[bandIdx] ?? -Infinity);
    const validSpls = spls.filter(s => isFinite(s) && s > -100);
    const minSpl = validSpls.length > 0 ? Math.min(...validSpls) : 0;
    const maxSpl = validSpls.length > 0 ? Math.max(...validSpls) : 0;
    const range = maxSpl - minSpl || 1;

    for (let i = 0; i < expected; i++) {
      if (i < results.length) {
        const raw = spls[i];
        if (!isFinite(raw) || raw < -100) {
          colorOutput[i * 3] = 0.1; colorOutput[i * 3 + 1] = 0.1; colorOutput[i * 3 + 2] = 0.15;
        } else {
          const t = Math.max(0, Math.min(1, (raw - minSpl) / range));
          color.setHSL(0.7 * (1 - t), 1, 0.5);
          colorOutput[i * 3] = color.r; colorOutput[i * 3 + 1] = color.g; colorOutput[i * 3 + 2] = color.b;
        }
      } else {
        colorOutput[i * 3] = 0.1; colorOutput[i * 3 + 1] = 0.1; colorOutput[i * 3 + 2] = 0.15;
      }
    }
    return { colors: colorOutput, nx, ny };
  }, [results, obj.resolution, obj.scale[0], obj.scale[1], selectedBand]);

  return (
    <mesh>
      <planeGeometry args={[1, 1, nx, ny]}>
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={colors.length / 3} itemSize={3} normalized={false} />
      </planeGeometry>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.65} />
    </mesh>
  );
};

const VolumetricModes: React.FC<{ roomDims: { L: number, H: number, W: number }, center: THREE.Vector3, mode: RoomMode }> = ({ roomDims, center, mode }) => {
  const points = React.useMemo(() => {
    const pts = []; const colors = []; const steps = 25; 
    for (let x = 0; x <= steps; x++) {
      for (let y = 0; y <= steps; y++) {
        for (let z = 0; z <= steps; z++) {
          const nx = x / steps; const ny = y / steps; const nz = z / steps;
          const px = Math.cos(mode.nx * Math.PI * nx);
          const py = Math.cos(mode.ny * Math.PI * ny);
          const pz = Math.cos(mode.nz * Math.PI * nz);
          const pressure = px * py * pz;
          const mag = Math.abs(pressure);
          if (mag > 0.2) {
            pts.push((nx - 0.5) * roomDims.L, (ny - 0.5) * roomDims.H, (nz - 0.5) * roomDims.W);
            colors.push(pressure > 0 ? mag : 0, 0, pressure < 0 ? mag : 0, mag * 0.6);
          }
        }
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    return geom;
  }, [roomDims, mode]);

  return (
    <points position={center}>
      <primitive object={points} attach="geometry" />
      <pointsMaterial size={0.12} vertexColors transparent depthWrite={false} sizeAttenuation />
    </points>
  );
};

const SceneContent: React.FC = () => {
  const { objects, selectedId, setSelected, results, showRays, selectedRayIndex, setSelectedRayIndex, currentTime, showRoomModes, selectedModeIdx } = useProjectStore();
  const selectedResult = results.find(r => r.receiverId === selectedId);
  const displayResult = selectedResult;

  const roomInfo = React.useMemo(() => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const meshes = objects.filter(o => o.type === 'mesh' || o.shape === 'box');
    if (meshes.length === 0) return null;
    meshes.forEach(m => {
        const halfX = m.scale[0] / 2; const halfY = m.scale[1] / 2; const halfZ = m.scale[2] / 2;
        minX = Math.min(minX, m.position[0] - halfX); minY = Math.min(minY, m.position[1] - halfY); minZ = Math.min(minZ, m.position[2] - halfZ);
        maxX = Math.max(maxX, m.position[0] + halfX); maxY = Math.max(maxY, m.position[1] + halfY); maxZ = Math.max(maxZ, m.position[2] + halfZ);
    });
    const dims = { L: Math.max(0.1, maxX - minX), H: Math.max(0.1, maxY - minY), W: Math.max(0.1, maxZ - minZ) };
    return { dims, center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2), modes: calculateRoomModes(dims, 150) };
  }, [objects]);

  const currentMode = roomInfo?.modes[selectedModeIdx] || roomInfo?.modes[0];

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <Grid infiniteGrid fadeDistance={50} fadeStrength={5} sectionColor="#004040" cellColor="#111" sectionSize={5} cellSize={1} />
      {objects.map((obj) => (
        <ObjectRenderer key={obj.id} obj={obj} isSelected={selectedId === obj.id} onSelect={() => setSelected(obj.id)} />
      ))}
      {showRays && displayResult?.rayPaths && (
        <group>
          {displayResult.rayPaths.map((path, i) => {
            const isSelected = selectedRayIndex === i;
            if (selectedRayIndex !== null && !isSelected) return null; 
            if (path.time > currentTime / 1000) return null;
            const currentDist = (currentTime / 1000) * 343.0;
            let accumulatedDist = 0;
            const animatedPts: [number, number, number][] = [path.points[0]];
            for (let j = 1; j < path.points.length; j++) {
              const p1 = new THREE.Vector3(...path.points[j - 1]);
              const p2 = new THREE.Vector3(...path.points[j]);
              const d = p1.distanceTo(p2);
              if (accumulatedDist + d <= currentDist) { animatedPts.push(path.points[j]); accumulatedDist += d; }
              else {
                const rem = currentDist - accumulatedDist;
                if (rem > 0) {
                  const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
                  const interp = p1.clone().addScaledVector(dir, rem);
                  animatedPts.push([interp.x, interp.y, interp.z]);
                }
                break;
              }
            }
            if (animatedPts.length < 2) return null;
            let rayColor = path.order === 0 ? "#ffffff" : path.order === 1 ? "#33cc33" : path.order === 2 ? "#ffaa00" : "#6666ff";
            return <Line key={i} points={animatedPts} color={isSelected ? "#00ffff" : rayColor} lineWidth={isSelected ? 3 : 1} transparent opacity={isSelected ? 1 : 0.4} onClick={(e) => { e.stopPropagation(); setSelectedRayIndex(isSelected ? null : i); }} />;
          })}
        </group>
      )}
      {showRoomModes && roomInfo && currentMode && (
        <VolumetricModes roomDims={roomInfo.dims} center={roomInfo.center} mode={currentMode} />
      )}
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
    </>
  );
};

export const Viewport: React.FC = () => {
  const { 
    showRays, showHeatmap, showRoomModes, setVisualizationOptions, 
    results, selectedBand, viewMode, setViewMode, selectedModeIdx
  } = useProjectStore();

  const splStats = React.useMemo(() => {
    const bandIdx = selectedBand === 24 ? 13 : selectedBand;
    const vals = results.map(r => r.metrics.spl[bandIdx]).filter(v => isFinite(v) && v > -100);
    return vals.length === 0 ? { min: 0, max: 0 } : { min: Math.min(...vals), max: Math.max(...vals) };
  }, [results, selectedBand]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <Canvas shadows gl={{ antialias: true }}>
        {viewMode === '3D' ? <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} /> : <OrthographicCamera makeDefault position={[0, 20, 0]} zoom={40} near={-100} far={100} rotation={[-Math.PI / 2, 0, 0]} />}
        <color attach="background" args={['#0a0a0a']} />
        <SceneContent />
      </Canvas>

      <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '5px', zIndex: 100 }}>
        <button className={`button ${viewMode === '2D' ? 'primary' : ''}`} onClick={() => setViewMode('2D')}>2D Plan</button>
        <button className={`button ${viewMode === '3D' ? 'primary' : ''}`} onClick={() => setViewMode('3D')}>3D View</button>
      </div>

      <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(10,10,10,0.85)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border-color)', backdropFilter: 'blur(5px)', width: '250px', zIndex: 100 }}>
        <h4 style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '10px', textTransform: 'uppercase' }}>Visualization</h4>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Heatmaps</label>
          <input type="checkbox" checked={showHeatmap} onChange={e => setVisualizationOptions({ showHeatmap: e.target.checked })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Room Modes</label>
          <input type="checkbox" checked={showRoomModes} onChange={e => setVisualizationOptions({ showRoomModes: e.target.checked })} />
        </div>
        {showRoomModes && (
            <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Select Mode Index</label>
                <input type="range" min="0" max="20" value={selectedModeIdx} onChange={e => setVisualizationOptions({ selectedModeIdx: parseInt(e.target.value) })} style={{ width: '100%' }} />
            </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Rays</label>
          <input type="checkbox" checked={showRays} onChange={e => setVisualizationOptions({ showRays: e.target.checked })} />
        </div>
        
        {showHeatmap && (
          <div style={{ marginTop: '15px' }}>
            <h5 style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '5px' }}>SPL LEGEND</h5>
            <div style={{ height: '10px', width: '100%', background: 'linear-gradient(to right, hsl(252, 100%, 50%), hsl(180, 100%, 50%), hsl(108, 100%, 50%), hsl(36, 100%, 50%), hsl(0, 100%, 50%))', borderRadius: '2px' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              <span>{splStats.min.toFixed(1)} dB</span>
              <span>{splStats.max.toFixed(1)} dB</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
