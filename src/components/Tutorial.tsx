import React from 'react';
import { Play, HelpCircle, LayoutGrid, X } from 'lucide-react';
import { useProjectStore } from '../state/project_state';

export const Tutorial: React.FC = () => {
  const { hasSeenTutorial, dismissTutorial } = useProjectStore();

  if (hasSeenTutorial) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: '12px', padding: '32px', maxWidth: '500px', width: '100%',
        color: 'var(--text-primary)', position: 'relative',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)'
      }}>
        <button 
          onClick={dismissTutorial}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ background: '#FFFFFF', color: '#000', padding: '8px', borderRadius: '8px' }}>
            <HelpCircle size={24} />
          </div>
          <h2 style={{ fontSize: '24px', margin: 0, letterSpacing: '0.05em' }}>Quick Start Guide</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 'bold' }}>1</div>
            <div>
              <strong style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Build Your Room</strong>
              Use the <strong style={{ color: '#fff' }}><LayoutGrid size={12} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}/> Entities</strong> panel on the left to spawn a shoebox room or import a CAD mesh. Then, add acoustic sources and result receivers.
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 'bold' }}>2</div>
            <div>
              <strong style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Configure Materials</strong>
              Click on any wall or object to open the <strong style={{ color: '#fff' }}>Inspector</strong> on the right. Assign standard absorption and scattering coefficients to surfaces.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 'bold' }}>3</div>
            <div>
              <strong style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Run Simulation</strong>
              Click the <strong style={{ color: '#fff' }}><Play size={12} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}/> COMPUTE</strong> button in the top right to trace acoustic rays and generate your ISO 3382 standard results and energy heatmaps.
            </div>
          </div>
        </div>

        <button 
          className="button primary" 
          onClick={dismissTutorial}
          style={{ width: '100%', marginTop: '32px', padding: '12px', fontSize: '13px', justifyContent: 'center' }}
        >
          Got it, let's start
        </button>
      </div>
    </div>
  );
};
