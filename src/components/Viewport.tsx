import React, { useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, TransformControls, PerspectiveCamera, OrthographicCamera, ContactShadows, Line, Html } from '@react-three/drei';
import { useProjectStore } from '../state/project_state';
import type { SceneObject } from '../state/project_state';

const ObjectRenderer: React.FC<{ obj: SceneObject; isSelected: boolean; onSelect: () => void }> = ({ obj, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { updateObject, results, showHeatmap, selectedBand } = useProjectStore();

  const getMaterialProps = (matName?: string) => {
    switch (matName?.toLowerCase()) {
      case 'concrete': return { color: "#888888", opacity: 1.0, roughness: 0.9, metalness: 0.1, transparent: false };
      case 'wood': return { color: "#8b5a2b", opacity: 1.0, roughness: 0.7, metalness: 0.1, transparent: false };
      case 'carpet': return { color: "#602020", opacity: 1.0, roughness: 1.0, metalness: 0.0, transparent: false };
      case 'glass': return { color: "#aaddff", opacity: 0.25, roughness: 0.05, metalness: 0.9, transparent: true };
      case 'generic':
      default: return { color: "#ffffff", opacity: 0.4, roughness: 0.2, metalness: 0.5, transparent: true };
    }
  };

  const handleTransform = () => {
    if (meshRef.current) {
      const { position, rotation, scale } = meshRef.current;
      updateObject(obj.id, {
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [scale.x, scale.y, scale.z],
      });
    }
  };

  const isPlane = obj.shape === 'plane' || obj.type === 'plane' || (obj.type === 'mesh' && obj.scale?.[2] === 1 && Math.abs(obj.scale[0] - 1) > 0.001);
  const planeResults = isPlane ? results.filter(r => r.receiverId.startsWith(obj.id + '_')) : [];
  const showPlaneResults = isPlane && planeResults.length > 0 && showHeatmap;

  const isReceiver = obj.type === 'receiver';
  const receiverResult = isReceiver ? results.find(r => r.receiverId === obj.id) : null;
  const showHUD = isReceiver && receiverResult;

  return (
    <>
      {isSelected && (
        <TransformControls 
          object={meshRef.current || undefined} 
          onObjectChange={handleTransform}
        />
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
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {obj.shape === 'box' ? (
            <boxGeometry args={[1, 1, 1]} />
          ) : obj.shape === 'sphere' ? (
            <sphereGeometry args={[obj.type === 'source' ? 0.2 : 0.5, 32, 32]} />
          ) : obj.shape === 'plane' ? (
            <planeGeometry args={[1, 1]} />
          ) : obj.shape === 'mesh' && obj.triangles ? (
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array(obj.triangles), 3]}
                count={obj.triangles.length / 3}
              />
            </bufferGeometry>
          ) : (
            <boxGeometry args={[1, 1, 1]} />
          )}

          {obj.type === 'mesh' ? (
            <meshStandardMaterial 
              color={isSelected ? "#00e5ff" : getMaterialProps(obj.material?.name).color} 
              transparent={getMaterialProps(obj.material?.name).transparent || isSelected} 
              opacity={isSelected ? 0.8 : getMaterialProps(obj.material?.name).opacity}
              roughness={getMaterialProps(obj.material?.name).roughness}
              metalness={getMaterialProps(obj.material?.name).metalness}
              side={THREE.DoubleSide}
              depthWrite={!getMaterialProps(obj.material?.name).transparent}
            />
          ) : obj.type === 'source' ? (
            <meshStandardMaterial 
              color="#00ffff" 
              emissive="#00ffff" 
              emissiveIntensity={2} 
            />
          ) : obj.type === 'plane' ? (
             <meshStandardMaterial 
                color="#008080" 
                transparent 
                opacity={0.3} 
                side={THREE.DoubleSide}
                wireframe
              />
          ) : (
            <meshStandardMaterial 
              color="#ff00ff" 
              emissive="#ff00ff" 
              emissiveIntensity={1} 
            />
          )}
          
          {obj.type === 'source' && (
            <group rotation={[Math.PI / 2, 0, 0]}>
              <mesh position={[0, 0.4, 1.2]}>
                <cylinderGeometry args={[0.02, 0.02, 1.0, 8]} />
                <meshBasicMaterial color="#00ffff" />
              </mesh>
              <mesh position={[0, 0.4, 1.7]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.1, 0.3, 16]} />
                <meshBasicMaterial color="#00ffff" />
              </mesh>
            </group>
          )}
          
          {showHUD && (
            <Html position={[0, 1, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
              <div style={{ 
                background: 'rgba(10,10,10,0.9)', padding: '10px', borderRadius: '8px', 
                border: '1px solid var(--accent-primary)', backdropFilter: 'blur(4px)',
                color: 'white', fontFamily: 'var(--font-main)', width: '120px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)', textAlign: 'center'
              }}>
                <div style={{ fontSize: '10px', color: 'var(--accent-primary)', marginBottom: '5px', fontWeight: 'bold' }}>{obj.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '11px' }}>
                   <div style={{ color: 'var(--text-secondary)' }}>T30</div><div>{receiverResult!.metrics.t30[selectedBand === 24 ? 13 : selectedBand].toFixed(2)}s</div>
                   <div style={{ color: 'var(--text-secondary)' }}>C80</div><div>{receiverResult!.metrics.c80[selectedBand === 24 ? 13 : selectedBand].toFixed(1)}dB</div>
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
  const res = obj.resolution || 2;
  const nx = Math.ceil(obj.scale[0] * res);
  const ny = Math.ceil(obj.scale[1] * res);
  const expectedVertices = (nx + 1) * (ny + 1);

  const colors = React.useMemo(() => {
    if (results.length === 0) return new Float32Array(0);
    
    const count = Math.min(results.length, expectedVertices);
    const colorOutput = new Float32Array(expectedVertices * 3);
    const color = new THREE.Color();
    const bandIdx = selectedBand === 24 ? 13 : selectedBand; // BB -> 1kHz
    
    const spls = results.map(r => r.metrics?.spl?.[bandIdx] ?? -Infinity);
    const validSpls = spls.filter(s => isFinite(s) && s > -100);
    const minSpl = validSpls.length > 0 ? Math.min(...validSpls) : 0;
    const maxSpl = validSpls.length > 0 ? Math.max(...validSpls) : 0;
    const range = maxSpl - minSpl || 1;

    for (let i = 0; i < expectedVertices; i++) {
      if (i < results.length) {
        const raw = spls[i];
        if (!isFinite(raw) || raw < -100) {
           colorOutput[i*3] = 0.1; colorOutput[i*3+1] = 0.1; colorOutput[i*3+2] = 0.15;
        } else {
          const t = Math.max(0, Math.min(1, (raw - minSpl) / range));
          color.setHSL(0.7 * (1 - t), 1, 0.5); // Blue to Red
          colorOutput[i*3] = color.r; colorOutput[i*3+1] = color.g; colorOutput[i*3+2] = color.b;
        }
      } else {
        colorOutput[i*3] = 0.1; colorOutput[i*3+1] = 0.1; colorOutput[i*3+2] = 0.15;
      }
    }
    return colorOutput;
  }, [results, expectedVertices, selectedBand]);

  if (colors.length === 0 || results.length === 0) {
    // VISUAL DEBUG: If no results mapped, draw a bright RED wireframe plane so we KNOW the ID matcher failed!
    return (
      <mesh>
        <planeGeometry args={[1, 1, 1, 1]} />
        <meshBasicMaterial color="#ff0000" wireframe side={THREE.DoubleSide} />
      </mesh>
    );
  }

  return (
    <mesh>
      <planeGeometry args={[1, 1, nx, ny]}>
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={colors.length / 3}
          itemSize={3}
          normalized={false}
        />
      </planeGeometry>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.65} />
    </mesh>
  );
};

const VolumetricModes: React.FC<{ roomDims: {L: number, H: number, W: number}, center: THREE.Vector3, mode: [number, number, number] }> = ({ roomDims, center, mode }) => {
  const points = React.useMemo(() => {
    const pts = [];
    const colors = [];
    const steps = 30; // High resolution
    for(let x=0; x<=steps; x++) {
      for(let y=0; y<=steps; y++) {
        for(let z=0; z<=steps; z++) {
           const nx = x/steps; const ny = y/steps; const nz = z/steps;
           const px = Math.cos(mode[0] * Math.PI * nx);
           const py = Math.cos(mode[1] * Math.PI * ny);
           const pz = Math.cos(mode[2] * Math.PI * nz);
           const pressure = px*py*pz;
           const mag = Math.abs(pressure);
           if (mag > 0.15) {
             pts.push((nx - 0.5) * roomDims.L, (ny - 0.5) * roomDims.H, (nz - 0.5) * roomDims.W);
             colors.push(pressure > 0 ? mag : 0, 0, pressure < 0 ? mag : 0, mag * 0.7);
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
      <pointsMaterial size={0.15} vertexColors transparent depthWrite={false} sizeAttenuation />
    </points>
  );
};

const SceneContent: React.FC = () => {
  const { objects, selectedId, setSelected, results, showRays, maxVisibleBounces, selectedRayIndex, setSelectedRayIndex, currentTime, showRoomModes, selectedMode } = useProjectStore();
  const selectedResult = results.find(r => r.receiverId === selectedId) || results.find(r => !r.receiverId?.includes('_')) || results[0];

  const roomInfo = React.useMemo(() => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const meshes = objects.filter(o => o.type === 'mesh' || o.shape === 'box');
    if (meshes.length === 0) return null;

    meshes.forEach(m => {
      if (m.triangles && m.triangles.length > 0) {
        for (let i = 0; i < m.triangles.length; i += 3) {
          minX = Math.min(minX, m.triangles[i]);
          minY = Math.min(minY, m.triangles[i+1]);
          minZ = Math.min(minZ, m.triangles[i+2]);
          maxX = Math.max(maxX, m.triangles[i]);
          maxY = Math.max(maxY, m.triangles[i+1]);
          maxZ = Math.max(maxZ, m.triangles[i+2]);
        }
      } else {
        minX = Math.min(minX, m.position[0] - m.scale[0]/2);
        minY = Math.min(minY, m.position[1] - m.scale[1]/2);
        minZ = Math.min(minZ, m.position[2] - m.scale[2]/2);
        maxX = Math.max(maxX, m.position[0] + m.scale[0]/2);
        maxY = Math.max(maxY, m.position[1] + m.scale[1]/2);
        maxZ = Math.max(maxZ, m.position[2] + m.scale[2]/2);
      }
    });
    return {
      dims: { L: Math.max(0.1, maxX - minX), H: Math.max(0.1, maxY - minY), W: Math.max(0.1, maxZ - minZ) },
      center: new THREE.Vector3((minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2)
    };
  }, [objects]);

  return (
    <>
      <ambientLight intensity={results.length > 0 ? 0.2 : 0.5} />
      <pointLight position={[10, 10, 10]} intensity={results.length > 0 ? 0.5 : 1} />
      <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={results.length > 0 ? 0.5 : 1} castShadow />
      
      <Grid 
        infiniteGrid 
        fadeDistance={50} 
        fadeStrength={5} 
        sectionColor={results.length > 0 ? "#004040" : "#008080"} 
        cellColor={results.length > 0 ? "#111" : "#222"} 
        sectionSize={5} 
        cellSize={1} 
      />

      {objects.map((obj) => (
        <ObjectRenderer 
          key={obj.id} 
          obj={obj} 
          isSelected={selectedId === obj.id} 
          onSelect={() => setSelected(obj.id)}
        />
      ))}

      {showRays && selectedResult?.rayPaths && (
        <group>
          {selectedResult.rayPaths.slice(0, 100).map((path, i) => {
            // Highlight selected ray
            const isSelected = selectedRayIndex === i;
            const isMuted = selectedRayIndex !== null && !isSelected;

            if (isMuted) return null; // Hide non-selected rays for clarity when a peak is clicked

            // Trim path points based on maxVisibleBounces (unless explicitly selected)
            const effectiveMax = isSelected ? path.points.length : maxVisibleBounces + 2;
            const maxPts = path.points.slice(0, effectiveMax);
            if (maxPts.length < 2) return null;
            
            // Time Scrubber filtering & animation
            const currentDist = (currentTime / 1000) * 343.0; // in meters
            if (!isFinite(currentDist)) return null;

            let accumulatedDist = 0;
            const animatedPts: [number, number, number][] = [];
            animatedPts.push(maxPts[0]);
            
            for (let j = 1; j < maxPts.length; j++) {
               const p1 = new THREE.Vector3(...maxPts[j-1]);
               const p2 = new THREE.Vector3(...maxPts[j]);
               const segmentDist = p1.distanceTo(p2);
               
               if (accumulatedDist + segmentDist <= currentDist) {
                  animatedPts.push(maxPts[j]);
                  accumulatedDist += segmentDist;
               } else {
                  // Interpolate the final point
                  const remaining = currentDist - accumulatedDist;
                  if (remaining > 0) {
                     const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
                     if (isFinite(dir.x) && isFinite(dir.y) && isFinite(dir.z)) {
                       const interp = p1.clone().addScaledVector(dir, remaining);
                       animatedPts.push([interp.x, interp.y, interp.z]);
                     }
                  }
                  break;
               }
            }
            
            if (animatedPts.length < 2) return null;

            // Match color scale from timeline heatmap
            const ms = path.time * 1000;
            let rayColor = "#00ffff";
            if (ms < 20) rayColor = "#ff4d4d";
            else if (ms < 50) rayColor = "#ffaa00";
            else if (ms < 80) rayColor = "#e6e600";
            else if (ms < 150) rayColor = "#33cc33";
            else if (ms < 300) rayColor = "#3399ff";
            else rayColor = "#6666ff";

            if (isSelected) rayColor = "#ffffff";

            return (
              <Line
                key={i}
                points={animatedPts}
                color={rayColor}
                lineWidth={isSelected ? 3 : 1}
                transparent
                opacity={isSelected ? 1.0 : Math.max(0.2, path.energy * 0.8)}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setSelectedRayIndex(isSelected ? null : i); 
                }}
              />
            )
          })}
        </group>
      )}

      {showRoomModes && roomInfo && (
         <VolumetricModes roomDims={roomInfo.dims} center={roomInfo.center} mode={selectedMode} />
      )}

      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} enableRotate={useProjectStore.getState().viewMode === '3D'} />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2.4} far={4.5} />
    </>
  );
};

export const Viewport: React.FC = () => {
  const { showRays, showHeatmap, showRoomModes, maxVisibleBounces, setVisualizationOptions, results, selectedBand, setSelectedBand, viewMode, setViewMode } = useProjectStore();
  
  const splStats = React.useMemo(() => {
    if (results.length === 0) return { min: 0, max: 0 };
    const bandIdx = selectedBand === 24 ? 13 : selectedBand;
    // Filter out invalid/inf values before math
    const vals = results.map(r => r.metrics.spl[bandIdx]).filter(v => isFinite(v) && v > -100);
    if (vals.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [results, selectedBand]);

  const { min: minSpl, max: maxSpl } = splStats;

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <Canvas shadows gl={{ antialias: true }}>
        {viewMode === '3D' ? (
          <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} />
        ) : (
          <OrthographicCamera makeDefault position={[0, 20, 0]} zoom={40} near={-100} far={100} rotation={[-Math.PI / 2, 0, 0]} />
        )}
        <color attach="background" args={['#0a0a0a']} />
        <fog attach="fog" args={['#0a0a0a', 10, 50]} />
        <SceneContent />
      </Canvas>

      <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '5px', zIndex: 100 }}>
        <button 
          className={`button ${viewMode === '2D' ? 'primary' : ''}`} 
          style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold' }}
          onClick={() => setViewMode('2D')}
        >
          2D Plan
        </button>
        <button 
          className={`button ${viewMode === '3D' ? 'primary' : ''}`} 
          style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold' }}
          onClick={() => setViewMode('3D')}
        >
          3D View
        </button>
      </div>

      {results.length > 0 && (
        <>
          {/* Octave Band Overlays */}
          <div style={{ 
            position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', 
            background: 'rgba(10,10,10,0.85)', padding: '5px', borderRadius: '8px', 
            border: '1px solid var(--border-color)', display: 'flex', gap: '5px', 
            backdropFilter: 'blur(5px)', zIndex: 100, overflowX: 'auto', maxWidth: '80vw'
          }}>
             {[50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000].map((f, i) => (
                <button 
                  key={f} 
                  style={{ 
                    padding: '5px 10px', background: selectedBand === i ? 'var(--accent-primary)' : 'transparent', 
                    color: selectedBand === i ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer',
                    fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap'
                  }}
                  onClick={() => setSelectedBand(i)}
                >
                  {f >= 1000 ? `${f/1000}k` : f}
                </button>
             ))}
             <button 
                style={{ 
                  padding: '5px 10px', background: selectedBand === 24 ? 'var(--accent-primary)' : 'transparent', 
                  color: selectedBand === 24 ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer',
                  fontSize: '9px', fontWeight: 'bold'
                }}
                onClick={() => setSelectedBand(24)}
              >
                BB
              </button>
          </div>

          <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(10,10,10,0.85)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border-color)', backdropFilter: 'blur(5px)', width: '250px', zIndex: 100 }}>
            <h4 style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Visualization Settings</h4>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Show Heatmaps</label>
              <input type="checkbox" checked={showHeatmap} onChange={e => setVisualizationOptions({ showHeatmap: e.target.checked })} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Show Room Modes</label>
              <input type="checkbox" checked={showRoomModes} onChange={e => setVisualizationOptions({ showRoomModes: e.target.checked })} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Show Rays</label>
              <input type="checkbox" checked={showRays} onChange={e => setVisualizationOptions({ showRays: e.target.checked })} />
            </div>

            {showRays && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Bounces (Order): {maxVisibleBounces}</label>
                <input type="range" min="0" max="20" value={maxVisibleBounces} onChange={e => setVisualizationOptions({ maxVisibleBounces: parseInt(e.target.value) })} style={{ width: '100%' }} />
              </div>
            )}

            {showHeatmap && (
              <div style={{ marginTop: '15px' }}>
                <h5 style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '5px' }}>SPL LEGEND ({selectedBand === 24 ? '1kHz BB' : [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000][selectedBand] + ' Hz'})</h5>
                <div style={{ height: '10px', width: '100%', background: 'linear-gradient(to right, hsl(252, 100%, 50%), hsl(180, 100%, 50%), hsl(108, 100%, 50%), hsl(36, 100%, 50%), hsl(0, 100%, 50%))', borderRadius: '2px' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span>{minSpl.toFixed(1)} dB</span>
                  <span>{maxSpl.toFixed(1)} dB</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};