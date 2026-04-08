import { Suspense } from 'react';
import { Viewport } from './components/Viewport';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { Topbar } from './components/Topbar';
import { Marketplace } from './components/Marketplace';
import { SpeakerDesigner } from './components/SpeakerDesigner';
import ErrorBoundary from './components/ErrorBoundary';
import { useProjectStore } from './state/project_state';
import './App.css';

function App() {
  const { currentView } = useProjectStore();

  return (
    <div className="app-container">
      <Topbar />
      
      {currentView === 'WORKSPACE' && (
        <div className="main-content" style={{ display: 'flex', width: '100%', height: 'calc(100vh - 60px)', position: 'relative' }}>
          <LeftPanel />
          <div className="viewport-container" style={{ flex: 1, position: 'relative', zIndex: 1 }}>
            <ErrorBoundary>
              <Suspense fallback={<div className="loading">Initializing Beam Audio...</div>}>
                <Viewport />
              </Suspense>
            </ErrorBoundary>
          </div>
          <RightPanel />
          <BottomPanel />
        </div>
      )}

      {currentView === 'MARKETPLACE' && (
        <Marketplace />
      )}

      {currentView === 'DESIGNER' && (
        <SpeakerDesigner />
      )}
    </div>
  );
}

export default App;
