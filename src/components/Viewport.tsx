import React, { useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, TransformControls, PerspectiveCamera, OrthographicCamera, Line } from '@react-three/drei';
import { useProjectStore } from '../state/project_state';
import type { SceneObject } from '../types';
import { calculateRoomModes } from '../engine/numerical';
import type { RoomMode } from '../engine/numerical';
import { OCTAVE_1_3_FREQS, OCTAVE_1_1_FREQS, MAP_1_3_TO_1_1 } from '../types';

const ObjectRenderer: React.FC<{ obj: SceneObject; isSelected: boolean; onSelect: () => void; readOnly?: boolean }> = ({ obj, isSelected, onSelect, readOnly }) => {
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
  const matProps = getMaterialProps(obj.material);

  return (
    <>
      {isSelected && !readOnly && (
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
          onClick={(e) => { if (!readOnly) { e.stopPropagation(); onSelect(); } }}
        >
          {obj.shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : 
           obj.shape === 'sphere' ? <sphereGeometry args={[obj.type === 'source' ? 0.1 : 0.3, 32, 32]} /> : 
           obj.shape === 'plane' ? <planeGeometry args={[1, 1]} /> : 
           obj.shape === 'mesh' && obj.triangles ? (
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array(obj.triangles), 3]} count={obj.triangles.length / 3} />
            </bufferGeometry>
          ) : <boxGeometry args={[1, 1, 1]} />}

          {obj.type === 'mesh' ? (
            <meshStandardMaterial color={isSelected ? "#FFFFFF" : matProps.color} transparent={matProps.transparent || isSelected} opacity={isSelected ? 0.8 : matProps.opacity} roughness={matProps.roughness} metalness={matProps.metalness} side={THREE.DoubleSide} depthWrite={!matProps.transparent} />
          ) : obj.type === 'source' ? (
            <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} />
          ) : obj.type === 'plane' ? (
            <meshStandardMaterial color="#008080" transparent opacity={0.3} side={THREE.DoubleSide} wireframe />
          ) : (
            <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={1} />
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
    
    const spls = results.map(r => {
      if (selectedBand === 24) return r.metrics?.splA ?? -Infinity;
      return r.metrics?.spl?.[selectedBand] ?? -Infinity;
    });

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

const SceneContent: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const { objects, selectedId, setSelected, results, showRays, selectedRayIndex, setSelectedRayIndex, currentTime, showRoomModes, selectedModeIdx } = useProjectStore();
  const selectedResult = results.find(r => r.receiverId === selectedId);
  const displayResult = selectedResult;

  const roomInfo = React.useMemo(() => {
    // Only detect walls from the Room Wizard (they have shape === 'plane' and type === 'mesh')
    // Exclude sources, receivers, analysis planes, and standalone boxes/spheres
    const walls = objects.filter(o =>
      o.type === 'mesh' && o.shape === 'plane' && o.name.includes('_')
    );
    if (walls.length === 0) return null;

    // Use the actual wall triangle positions for accurate room bounds
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    walls.forEach(w => {
      if (w.triangles) {
        for (let i = 0; i < w.triangles.length; i += 3) {
          minX = Math.min(minX, w.triangles[i]);
          minY = Math.min(minY, w.triangles[i + 1]);
          minZ = Math.min(minZ, w.triangles[i + 2]);
          maxX = Math.max(maxX, w.triangles[i]);
          maxY = Math.max(maxY, w.triangles[i + 1]);
          maxZ = Math.max(maxZ, w.triangles[i + 2]);
        }
      }
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
        <ObjectRenderer key={obj.id} obj={obj} isSelected={selectedId === obj.id} onSelect={() => setSelected(obj.id)} readOnly={readOnly} />
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
    showHeatmap,
    results, selectedBand, setSelectedBand, viewMode,
    bandMode, toggleBandMode
  } = useProjectStore();

  const [hoveredBand, setHoveredBand] = React.useState<number | null>(null);

  const displayFreqs = bandMode === '1/3' ? OCTAVE_1_3_FREQS : OCTAVE_1_1_FREQS;

  const { avgSplPerBand } = React.useMemo(() => {
    // Average SPL across all receivers for each band in current mode
    const perBand = displayFreqs.map((_, i) => {
      let bandIdx = i;
      if (bandMode === '1') {
        // Map 1/1 index to 1/3 index (center band of the trio)
        bandIdx = MAP_1_3_TO_1_1[i].subIndices[1];
      }
      const bandVals = results.map(r => r.metrics.spl[bandIdx]).filter(v => isFinite(v) && v > -100);
      return bandVals.length === 0 ? -100 : bandVals.reduce((a, b) => a + b, 0) / bandVals.length;
    });

    return { avgSplPerBand: perBand };
  }, [results, selectedBand, bandMode, displayFreqs]);

  const minAll = Math.min(...avgSplPerBand.filter(v => v > -100), 0);
  const maxAll = Math.max(...avgSplPerBand.filter(v => v > -100), 0);
  const range = maxAll - minAll || 1;

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <Canvas shadows gl={{ antialias: true }}>
        {viewMode === '3D' ? <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} /> : <OrthographicCamera makeDefault position={[0, 20, 0]} zoom={40} near={-100} far={100} rotation={[-Math.PI / 2, 0, 0]} />}
        <color attach="background" args={['#0a0a0a']} />
        <SceneContent />
      </Canvas>

      {/* Frequency Spectrum Bar (bottom) */}
      {showHeatmap && results.length > 0 && (
        <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'flex-end', gap: '2px', background: 'rgba(10,10,10,0.9)', padding: '8px 12px 6px', borderRadius: '8px', border: '1px solid var(--border-color)', backdropFilter: 'blur(8px)', zIndex: 100, minWidth: bandMode === '1/3' ? '500px' : '300px' }}>
          {displayFreqs.map((freq, i) => {
            const actualBandIdx = bandMode === '1' ? MAP_1_3_TO_1_1[i].subIndices[1] : i;
            const isActive = selectedBand === actualBandIdx;
            const height = avgSplPerBand[i] > -100 ? Math.max(4, ((avgSplPerBand[i] - minAll) / range) * 30) : 2;
            const label = freq >= 1000 ? `${freq/1000}k` : freq;
            return (
              <div
                key={i}
                onClick={() => setSelectedBand(actualBandIdx)}
                onMouseEnter={() => setHoveredBand(actualBandIdx)}
                onMouseLeave={() => setHoveredBand(null)}
                style={{
                  width: bandMode === '1/3' ? '14px' : '28px',
                  height: `${height}px`,
                  background: isActive ? 'var(--accent-primary)' : 'rgba(0, 229, 255, 0.2)',
                  borderRadius: '2px 2px 0 0',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                {(bandMode === '1' || i % 3 === 0) && (
                  <span style={{ fontSize: '7px', color: '#64748B', marginTop: '4px', transform: 'translateY(2px)' }}>{label}</span>
                )}
                {/* Hover tooltip */}
                {hoveredBand === actualBandIdx && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.95)', padding: '4px 8px', borderRadius: '4px',
                    border: '1px solid var(--border-color)', whiteSpace: 'nowrap', marginBottom: '4px',
                    pointerEvents: 'none', zIndex: 200
                  }}>
                    <div style={{ fontSize: '9px', color: 'var(--accent-primary)', fontWeight: 'bold' }}>{freq} Hz</div>
                    <div style={{ fontSize: '9px', color: '#E2E8F0' }}>Avg SPL: {avgSplPerBand[i].toFixed(1)} dB</div>
                  </div>
                )}
              </div>
            );
          })}
          {/* Broadband button */}
          <div
            onClick={() => setSelectedBand(24)}
            onMouseEnter={() => setHoveredBand(24)}
            onMouseLeave={() => setHoveredBand(null)}
            style={{
              width: '32px', height: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: selectedBand === 24 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px', cursor: 'pointer', marginLeft: '8px', fontSize: '8px', fontWeight: 'bold',
              color: selectedBand === 24 ? '#000' : '#64748B', transition: 'all 0.15s',
              position: 'relative'
            }}
          >
            BB
            <span style={{ fontSize: '6px', opacity: 0.7 }}>{results[0]?.metrics?.splA?.toFixed(0) || '--'} dB(A)</span>
            {hoveredBand === 24 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.95)', padding: '4px 8px', borderRadius: '4px',
                border: '1px solid var(--border-color)', whiteSpace: 'nowrap', marginBottom: '4px',
                pointerEvents: 'none', zIndex: 200
              }}>
                <div style={{ fontSize: '9px', color: 'var(--accent-primary)', fontWeight: 'bold' }}>Broadband (A-Weighted)</div>
                <div style={{ fontSize: '9px', color: '#E2E8F0' }}>Consultancy standard summation</div>
              </div>
            )}
          </div>

          <button 
            onClick={toggleBandMode}
            style={{ 
              marginLeft: '8px', padding: '2px 6px', fontSize: '8px', background: 'transparent', 
              border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {bandMode === '1' ? '8 bands' : '24 bands'}
          </button>
        </div>
      )}
    </div>
  );
};
