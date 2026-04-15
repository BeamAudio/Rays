import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../state/project_state';
import { generatePDFReport } from '../engine/report_generator';
import { Viewport } from './Viewport';
import { BottomPanel } from './BottomPanel';
import {
  ChevronLeft,
  LayoutDashboard,
  Target,
  BarChart3,
  Download,
  Maximize2,
  FileText
} from 'lucide-react';

export const AnalysisStage: React.FC = () => {
  const { results, setCurrentView, selectedId, setSelected, selectedBand, setSelectedBand } = useProjectStore();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleDownloadReport = () => {
    if (currentResult) {
      generatePDFReport(currentResult.metrics, 'Acoustic Consultancy Report');
    }
  };

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
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', color: '#64748B' }}>
            <div style={{ textAlign: 'center' }}>
                <Target size={48} style={{ marginBottom: '20px', opacity: 0.2 }} />
                <h3>No Simulation Data Available</h3>
                <button className="button primary" onClick={() => setCurrentView('WORKSPACE')}>Return to Workspace</button>
            </div>
        </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)', color: '#E2E8F0', overflow: 'hidden' }}>

      {/* ANALYSIS MODE HEADER BAR — distinct from workspace topbar */}
      <div style={{ height: '44px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Mode badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.12)', padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.25)' }}>
            <BarChart3 size={14} color="var(--text-primary)" />
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Analysis</span>
          </div>
          {/* Receiver selector breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748B' }}>
            <span>/</span>
            <span style={{ color: '#E2E8F0', fontWeight: '600' }}>{selectedId}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Band selector */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            {[500, 1000, 2000, 4000].map(f => {
                const idx = [10, 13, 16, 19][[500, 1000, 2000, 4000].indexOf(f)];
                return (
                    <button
                        key={f}
                        onClick={() => setSelectedBand(idx)}
                        style={{
                            padding: '3px 8px', fontSize: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                            background: selectedBand === idx ? 'var(--text-primary)' : 'transparent',
                            color: selectedBand === idx ? 'var(--bg-primary)' : '#64748B', fontWeight: '600',
                            transition: 'all 0.15s'
                        }}
                    >
                        {f < 1000 ? f : `${f/1000}k`}
                    </button>
                );
            })}
            <button
                onClick={() => setSelectedBand(24)}
                style={{
                    padding: '3px 8px', fontSize: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                    background: selectedBand === 24 ? 'var(--text-primary)' : 'transparent',
                    color: selectedBand === 24 ? 'var(--bg-primary)' : '#64748B', fontWeight: '600',
                    transition: 'all 0.15s'
                }}
            >
                BB
            </button>
          </div>

          <button className="button small" onClick={handleDownloadReport} style={{ gap: '6px', borderColor: 'var(--border-color)' }}>
              <FileText size={12} /> Download PDF Report
          </button>

          <button className="button small" style={{ gap: '6px', borderColor: 'var(--border-color)' }}>
              <Download size={12} /> Export
          </button>

          <button className="button small" onClick={() => setCurrentView('WORKSPACE')} title="Back to Workspace" style={{ gap: '6px' }}>
              <ChevronLeft size={12} /> Workspace
          </button>
        </div>
      </div>

      {/* ANALYSIS CONTENT: 3-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Receiver list */}
        {!isSidebarCollapsed && (
          <div style={{ width: '260px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <LayoutDashboard size={14} color="var(--text-primary)" />
                      <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8' }}>Receivers</span>
                      <span style={{ fontSize: '10px', color: '#475569' }}>({receivers.length})</span>
                  </div>
                  <button className="button small" onClick={() => setSidebarCollapsed(true)} title="Collapse">
                      <Maximize2 size={12} rotate={180} />
                  </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                  {receivers.map(r => (
                      <div
                          key={r.receiverId}
                          onClick={() => setSelected(r.receiverId)}
                          style={{
                              padding: '10px 12px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px',
                              background: selectedId === r.receiverId ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                              border: `1px solid ${selectedId === r.receiverId ? 'rgba(255, 255, 255, 0.3)' : 'transparent'}`,
                              transition: 'all 0.15s'
                          }}
                      >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: '#E2E8F0' }}>{r.receiverId}</span>
                              <div style={{
                                  padding: '2px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: '700',
                                  background: r.metrics.sti > 0.6 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                                  color: r.metrics.sti > 0.6 ? '#FFFFFF' : '#AAAAAA'
                              }}>
                                  {r.metrics.sti.toFixed(2)}
                              </div>
                          </div>
                          <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: '#64748B' }}>
                              <span>T30 {r.metrics.t30[13].toFixed(2)}s</span>
                              <span>SPL {r.metrics.spl[13].toFixed(1)}dB</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
        )}

        {/* CENTER: Viewport (top) + Analysis tabs (bottom) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Viewport area — smaller, contextual */}
          <div style={{ height: '35%', position: 'relative', background: '#000', borderBottom: '1px solid var(--border-color)' }}>
              <Viewport />
          </div>

          {/* Analysis data panel */}
          <div style={{ flex: 1, background: 'var(--bg-primary)', position: 'relative', overflow: 'hidden' }}>
              <BottomPanel />
          </div>
        </div>

        {/* RIGHT: Metrics sidebar */}
        <div style={{ width: '260px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>

            {/* Selected Receiver Metrics */}
            <div style={{ padding: '14px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '10px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, fontWeight: '700' }}>
                        Metrics
                    </h3>
                    <div style={{
                        padding: '2px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: '700',
                        background: currentResult.metrics.sti > 0.6 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                        color: currentResult.metrics.sti > 0.6 ? '#FFFFFF' : '#AAAAAA'
                    }}>
                        STI {currentResult.metrics.sti.toFixed(2)}
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#F8FAFC' }}>
                            {currentResult.metrics.t30[selectedBand === 24 ? 13 : selectedBand].toFixed(2)}s
                        </div>
                        <div style={{ fontSize: '8px', color: '#64748B', marginTop: '2px' }}>T30</div>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#F8FAFC' }}>
                            {selectedBand === 24 ? currentResult.metrics.splA?.toFixed(1) : currentResult.metrics.spl[selectedBand].toFixed(1)}dB{selectedBand === 24 ? '(A)' : ''}
                        </div>
                        <div style={{ fontSize: '8px', color: '#64748B', marginTop: '2px' }}>SPL</div>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#F8FAFC' }}>
                            {currentResult.metrics.c80[selectedBand === 24 ? 13 : selectedBand].toFixed(1)}dB
                        </div>
                        <div style={{ fontSize: '8px', color: '#64748B', marginTop: '2px' }}>C80</div>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#F8FAFC' }}>
                            {(currentResult.metrics.d50[selectedBand === 24 ? 13 : selectedBand] * 100).toFixed(0)}%
                        </div>
                        <div style={{ fontSize: '8px', color: '#64748B', marginTop: '2px' }}>D50</div>
                    </div>
                </div>
            </div>

            {/* Global averages */}
            {receivers.length > 1 && (
              <div style={{ padding: '14px', borderBottom: '1px solid var(--border-color)' }}>
                  <h3 style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', fontWeight: '600' }}>
                      Averages ({receivers.length})
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                              {(receivers.reduce((a, b) => a + b.metrics.sti, 0) / receivers.length).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '8px', color: '#475569' }}>STI</div>
                      </div>
                      <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700' }}>
                              {(receivers.reduce((a, b) => a + b.metrics.t30[13], 0) / receivers.length).toFixed(2)}s
                          </div>
                          <div style={{ fontSize: '8px', color: '#475569' }}>T30</div>
                      </div>
                  </div>
              </div>
            )}

            {/* Material legend */}
            <div style={{ padding: '14px', flex: 1 }}>
                <h4 style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', fontWeight: '600' }}>Materials</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                        { name: 'Masonry', color: '#888888' },
                        { name: 'Wood', color: '#8b5a2b' },
                        { name: 'Flooring', color: '#602020' },
                        { name: 'Glass', color: '#aaddff' },
                        { name: 'Acoustic', color: '#22cc88' },
                        { name: 'Fabric', color: '#aa4488' }
                    ].map(m => (
                        <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#94A3B8' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: m.color, flexShrink: 0 }} />
                            <span>{m.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
