import React, { useRef, useState } from 'react';
import { useProjectStore } from '../state/project_state';
import { 
  Trash2, Box, Speaker, Upload, Mic, Layers, Home, 
  Volume2, VolumeX, ShieldCheck, Settings, Plus, LayoutGrid,
  Zap, Wind, Thermometer, Droplets
} from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { generateShoebox } from '../engine/room_generator';
import { NumericInput } from './NumericInput';

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 'bold',
  color: 'var(--text-secondary)',
  marginBottom: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  borderRadius: '8px',
  padding: '12px',
  border: '1px solid rgba(255,255,255,0.05)',
  marginBottom: '16px'
};

const actionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '6px',
  color: '#E2E8F0',
  fontSize: '11px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  marginBottom: '6px',
  textAlign: 'left'
};

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
          material: { name: 'Imported Mesh', absorption: Array(24).fill(0.1), scattering: 0.1 }
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

  return (
    <aside className="sidebar left-panel" style={{ width: '260px', background: '#05070A', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
      <div className="sidebar-header" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LayoutGrid size={16} color="var(--accent-primary)" />
          <span style={{ fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entities</span>
        </div>
        <button 
          className="button" 
          style={{ padding: '4px', background: 'transparent', border: 'none', color: 'var(--text-secondary)' }} 
          onClick={() => { if(confirm('Clear entire scene?')) objects.forEach(o => removeObject(o.id)); }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        
        <div style={sectionHeaderStyle}>
          <Plus size={12} /> Creation
        </div>
        
        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
            <button style={actionButtonStyle} onClick={() => addObject({ name: 'Box', type: 'mesh', shape: 'box', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], material: { name: 'generic', absorption: Array(24).fill(0.1), scattering: 0.1, transmission: 0.8 } })}>
              <Box size={14} /> Box
            </button>
            <button style={actionButtonStyle} onClick={() => addObject({ name: 'Sphere', type: 'mesh', shape: 'sphere', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], material: { name: 'generic', absorption: Array(24).fill(0.1), scattering: 0.1, transmission: 0.8 } })}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1.5px solid currentColor' }} /> Sphere
            </button>
          </div>

          <button style={actionButtonStyle} onClick={() => addObject({ name: 'Source', type: 'source', shape: 'sphere', position: [0, 2, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], intensity: 100, sourceType: 'point', directivity: 'omni' })}>
            <Speaker size={14} color="var(--accent-primary)" /> Acoustic Source
          </button>
          
          <button style={actionButtonStyle} onClick={() => addObject({ name: 'Receiver', type: 'receiver', shape: 'sphere', position: [0, 1.5, 2], rotation: [0, 0, 0], scale: [0.2, 0.2, 0.2] })}>
            <Mic size={14} color="#8B5CF6" /> Result Receiver
          </button>

          <button style={actionButtonStyle} onClick={() => addObject({ name: 'Analysis Plane', type: 'plane', shape: 'plane', position: [0, 0.1, 0], rotation: [-Math.PI / 2, 0, 0], scale: [10, 10, 1], resolution: 2 })}>
            <Layers size={14} color="#F43F5E" /> Analysis Plane
          </button>

          <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".gltf,.glb" onChange={handleImport} />
            <button style={actionButtonStyle} onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} /> Import CAD (GLTF)
            </button>

            <button 
              style={{ ...actionButtonStyle, background: showWizard ? 'rgba(0, 229, 255, 0.1)' : 'rgba(255,255,255,0.03)', borderColor: showWizard ? 'var(--accent-primary)' : undefined }} 
              onClick={() => setShowWizard(!showWizard)}
            >
              <Home size={14} /> Room Wizard
            </button>
            
            {showWizard && (
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', marginTop: '8px', border: '1px solid var(--accent-primary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                  {['width', 'depth', 'height'].map((key) => (
                    <NumericInput
                      key={key}
                      label={key[0].toUpperCase()}
                      value={(roomConfig as any)[key]}
                      onChange={(v) => setRoomConfig({ ...roomConfig, [key]: v })}
                      min={1}
                      max={200}
                    />
                  ))}
                </div>
                <button className="button primary small" style={{ width: '100%' }} onClick={handleCreateRoom}>
                  Construct Shoebox
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ENVIRONMENT SETTINGS */}
        <div style={sectionHeaderStyle}>
          <Settings size={12} /> Conditions
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'var(--text-secondary)' }}>
                  <Thermometer size={10} /> TEMP
                </div>
                <NumericInput
                  value={environmentSettings.temperature}
                  onChange={(v) => setEnvironmentSettings({ temperature: v })}
                  step={0.5}
                />
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'var(--text-secondary)' }}>
                  <Droplets size={10} /> HUMIDITY
                </div>
                <NumericInput
                  value={environmentSettings.humidity}
                  onChange={(v) => setEnvironmentSettings({ humidity: v })}
                  step={1}
                  min={0}
                  max={100}
                />
             </div>
          </div>
          <div style={{ marginTop: '10px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <Wind size={10} /> STATIC PRESSURE (KPA)
             </div>
             <NumericInput
                value={environmentSettings.pressure}
                onChange={(v) => setEnvironmentSettings({ pressure: v })}
                step={0.1}
              />
          </div>
        </div>

        {/* SCENE GRAPH */}
        <div style={sectionHeaderStyle}>
          <Zap size={12} /> Scene Graph
        </div>
        <div className="object-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {objects.map(obj => (
            <div 
              key={obj.id} 
              onClick={() => setSelected(obj.id)}
              style={{
                padding: '6px 10px',
                background: selectedId === obj.id ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${selectedId === obj.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                <span style={{ opacity: 0.5 }}>
                  {obj.type === 'mesh' ? <Box size={12} /> : obj.type === 'source' ? <Speaker size={12} /> : obj.type === 'plane' ? <Layers size={12} /> : <Mic size={12} />}
                </span>
                <span style={{ 
                  fontSize: '11px',
                  textDecoration: obj.muted ? 'line-through' : 'none', 
                  opacity: obj.muted ? 0.4 : 1,
                  color: obj.solo ? 'var(--accent-primary)' : '#E2E8F0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{obj.name}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {obj.type === 'source' && (
                  <>
                    <button 
                      className="button" 
                      style={{ padding: '2px', background: 'transparent', border: 'none' }}
                      onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { muted: !obj.muted }); }}
                    >
                      {obj.muted ? <VolumeX size={12} color="#F43F5E" /> : <Volume2 size={12} opacity={0.4} />}
                    </button>
                    <button 
                      className="button" 
                      style={{ padding: '2px', background: 'transparent', border: 'none' }}
                      onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { solo: !obj.solo }); }}
                    >
                      <ShieldCheck size={12} color={obj.solo ? 'var(--accent-primary)' : 'currentColor'} opacity={obj.solo ? 1 : 0.2} />
                    </button>
                  </>
                )}
                {selectedId === obj.id && (
                  <button 
                    style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); removeObject(obj.id); }}
                  >
                    <Trash2 size={12} color="#F43F5E" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
