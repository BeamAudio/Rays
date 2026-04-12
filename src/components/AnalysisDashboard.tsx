import React, { useState, useMemo } from 'react';
import { useProjectStore } from '../state/project_state';
import { Viewport } from './Viewport';
import { BottomPanel } from './BottomPanel';
import { BarChart3, Activity, Info, ChevronLeft, ChevronRight, Speaker, Mic, LayoutGrid } from 'lucide-react';

export const AnalysisDashboard: React.FC = () => {
  const { results, setCurrentView, selectedId, setSelected } = useProjectStore();
  
  const receivers = useMemo(() => results.filter(r => !r.receiverId.includes('_')), [results]);
  const currentReceiver = useMemo(() => 
    receivers.find(r => r.receiverId === selectedId) || receivers[0], 
    [receivers, selectedId]
  );

  return (
    <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 60px)', background: '#05070A', overflow: 'hidden' }}>
      
      {/* Sidebar: Navigation & Comparison */}
      <div style={{ width: '300px', borderRight: '1px solid #1A1F26', display: 'flex', flexDirection: 'column', background: '#0A0E14' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #1A1F26', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="button small" onClick={() => setCurrentView('WORKSPACE')}>
                <ChevronLeft size={14}/> Back
            </button>
            <h2 style={{ fontSize: '14px', margin: 0 }}>System Performance</h2>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            <h3 style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', padding: '10px' }}>Receiver Analysis Points</h3>
            {receivers.map(r => (
                <div 
                    key={r.receiverId}
                    onClick={() => setSelected(r.receiverId)}
                    style={{ 
                        padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '5px',
                        background: selectedId === r.receiverId ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                        border: selectedId === r.receiverId ? '1px solid var(--accent-primary)' : '1px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{r.receiverId}</span>
                        <span style={{ fontSize: '10px', color: r.metrics.sti > 0.6 ? '#4ADE80' : '#FF8F00' }}>
                            STI: {r.metrics.sti.toFixed(2)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: '#64748B' }}>
                        <span>SPL: {r.metrics.spl[13].toFixed(1)}dB</span>
                        <span>T30: {r.metrics.t30[13].toFixed(2)}s</span>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* Main Analysis Stage */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* Top: 3D Visualization Mini-Window */}
        <div style={{ height: '40%', position: 'relative', borderBottom: '1px solid #1A1F26' }}>
            <Viewport />
            <div style={{ position: 'absolute', top: '10px', left: '10px', padding: '6px 12px', background: 'rgba(0,0,0,0.8)', borderRadius: '20px', fontSize: '10px', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}>
                SPATIAL PROPAGATION CONTEXT
            </div>
        </div>

        {/* Bottom: The Detailed Dashboard */}
        <div style={{ flex: 1, position: 'relative' }}>
            <BottomPanel />
        </div>

      </div>
    </div>
  );
};
