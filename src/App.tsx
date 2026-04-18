import { Suspense, useEffect, useState } from 'react';
import { Viewport } from './components/Viewport';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { Topbar } from './components/Topbar';
import { Marketplace } from './components/Marketplace';
import { SpeakerDesigner } from './components/SpeakerDesigner';
import { AnalysisStage } from './components/AnalysisStage';
import { Tutorial } from './components/Tutorial';
import { MobilePrompt } from './components/MobilePrompt';
import ErrorBoundary from './components/ErrorBoundary';
import { useProjectStore } from './state/project_state';
import { Maximize2, Play } from 'lucide-react';
import './App.css';

const StartScreen: React.FC<{ onStart: (fullscreen: boolean) => void }> = ({ onStart }) => {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '40px', color: '#fff', textAlign: 'center'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1 style={{ fontSize: '28px', letterSpacing: '8px', margin: 0, fontWeight: '900' }}>
          BEAM <span style={{ color: 'var(--accent-primary)' }}>AUDIO</span> RAYS
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '4px' }}>
          Acoustic Simulation
        </p>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <button
          className="button primary"
          onClick={() => onStart(true)}
          style={{ padding: '16px 32px', borderRadius: '40px', fontSize: '14px', fontWeight: 'bold', gap: '12px' }}
        >
          <Maximize2 size={20} /> ENTER FULLSCREEN
        </button>
        <button
          className="button"
          onClick={() => onStart(false)}
          style={{ padding: '16px 32px', borderRadius: '40px', fontSize: '14px', fontWeight: 'bold', gap: '12px' }}
        >
          <Play size={20} /> START WORKSPACE
        </button>
      </div>
    </div>
  );
};

function App() {
  const { currentView, undo, redo, showAnalysis, selectedId, removeObject, objects } = useProjectStore();
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
      } else if (e.key === 'Delete' && selectedId) {
        removeObject(selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Trigger save project
        const data = JSON.stringify(objects, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'beam_audio_project.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedId, removeObject, objects]);

  const handleStart = (fullscreen: boolean) => {
    if (fullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    setHasStarted(true);
  };

  return (
    <div className="app-container">
      <MobilePrompt />
      {!hasStarted ? (
        <StartScreen onStart={handleStart} />
      ) : (
        <>
          <Tutorial />
          <Topbar />
          
          {currentView === 'WORKSPACE' && (
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: 'calc(100vh - 60px)', position: 'relative' }}>
              {/* Edit Mode Indicator Bar */}
              <div style={{ height: '32px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 229, 255, 0.08)', padding: '3px 10px', borderRadius: '5px', border: '1px solid rgba(0, 229, 255, 0.2)' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Edit</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{objects.length} objects</span>
                {selectedId && (
                  <span style={{ fontSize: '11px', color: 'var(--accent-primary)' }}>
                    / {objects.find(o => o.id === selectedId)?.name || '—'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <LeftPanel />
                <div className="viewport-container" style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                  <ErrorBoundary>
                    <Suspense fallback={<div className="loading">Loading Beam Audio Rays...</div>}>
                      <Viewport />
                    </Suspense>
                  </ErrorBoundary>
                </div>
                <RightPanel />
              </div>
              {showAnalysis && <BottomPanel />}
            </div>
          )}

          {currentView === 'MARKETPLACE' && (
            <Marketplace />
          )}

          {currentView === 'DESIGNER' && (
            <SpeakerDesigner />
          )}

          {currentView === 'ANALYSIS' && (
            <AnalysisStage />
          )}
        </>
      )}
    </div>
  );
}

export default App;
