import React, { useRef } from 'react';
import { Play, Save, Loader2, FolderOpen, Layout, Globe, PenTool, RotateCcw, RotateCw, Activity, Camera, BarChart3 } from 'lucide-react';
import { useProjectStore } from '../state/project_state';
import * as THREE from 'three';
import SimulationWorker from '../engine/simulation_worker?worker';
import { auralizer } from '../engine/auralizer';

export const Topbar: React.FC = () => {
  const { 
    objects, setSimulating, setSimulationResults, 
    isSimulating, simulationProgress, environmentSettings,
    currentView, setCurrentView, undo, redo, past, future,
    showAnalysis, toggleAnalysis
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

  return (
    <div className="topbar">
      <div className="logo" style={{ minWidth: '200px', cursor: 'pointer' }} onClick={() => setCurrentView('WORKSPACE')}>
        BEAM <span>RAYS</span>
      </div>
      
      <div className="workspace-tabs" style={{ display: 'flex', gap: '5px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <button 
          className={`button ${currentView === 'WORKSPACE' ? 'primary' : ''}`} 
          style={{ gap: '8px', border: currentView === 'WORKSPACE' ? undefined : 'none' }}
          onClick={() => setCurrentView('WORKSPACE')}
        >
          <Layout size={14} /> Workspace
        </button>
        <button 
          className={`button ${currentView === 'MARKETPLACE' ? 'primary' : ''}`} 
          style={{ gap: '8px', border: currentView === 'MARKETPLACE' ? undefined : 'none' }}
          onClick={() => setCurrentView('MARKETPLACE')}
        >
          <Globe size={14} /> Marketplace
        </button>
        <button 
          className={`button ${currentView === 'DESIGNER' ? 'primary' : ''}`} 
          style={{ gap: '8px', border: currentView === 'DESIGNER' ? undefined : 'none' }}
          onClick={() => setCurrentView('DESIGNER')}
        >
          <PenTool size={14} /> Designer
        </button>
      </div>

      <div className="topbar-actions" style={{ display: 'flex', gap: '8px', minWidth: '240px', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border-color)', paddingRight: '10px', marginRight: '5px' }}>
          <button 
            className="button" 
            onClick={undo} 
            disabled={!past || past.length === 0} 
            title="Undo (Ctrl+Z)"
            style={{ padding: '6px' }}
          >
            <RotateCcw size={16} opacity={(!past || past.length === 0) ? 0.3 : 1} />
          </button>
          <button 
            className="button" 
            onClick={redo} 
            disabled={!future || future.length === 0} 
            title="Redo (Ctrl+Y)"
            style={{ padding: '6px' }}
          >
            <RotateCw size={16} opacity={(!future || future.length === 0) ? 0.3 : 1} />
          </button>
        </div>

        <input type="file" ref={loadRef} style={{ display: 'none' }} accept=".json" onChange={handleLoadProject} />
        <button className="button" onClick={() => loadRef.current?.click()} title="Open Project">
          <FolderOpen size={16} />
        </button>
        <button className="button" onClick={handleSaveProject} title="Save Project">
          <Save size={16} />
        </button>
        <button className="button" onClick={handleCaptureSnapshot} title="Take Snapshot">
          <Camera size={16} />
        </button>
        <button 
          className={`button ${showAnalysis ? 'active-glow' : ''}`} 
          onClick={() => toggleAnalysis()} 
          title="Toggle Analysis Console"
          style={{ 
            background: showAnalysis ? 'rgba(0, 229, 255, 0.15)' : undefined,
            color: showAnalysis ? '#00E5FF' : undefined,
            borderColor: showAnalysis ? '#00E5FF' : undefined
          }}
        >
          <Activity size={16} />
        </button>
        <button 
          className="button primary" 
          onClick={handleRunSimulation}
          disabled={isSimulating}
        >
          {isSimulating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {isSimulating ? `Calculating... ${simulationProgress}%` : 'Run Rays'}
        </button>
      </div>
    </div>
  );
};
