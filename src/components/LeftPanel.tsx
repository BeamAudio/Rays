import React, { useRef, useState } from 'react';
import { useProjectStore } from '../state/project_state';
import { useLibraryStore } from '../state/library_state';
import { Trash2, Box, Speaker, Upload, Mic, Layers, Home, Archive } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { generateShoebox } from '../engine/room_generator';
import { NumericInput } from './NumericInput';

export const LeftPanel: React.FC = () => {
  const { 
    objects, selectedId, addObject, removeObject, setSelected, 
    installedModels 
  } = useProjectStore();
  const { blocks, addBlock, removeBlock } = useLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showWizard, setShowWizard] = useState(false);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3>Create</h3>
          <button className={`button ${showWizard ? 'primary' : ''}`} onClick={() => setShowWizard(!showWizard)}>
            <Home size={14} /> Room Wizard
          </button>
        </div>

        {showWizard ? (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '4px', marginBottom: '15px', border: '1px solid var(--accent-primary)' }}>
            <h4 style={{ fontSize: '11px', marginBottom: '10px', color: 'var(--accent-primary)' }}>Shoebox Template</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '15px' }}>
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
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
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
              <button className="button" style={{ gridColumn: 'span 2' }} onClick={() => addObject({ name: 'Map Plane', type: 'plane', shape: 'plane', position: [0, 0.1, 0], rotation: [-Math.PI / 2, 0, 0], scale: [10, 10, 1], resolution: 2 })}>
                <Layers size={14} /> Analysis Plane
              </button>
            </div>
            
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".gltf,.glb" onChange={handleImport} />
            <button className="button" style={{ width: '100%', marginBottom: '15px' }} onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} /> Import CAD (GLTF)
            </button>

            {/* INSTALLED MODELS LIBRARY */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '15px', marginTop: '15px', marginBottom: '15px' }}>
               <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Equipment Inventory</h4>
               {installedModels.length === 0 ? (
                 <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Visit Marketplace to add models.</div>
               ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {installedModels.map(model => (
                      <div key={model.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,229,255,0.05)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(0,229,255,0.1)' }}>
                         <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{model.name}</span>
                         <button className="button" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => addObject({ 
                           name: model.name, type: 'source', shape: 'sphere', position: [0, 2, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], 
                           intensity: 100, sourceType: 'point', directivity: 'custom', directivityData: model.directivity 
                         })}>Add</button>
                      </div>
                    ))}
                 </div>
               )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '15px', marginTop: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>Library Blocks</h4>
                    <button className="button" style={{ padding: '4px 8px', fontSize: '10px', background: 'var(--accent-primary)', color: 'white', border: 'none' }} onClick={() => {
                      const name = prompt("Enter library block name for the ENTIRE current design:");
                      if (name) {
                        addBlock({ name, description: 'Saved from workspace', objects: [...objects] });
                        alert(`Design "${name}" saved to library.`);
                      }
                    }}>Save Entire Design</button>
                  </div>
                  {blocks.length === 0 ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No blocks saved. Create a design and save it.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {blocks.map(block => (
                        <div key={block.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '4px' }}>
                          <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{block.name}</span>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button className="button" style={{ padding: '4px' }} title="Load Block" onClick={() => {
                              if (confirm(`Load design "${block.name}"? This will add its elements to the current scene.`)) {
                                block.objects.forEach(obj => {
                                   const { id, ...rest } = obj;
                                   addObject(rest);
                                });
                              }
                            }}>
                              <Archive size={12} />
                            </button>
                            <button className="button" style={{ padding: '4px' }} title="Delete Block" onClick={() => removeBlock(block.id)}>
                              <Trash2 size={12} color="#ff4d4d" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {obj.type === 'mesh' ? <Box size={14} /> : obj.type === 'source' ? <Speaker size={14} /> : obj.type === 'plane' ? <Layers size={14} /> : <Mic size={14} />}
                {obj.name}
              </div>
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
          ))}
        </div>
      </div>
    </aside>
  );
};
