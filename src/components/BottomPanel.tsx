import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../state/project_state';
import { Play, Pause, BarChart2, Activity, Waves, FileText, LayoutTemplate } from 'lucide-react';
import { auralizer } from '../engine/auralizer';
import { DistanceDecayPlot } from './DistanceDecayPlot';
import { calculateDistanceDecayMetrics } from '../engine/metrics';

type Tab = 'summary' | 'signal' | 'distribution' | 'office';

const TabButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
    <button 
        onClick={onClick}
        style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'none', border: 'none', 
            borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: active ? 'var(--accent-primary)' : '#64748B', fontSize: '11px', fontWeight: active ? 'bold' : 'normal',
            cursor: 'pointer', transition: 'all 0.2s'
        }}
    >
        {icon} {label}
    </button>
);

const MetricCard: React.FC<{ label: string, value: string, unit: string, status: string }> = ({ label, value, unit, status }) => (
    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid #1A1F26', padding: '15px', borderRadius: '8px' }}>
        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'var(--font-brand)', color: '#F8FAFC' }}>{value}</span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>{unit}</span>
        </div>
        <div style={{ marginTop: '8px', fontSize: '9px', color: status === 'Excellent' || status === 'Good' ? '#FFFFFF' : 'var(--accent-primary)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
            STATUS: {status}
        </div>
    </div>
);

const getOctaveFreq = (i: number) => {
  const freqs = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
  const f = freqs[i];
  return f >= 1000 ? `${f/1000}k` : f;
};

export const BottomPanel: React.FC = () => {
  const { 
    results, selectedId,
    currentTime, setCurrentTime,
    auralizationSettings, setAuralization,
    selectedBand, setSelectedBand
  } = useProjectStore();
  
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const scrubberRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [etcView, setEtcView] = useState({ x: 0, y: 0, w: 500, h: 90 });

  const selectedResult = results.find(r => r.receiverId === selectedId) || (results.length > 0 ? results[0] : null);

  useEffect(() => {
    if (selectedResult) {
      const totalTimeMs = (selectedResult.metrics.energyGrid?.length || 500);
      setEtcView(v => ({ ...v, w: Math.max(v.w, totalTimeMs) }));
    }
  }, [selectedId, results?.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedResult || !selectedResult.metrics.energyGrid || activeTab !== 'signal') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, width, height);

    const yToPx = (y: number) => {
        const val = Math.max(-90, y);
        return ((val - etcView.y) / etcView.h) * height;
    };

    const bandIdx = selectedBand === 24 ? 13 : selectedBand;
    const grid = selectedResult.metrics.energyGrid;
    const binData = grid.map(bin => bin[bandIdx]);
    const maxVal = Math.max(...binData, 1e-12);

    // Draw Grid
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * width;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    // Draw Individual Arrival Spikes
    if (selectedResult.metrics.arrivals) {
        selectedResult.metrics.arrivals.forEach(arrival => {
            const timeMs = arrival.time * 1000;
            if (timeMs < etcView.x || timeMs > etcView.x + etcView.w) return;
            const px = ((timeMs - etcView.x) / etcView.w) * width;
            const db = 10 * Math.log10(arrival.energy[bandIdx] / maxVal + 1e-12);
            const py = yToPx(-db);
            ctx.beginPath();
            ctx.strokeStyle = arrival.order === 0 ? "#ffffff" : arrival.order === 1 ? "#cccccc" : "#999999";
            ctx.lineWidth = arrival.order <= 1 ? 2 : 1;
            ctx.moveTo(px, height); ctx.lineTo(px, py); ctx.stroke();
        });
    }

    // Draw Integrated Energy Curve
    ctx.beginPath();
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.5;
    binData.forEach((val, i) => {
      const px = (i / etcView.w) * width;
      const db = 10 * Math.log10(val / maxVal + 1e-12);
      const py = yToPx(-db);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }, [selectedResult, etcView, activeTab, selectedBand]);

  const handleExportCSV = () => {
    if (results.length === 0) return;
    const freqs = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
    let csv = "Receiver,Metric," + freqs.map(f => `${f}Hz`).join(",") + "\n";
    results.forEach(res => {
      csv += `${res.receiverId},T30,` + res.metrics.t30.join(",") + "\n";
      csv += `${res.receiverId},SPL,` + res.metrics.spl.join(",") + "\n";
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'acoustic_report.csv'; a.click();
  };

  if (!selectedResult) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Run simulation to see analysis data.</div>;

  const handleScrub = (e: any) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min((e.clientX || e.touches?.[0].clientX) - rect.left, rect.width));
    setCurrentTime((x / rect.width) * etcView.w);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0E14', color: '#E0E6ED' }}>
        <div style={{ display: 'flex', background: '#05070A', padding: '0 10px', borderBottom: '1px solid #1A1F26', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex' }}>
                <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} icon={<BarChart2 size={14}/>} label="Executive Summary" />
                <TabButton active={activeTab === 'signal'} onClick={() => setActiveTab('signal')} icon={<Activity size={14}/>} label="Signal Analysis (ETC)" />
                <TabButton active={activeTab === 'distribution'} onClick={() => setActiveTab('distribution')} icon={<Waves size={14}/>} label="Octave Distribution" />
                <TabButton active={activeTab === 'office'} onClick={() => setActiveTab('office')} icon={<LayoutTemplate size={14}/>} label="ISO 3382-3 (Office)" />
            </div>
            <div style={{ display: 'flex', gap: '10px', paddingRight: '15px' }}>
                <button className="button small primary" onClick={handleExportCSV}><FileText size={12}/> Generate Consultancy Report</button>
            </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                {activeTab === 'summary' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                        <MetricCard label="T30 (Reverb)" value={selectedResult.metrics.t30[13].toFixed(2)} unit="s" status={selectedResult.metrics.t30[13] < 1.5 ? 'Good' : 'Medium'} />
                        <MetricCard label="STI (Intelligibility)" value={selectedResult.metrics.sti.toFixed(2)} unit="" status={selectedResult.metrics.sti > 0.65 ? 'Excellent' : 'Poor'} />
                        <MetricCard label="C80 (Clarity)" value={selectedResult.metrics.c80[13].toFixed(1)} unit="dB" status="Nominal" />
                        <MetricCard label="D50 (Definition)" value={(selectedResult.metrics.d50[13]*100).toFixed(0)} unit="%" status="Active" />
                    </div>
                )}

                {activeTab === 'signal' && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                         <div style={{ flex: 1, position: 'relative', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
                            <div ref={scrubberRef} onMouseDown={handleScrub} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'crosshair' }} />
                            <div style={{ position: 'absolute', top: 0, bottom: 0, width: '1px', background: '#FF3D00', left: `${(currentTime / etcView.w) * 100}%`, pointerEvents: 'none', boxShadow: '0 0 10px #FF3D00' }} />
                         </div>
                    </div>
                )}

                {activeTab === 'distribution' && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                         <div style={{ flex: 1, display: 'flex', gap: '2px', alignItems: 'flex-end', paddingBottom: '30px' }}>
                            {(() => {
                                const validSpls = selectedResult.metrics.spl.filter((s: number) => isFinite(s) && s > -100);
                                if (validSpls.length === 0) return <div style={{ padding: '20px', color: '#64748B' }}>No data</div>;
                                const minS = Math.min(...validSpls);
                                const maxS = Math.max(...validSpls);
                                const range = maxS - minS || 1;
                                return selectedResult.metrics.spl.map((s: number, i: number) => {
                                    const height = isFinite(s) && s > -100 ? Math.max(5, ((s - minS) / range) * 100) : 2;
                                    return (
                                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                                            <div
                                                onClick={() => setSelectedBand(i)}
                                                style={{ width: '100%', height: `${height}%`, background: i === (selectedBand === 24 ? 13 : selectedBand) ? '#00E5FF' : '#1A1F26', borderRadius: '2px 2px 0 0', cursor: 'pointer', transition: 'all 0.15s' }}
                                            />
                                            {i % 3 === 0 && (
                                                <span style={{ position: 'absolute', bottom: '-20px', left: '50%', transform: 'translateX(-50%)', fontSize: '7px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                                    {getOctaveFreq(i)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                         </div>
                    </div>
                )}

                {activeTab === 'office' && (
                    <div style={{ padding: '20px' }}>
                        {(() => {
                            const officeData = results.map(r => ({ distance: r.receiverPos ? Math.sqrt(r.receiverPos[0]**2 + r.receiverPos[2]**2) : 1, sti: r.metrics.sti }));
                            const metrics = calculateDistanceDecayMetrics(officeData.map(d => d.distance), officeData.map(d => d.sti));
                            return (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '20px' }}>
                                        <MetricCard label="rD (Distraction)" value={metrics.rD.toFixed(1)} unit="m" status={metrics.rD < 10 ? 'Poor' : 'Good'} />
                                        <MetricCard label="rP (Privacy)" value={metrics.rP.toFixed(1)} unit="m" status={metrics.rP < 16 ? 'Poor' : 'Good'} />
                                        <MetricCard label="STI_0" value={metrics.STI_0.toFixed(2)} unit="" status="Nominal" />
                                        <MetricCard label="DL2 (Decay)" value={metrics.DL2.toFixed(2)} unit="dB/log10(r)" status="Active" />
                                    </div>
                                    <DistanceDecayPlot data={officeData} rD={metrics.rD} rP={metrics.rP} />
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>

            <div style={{ width: '280px', borderLeft: '1px solid #1A1F26', padding: '20px', background: '#07090D', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B' }}>Auralization Engine</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button onClick={() => {
                        if (auralizationSettings.isPlaying) auralizer.stop(); else auralizer.play();
                        setAuralization({ isPlaying: !auralizationSettings.isPlaying });
                    }} style={{ width: '45px', height: '45px', borderRadius: '50%', border: 'none', background: '#FFFFFF', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        {auralizationSettings.isPlaying ? <Pause size={24} fill="#000" /> : <Play size={24} fill="#000" />}
                    </button>
                    <div><div style={{ fontSize: '12px', fontWeight: 'bold' }}>Convolution</div><div style={{ fontSize: '9px', color: '#FFFFFF' }}>Audio Processing</div></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748B' }}>Dry Source Audio</label>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      style={{ fontSize: '10px', color: '#E0E6ED' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          auralizer.setSampleFromUrl(url);
                          setAuralization({ sampleUrl: url });
                        }
                      }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748B' }}>Wet Mix</label>
                    <input type="range" min="0" max="1" step="0.01" value={auralizationSettings.wet} onChange={(e) => {
                        const wet = parseFloat(e.target.value);
                        setAuralization({ wet });
                        auralizer.setMix(1 - wet, wet);
                    }} style={{ width: '100%', accentColor: '#FFFFFF' }} />
                </div>
            </div>
        </div>
    </div>
  );
};
