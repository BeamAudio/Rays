import { Suspense, useEffect } from 'react';
import { Viewport } from './components/Viewport';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { Topbar } from './components/Topbar';
import { Marketplace } from './components/Marketplace';
import { SpeakerDesigner } from './components/SpeakerDesigner';
import { AnalysisStage } from './components/AnalysisStage';
import ErrorBoundary from './components/ErrorBoundary';
import { useProjectStore } from './state/project_state';
import './App.css';

function App() {
  const { currentView, undo, redo, showAnalysis, selectedId, removeObject, objects } = useProjectStore();

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

  return (
    <div className="app-container">
      <Topbar />
      
      {currentView === 'WORKSPACE' && (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: 'calc(100vh - 60px)', position: 'relative' }}>
          {/* Edit Mode Indicator Bar */}
          <div style={{ height: '32px', background: '#0A0E14', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', flexShrink: 0 }}>
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
    </div>
  );
}

export default App;
