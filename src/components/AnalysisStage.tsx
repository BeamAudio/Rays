import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../state/project_state';
import { Viewport } from './Viewport';
import { BottomPanel } from './BottomPanel';
import { 
  ChevronLeft, 
  LayoutDashboard, 
  Target, 
  Clock, 
  BarChart3, 
  Download, 
  Settings2,
  Maximize2
} from 'lucide-react';

export const AnalysisStage: React.FC = () => {
  const { results, setCurrentView, selectedId, setSelected, selectedBand, setSelectedBand } = useProjectStore();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  const receivers = useMemo(() => results.filter(r => !r.receiverId.includes('_')), [results]);

  useEffect(() => {
    if (!selectedId && receivers.length > 0) {
        setSelected(receivers[0].receiverId);
    }
  }, [receivers, selectedId, setSelected]);

  const currentResult = useMemo(() => 
    results.find(r => r.receiverId === selectedId) || receivers[0], 
    [results, receivers, selectedId]
  );

  if (!currentResult) {
    return (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: '#05070A', color: '#64748B' }}>
            <div style={{ textAlign: 'center' }}>
                <Target size={48} style={{ marginBottom: '20px', opacity: 0.2 }} />
                <h3>No Simulation Data Available</h3>
                <button className="button primary" onClick={() => setCurrentView('WORKSPACE')}>Return to Workspace</button>
            </div>
        </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 60px)', background: '#020408', color: '#E2E8F0', overflow: 'hidden' }}>
      
      {/* 1. LEFT NAVIGATION: RECEIVER SELECTOR */}
      {!isSidebarCollapsed && (
        <div style={{ width: '280px', background: '#0A0E14', borderRight: '1px solid #1A1F26', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #1A1F26', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <LayoutDashboard size={16} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 'bold', fontSize: '13px' }}>RECEIVERS</span>
                </div>
                <button className="button small" onClick={() => setCurrentView('WORKSPACE')} title="Back to Workspace">
                    <ChevronLeft size={14} />
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                {receivers.map(r => (
                    <div 
                        key={r.receiverId}
                        onClick={() => setSelected(r.receiverId)}
                        style={{ 
                            padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px',
                            background: selectedId === r.receiverId ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${selectedId === r.receiverId ? 'var(--accent-primary)' : 'transparent'}`,
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600' }}>{r.receiverId}</span>
                            <div style={{ 
                                padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold',
                                background: r.metrics.sti > 0.6 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 146, 60, 0.1)',
                                color: r.metrics.sti > 0.6 ? '#4ADE80' : '#FB923C'
                            }}>
                                STI: {r.metrics.sti.toFixed(2)}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px', color: '#64748B' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={10} /> {r.metrics.t30[13].toFixed(2)}s
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <BarChart3 size={10} /> {r.metrics.spl[13].toFixed(1)}dB
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}

      {/* 2. MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* TOP BAR: CONTEXT & QUICK ACTIONS */}
        <div style={{ height: '50px', background: '#05070A', borderBottom: '1px solid #1A1F26', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button className="button small" onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}>
                    <Maximize2 size={14} rotate={isSidebarCollapsed ? 0 : 180} />
                </button>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                    <span style={{ color: 'white', fontWeight: 'bold' }}>PROJECT ANALYSIS</span> / {selectedId}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ display: 'flex', background: '#0A0E14', padding: '3px', borderRadius: '6px', border: '1px solid #1A1F26' }}>
                    {[500, 1000, 2000, 4000].map(f => {
                        const idx = [10, 13, 16, 19][[500, 1000, 2000, 4000].indexOf(f)];
                        return (
                            <button 
                                key={f}
                                onClick={() => setSelectedBand(idx)}
                                style={{ 
                                    padding: '4px 10px', fontSize: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                    background: selectedBand === idx ? 'var(--accent-primary)' : 'transparent',
                                    color: selectedBand === idx ? 'black' : '#64748B', fontWeight: 'bold'
                                }}
                            >
                                {f < 1000 ? f : `${f/1000}k`}
                            </button>
                        );
                    })}
                    <button 
                        onClick={() => setSelectedBand(24)}
                        style={{ 
                            padding: '4px 10px', fontSize: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                            background: selectedBand === 24 ? 'var(--accent-primary)' : 'transparent',
                            color: selectedBand === 24 ? 'black' : '#64748B', fontWeight: 'bold'
                        }}
                    >
                        BB
                    </button>
                </div>
                <button className="button small" style={{ gap: '6px' }}>
                    <Download size={14} /> Export PDF
                </button>
            </div>
        </div>

        {/* WORKSTAGE: SPLIT VIEW */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            
            {/* 3D VIEWPORT: MINI CONTEXT */}
            <div style={{ height: '35%', position: 'relative', background: '#000', borderBottom: '1px solid #1A1F26' }}>
                <Viewport />
                <div style={{ position: 'absolute', bottom: '15px', right: '15px', padding: '8px 15px', background: 'rgba(0,0,0,0.85)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', pointerEvents: 'none' }}>
                    <div style={{ fontSize: '9px', color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '1px' }}>Spatial Response</div>
                    <div style={{ fontSize: '11px', color: 'white' }}>Showing arrivals for {selectedId}</div>
                </div>
            </div>

            {/* ANALYTICS ENGINE: TABS & DATA */}
            <div style={{ flex: 1, background: '#020408', position: 'relative' }}>
                <BottomPanel />
            </div>

        </div>
      </div>

      {/* 3. RIGHT SIDEBAR: GLOBAL STATS & LEGEND */}
      <div style={{ width: '300px', background: '#05070A', borderLeft: '1px solid #1A1F26', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #1A1F26' }}>
                <h3 style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', marginBottom: '15px', letterSpacing: '1px' }}>Global Performance</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="glass-panel" style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                            {(receivers.reduce((a, b) => a + b.metrics.sti, 0) / receivers.length).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748B' }}>AVG STI</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                            {(receivers.reduce((a, b) => a + b.metrics.t30[13], 0) / receivers.length).toFixed(2)}s
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748B' }}>AVG T30</div>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                <h4 style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', marginBottom: '10px' }}>Analysis Parameters</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '11px' }}>
                        <div style={{ color: '#64748B', marginBottom: '4px' }}>Simulation Resolution</div>
                        <div>25,000 Rays / ISM Order 2</div>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '11px' }}>
                        <div style={{ color: '#64748B', marginBottom: '4px' }}>Atmospheric Loss</div>
                        <div>ISO 9613-1 Applied</div>
                    </div>
                </div>

                <div style={{ marginTop: '30px' }}>
                    <h4 style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', marginBottom: '15px' }}>Material Map</h4>
                    {/* Add a simplified material color legend here */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                            { name: 'Masonry', color: '#888888' },
                            { name: 'Wood', color: '#8b5a2b' },
                            { name: 'Flooring', color: '#602020' },
                            { name: 'Glass', color: '#aaddff' },
                            { name: 'Acoustic', color: '#22cc88' },
                            { name: 'Fabric', color: '#aa4488' }
                        ].map(m => (
                            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: m.color }} />
                                <span>{m.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #1A1F26' }}>
                <button className="button primary" style={{ width: '100%', gap: '10px' }}>
                    <Settings2 size={14} /> Analysis Settings
                </button>
            </div>
      </div>
    </div>
  );
};
