import React, { useRef } from 'react';
import { 
  Play, Save, Loader2, FolderOpen, Layout, PenTool, 
  Activity, Camera, Box, Layers, Zap
} from 'lucide-react';
import { useProjectStore } from '../state/project_state';
import * as THREE from 'three';
import SimulationWorker from '../engine/simulation_worker?worker';
import { auralizer } from '../engine/auralizer';

export const Topbar: React.FC = () => {
  const {
    objects, setSimulating, setSimulationResults,
    isSimulating, simulationProgress, environmentSettings,
    currentView, setCurrentView, toggleAnalysis,
    viewMode, setViewMode, showRays, showHeatmap, showRoomModes, setVisualizationOptions
  } = useProjectStore();

  const loadRef = useRef<HTMLInputElement>(null);

  const handleSaveProject = () => {
    const data = JSON.stringify(objects, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'beam_audio_project.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedObjects = JSON.parse(event.target?.result as string);
        useProjectStore.setState({ objects: loadedObjects, results: [], selectedId: null });
      } catch (err) {
        alert('Invalid project file.');
      }
    };
    reader.readAsText(file);
  };

  const handleCaptureSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `beam_rays_snapshot_${new Date().getTime()}.png`;
    a.click();
  };

  const handleRunSimulation = () => {
    if (isSimulating) return;

    let sources = objects.filter(o => o.type === 'source');
    
    // Multi-source active logic: if any are soloed, only take those. 
    // Otherwise, take all that are not muted.
    const soloedSources = sources.filter(s => s.solo);
    if (soloedSources.length > 0) {
      sources = soloedSources;
    } else {
      sources = sources.filter(s => !s.muted);
    }

    const receivers = objects.filter(o => o.type === 'receiver');
    const isPlanar = (o: any) => o.shape === 'plane' || o.type === 'plane' || (o.type === 'mesh' && o.scale?.[2] === 1 && Math.abs(o.scale[0] - 1) > 0.001);
    const planes = objects.filter(isPlanar);
    const meshes = objects.filter(o => o.type === 'mesh');

    if (sources.length === 0 || (receivers.length === 0 && planes.length === 0)) {
      alert('Please add at least one source and one receiver/plane.');
      return;
    }

    setSimulating(true);

    const simulationReceivers = [...receivers];
    
    planes.forEach(plane => {
      const res = plane.resolution || 2;
      const width = plane.scale[0];
      const height = plane.scale[1];
      const nx = Math.ceil(width * res);
      const ny = Math.ceil(height * res);

      const dummy = new THREE.Object3D();
      dummy.position.set(plane.position[0], plane.position[1], plane.position[2]);
      dummy.rotation.set(plane.rotation[0], plane.rotation[1], plane.rotation[2]);
      dummy.scale.set(plane.scale[0], plane.scale[1], plane.scale[2]);
      dummy.updateMatrixWorld();

      for (let y = ny; y >= 0; y--) {
        for (let x = 0; x <= nx; x++) {
          const localPos = new THREE.Vector3(
            nx > 0 ? (x / nx) - 0.5 : 0,
            ny > 0 ? (y / ny) - 0.5 : 0,
            0.05
          );
          localPos.applyMatrix4(dummy.matrixWorld);
          simulationReceivers.push({
            id: `${plane.id}_${x}_${y}`,
            name: `Grid Point ${x},${y}`,
            type: 'receiver',
            shape: 'sphere',
            position: [localPos.x, localPos.y, localPos.z],
            rotation: [0, 0, 0],
            scale: [0.1, 0.1, 0.1]
          });
        }
      }
    });

    const worker = new SimulationWorker();
    worker.postMessage({
      objects,
      sources,
      receivers: simulationReceivers,
      meshes,
      environmentSettings
    });

    worker.onmessage = (e) => {
      if (e.data.type === 'PROGRESS') {
        setSimulating(true, e.data.progress);
      } else if (e.data.type === 'DONE') {
        const receiverMap = new Map(simulationReceivers.map(sr => [sr.id, sr]));
        const processedResults = e.data.results.map((r: any) => {
          const receiver = receiverMap.get(r.receiverId);
          return {
            ...r,
            position: receiver?.position
          };
        });
        setSimulationResults(processedResults);
        
        // Update auralizer with the primary receiver's IR
        if (processedResults.length > 0) {
          const primaryResult = processedResults.find((r: any) => !r.receiverId.includes('_')) || processedResults[0];
          if (e.data.rawIRs && e.data.rawIRs[primaryResult.receiverId]) {
            auralizer.updateIR(e.data.rawIRs[primaryResult.receiverId]);
          }
        }
        setCurrentView('ANALYSIS');
        toggleAnalysis(false);
      } else if (e.data.type === 'ERROR') {
        alert('Simulation Error: ' + e.data.error);
        setSimulating(false);
      }
      
      if (e.data.type === 'DONE' || e.data.type === 'ERROR') {
        worker.terminate();
      }
    };
  };

  const navButtonStyle = (active: boolean): React.CSSProperties => ({
    gap: '6px', 
    border: 'none',
    padding: '6px 12px', 
    fontSize: '11px',
    background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
    borderRadius: '4px',
    transition: 'all 0.2s',
    fontWeight: active ? '600' : '400'
  });

  const toggleButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px',
    background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
    border: 'none',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    cursor: 'pointer'
  });

  return (
    <div className="topbar">
      <div className="logo" style={{ minWidth: '160px', cursor: 'pointer', fontSize: '14px', letterSpacing: '1px' }} onClick={() => setCurrentView('WORKSPACE')}>
        BEAM <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>AUDIO</span> RAYS
      </div>

      <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '6px' }}>
        <button
          className="button"
          style={navButtonStyle(currentView === 'WORKSPACE')}
          onClick={() => setCurrentView('WORKSPACE')}
        >
          <Layout size={14} /> Workspace
        </button>
        <button
          className="button"
          style={navButtonStyle(currentView === 'ANALYSIS')}
          onClick={() => setCurrentView('ANALYSIS')}
        >
          <Activity size={14} /> Analysis
        </button>
        <button
          className="button"
          style={navButtonStyle(currentView === 'DESIGNER')}
          onClick={() => setCurrentView('DESIGNER')}
        >
          <PenTool size={14} /> Designer
        </button>
      </div>

      {/* Middle Context Toggles */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '4px 12px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border-color)', paddingRight: '8px' }}>
           <button 
             style={toggleButtonStyle(viewMode === '2D')} 
             onClick={() => setViewMode('2D')}
             title="2D Top View"
           >
             2D
           </button>
           <button 
             style={toggleButtonStyle(viewMode === '3D')} 
             onClick={() => setViewMode('3D')}
             title="3D Perspective"
           >
             3D
           </button>
        </div>

        <button 
          style={toggleButtonStyle(showRays)} 
          onClick={() => setVisualizationOptions({ showRays: !showRays })}
          title="Toggle Ray Paths"
        >
          <Zap size={14} /> <span style={{ display: window.innerWidth > 1000 ? 'inline' : 'none' }}>Rays</span>
        </button>
        
        <button 
          style={toggleButtonStyle(showHeatmap)} 
          onClick={() => setVisualizationOptions({ showHeatmap: !showHeatmap })}
          title="Toggle Acoustic Heatmap"
        >
          <Layers size={14} /> <span style={{ display: window.innerWidth > 1000 ? 'inline' : 'none' }}>Heatmap</span>
        </button>

        <button 
          style={toggleButtonStyle(showRoomModes)} 
          onClick={() => setVisualizationOptions({ showRoomModes: !showRoomModes })}
          title="Toggle Room Modes"
        >
          <Box size={14} /> <span style={{ display: window.innerWidth > 1000 ? 'inline' : 'none' }}>Modes</span>
        </button>
      </div>

      <div className="topbar-actions" style={{ display: 'flex', gap: '4px', minWidth: '200px', justifyContent: 'flex-end', alignItems: 'center' }}>
        {/* File operations group */}
        <div style={{ display: 'flex', gap: '2px', borderRight: '1px solid var(--border-color)', paddingRight: '6px' }}>
          <input type="file" ref={loadRef} style={{ display: 'none' }} accept=".json" onChange={handleLoadProject} />
          <button className="button" onClick={() => loadRef.current?.click()} title="Open Project" style={{ padding: '6px' }}>
            <FolderOpen size={14} />
          </button>
          <button className="button" onClick={handleSaveProject} title="Save Project" style={{ padding: '6px' }}>
            <Save size={14} />
          </button>
          <button className="button" onClick={handleCaptureSnapshot} title="Take Snapshot" style={{ padding: '6px' }}>
            <Camera size={14} />
          </button>
        </div>

        {/* Primary action */}
        <button
          className="button primary"
          onClick={handleRunSimulation}
          disabled={isSimulating}
          style={{ padding: '6px 16px', fontSize: '11px', marginLeft: '4px', borderRadius: '40px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          {isSimulating ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
          {isSimulating ? `${simulationProgress}%` : 'Compute'}
        </button>
      </div>
    </div>
  );
};
