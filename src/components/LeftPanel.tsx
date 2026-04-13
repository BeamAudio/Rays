import React, { useRef, useState } from 'react';
import { useProjectStore } from '../state/project_state';
import { Trash2, Box, Speaker, Upload, Mic, Layers, Home, Volume2, VolumeX, ShieldCheck, Settings } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { generateShoebox } from '../engine/room_generator';
import { NumericInput } from './NumericInput';

export const LeftPanel: React.FC = () => {
  const {
    objects, selectedId, addObject, removeObject, setSelected,
    updateObject,
    environmentSettings, setEnvironmentSettings
  } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showEnvSettings, setShowEnvSettings] = useState(false);
  const [roomConfig, setRoomConfig] = useState({ width: 10, depth: 8, height: 3 });

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      let triangles: number[] = [];
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
          const positions = geometry.attributes.position.array;
          child.updateMatrixWorld();
          for (let i = 0; i < positions.length; i += 3) {
            const v = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
            v.applyMatrix4(child.matrixWorld);
            triangles.push(v.x, v.y, v.z);
          }
        }
      });
      if (triangles.length > 0) {
        addObject({
          name: file.name,
          type: 'mesh',
          shape: 'mesh',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          triangles: triangles,
          material: { name: 'Imported Mesh', absorption: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1], scattering: 0.1 }
        });
      }
      URL.revokeObjectURL(url);
    });
  };

  const handleCreateRoom = () => {
    const walls = generateShoebox({ ...roomConfig, name: 'Room' });
    walls.forEach(wall => addObject(wall));
    setShowWizard(false);
  };

  const renderCreateSection = () => {
    return (
      <div className="sidebar-section">
        <h3 style={{ marginBottom: '10px' }}>Create</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <button className="button" onClick={() => addObject({ name: 'New Box', type: 'mesh', shape: 'box', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], material: { name: 'generic', absorption: Array(24).fill(0.1), scattering: 0.1, transmission: 0.8 } })}>
            <Box size={14} /> Box
          </button>
          <button className="button" onClick={() => addObject({ name: 'New Sphere', type: 'mesh', shape: 'sphere', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], material: { name: 'generic', absorption: Array(24).fill(0.1), scattering: 0.1, transmission: 0.8 } })}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1.5px solid currentColor' }} /> Sphere
          </button>
          <button className="button" onClick={() => addObject({ name: 'Source', type: 'source', shape: 'sphere', position: [0, 2, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], intensity: 100, sourceType: 'point', directivity: 'omni' })}>
            <Speaker size={14} /> Source
          </button>
          <button className="button" onClick={() => addObject({ name: 'Mic', type: 'receiver', shape: 'sphere', position: [0, 1.5, 2], rotation: [0, 0, 0], scale: [0.2, 0.2, 0.2] })}>
            <Mic size={14} /> Receiver
          </button>
        </div>

        <button className="button" style={{ width: '100%', marginBottom: '8px' }} onClick={() => addObject({ name: 'Map Plane', type: 'plane', shape: 'plane', position: [0, 0.1, 0], rotation: [-Math.PI / 2, 0, 0], scale: [10, 10, 1], resolution: 2 })}>
          <Layers size={14} /> Analysis Plane
        </button>

        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".gltf,.glb" onChange={handleImport} />
        <button className="button" style={{ width: '100%', marginBottom: '10px' }} onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} /> Import CAD (GLTF)
        </button>

        <button className={`button ${showWizard ? 'primary' : ''}`} style={{ width: '100%' }} onClick={() => setShowWizard(!showWizard)}>
          <Home size={14} /> Room Wizard
        </button>

        {showWizard && (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '4px', marginTop: '10px', border: '1px solid var(--accent-primary)' }}>
            <h4 style={{ fontSize: '10px', marginBottom: '8px', color: 'var(--accent-primary)' }}>Shoebox Template</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
              {['width', 'depth', 'height'].map((key) => (
                <NumericInput
                  key={key}
                  label={key.toUpperCase()}
                  value={(roomConfig as any)[key]}
                  onChange={(v) => setRoomConfig({ ...roomConfig, [key]: v })}
                  min={1}
                  max={200}
                />
              ))}
            </div>
            <button className="button primary" style={{ width: '100%' }} onClick={handleCreateRoom}>
              Generate Room
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar left-panel">
      <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Project Hierarchy</span>
        <button className="button" style={{ padding: '2px 6px' }} onClick={() => objects.forEach(o => removeObject(o.id))} title="Clear Scene">
          <Trash2 size={12} />
        </button>
      </div>

      {renderCreateSection()}

      {/* ENVIRONMENT SETTINGS (Collapsible) */}
      <div className="sidebar-section">
        <button
          className="button"
          style={{ width: '100%', justifyContent: 'space-between' }}
          onClick={() => setShowEnvSettings(!showEnvSettings)}
        >
          <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>
            <Settings size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Environment
          </span>
          <span style={{ fontSize: '10px', transform: showEnvSettings ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showEnvSettings && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
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
            <NumericInput
              label="Pressure (kPa)"
              value={environmentSettings.pressure}
              onChange={(v) => setEnvironmentSettings({ pressure: v })}
              step={0.1}
            />
          </div>
        )}
      </div>

      {/* SCENE GRAPH */}
      <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
        <h3>Scene Graph</h3>
        <div className="object-list">
          {objects.map(obj => (
            <div 
              key={obj.id} 
              className={`object-item ${selectedId === obj.id ? 'active' : ''}`}
              onClick={() => setSelected(obj.id)}
              style={{
                padding: '8px 12px',
                marginBottom: '4px',
                background: selectedId === obj.id ? 'rgba(0, 128, 128, 0.2)' : 'transparent',
                border: `1px solid ${selectedId === obj.id ? 'var(--accent-primary)' : 'transparent'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '13px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                {obj.type === 'mesh' ? <Box size={14} /> : obj.type === 'source' ? <Speaker size={14} /> : obj.type === 'plane' ? <Layers size={14} /> : <Mic size={14} />}
                <span style={{ 
                  textDecoration: obj.muted ? 'line-through' : 'none', 
                  opacity: obj.muted ? 0.5 : 1,
                  color: obj.solo ? '#00E5FF' : 'inherit',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{obj.name}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {obj.type === 'source' && (
                  <>
                    <button 
                      className="button" 
                      style={{ padding: '2px', background: 'transparent', border: 'none', minWidth: '20px' }}
                      onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { muted: !obj.muted }); }}
                      title={obj.muted ? "Unmute" : "Mute"}
                    >
                      {obj.muted ? <VolumeX size={14} color="#ff4d4d" /> : <Volume2 size={14} opacity={0.7} />}
                    </button>
                    <button 
                      className="button" 
                      style={{ padding: '2px', background: 'transparent', border: 'none', minWidth: '20px' }}
                      onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { solo: !obj.solo }); }}
                      title={obj.solo ? "De-solo" : "Solo"}
                    >
                      <ShieldCheck size={14} color={obj.solo ? '#00E5FF' : 'currentColor'} opacity={obj.solo ? 1 : 0.4} />
                    </button>
                  </>
                )}
                {selectedId === obj.id && (
                  <Trash2 
                    size={14} 
                    color="#ff4d4d" 
                    onClick={(e) => {
                      e.stopPropagation();
                      removeObject(obj.id);
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
