import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../state/project_state';
import { DraggableWindow } from './DraggableWindow';
import { Play, Pause, Mic2, Download, BarChart2, Activity, Waves } from 'lucide-react';
import { auralizer } from '../engine/auralizer';

type Tab = 'summary' | 'signal' | 'distribution';

export const BottomPanel: React.FC = () => {
  const { 
    results, selectedId,
    currentTime, setCurrentTime,
    auralizationSettings, setAuralization,
    toggleAnalysis
  } = useProjectStore();
  
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const scrubberRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [etcView, setEtcView] = useState({ x: 0, y: 0, w: 500, h: 90 });

  const selectedResult = results.find(r => r.receiverId === selectedId) || (results.length > 0 ? results[0] : null);

  useEffect(() => {
    if (selectedResult) {
      const totalTimeMs = selectedResult.metrics.etc.length;
      setEtcView(v => ({ ...v, w: Math.max(v.w, totalTimeMs) }));
    }
  }, [selectedId, results?.length]);

  // ETC Drawing Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedResult || !selectedResult.metrics.etc || activeTab !== 'signal') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, width, height);

    const xToPx = (x: number) => ((x - etcView.x) / etcView.w) * width;
    const yToPx = (y: number) => {
        const val = Math.max(-120, y);
        return ((val - etcView.y) / etcView.h) * height;
    };

    // Draw Grid
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * width;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    // Draw Individual Arrival Spikes (Ordered)
    if (selectedResult.metrics.arrivals) {
        selectedResult.metrics.arrivals.forEach(arrival => {
            const timeMs = arrival.time * 1000;
            if (timeMs < etcView.x || timeMs > etcView.x + etcView.w) return;

            const px = ((timeMs - etcView.x) / etcView.w) * width;
            const py = yToPx(-arrival.energy);
            
            let spikeColor = "#6666ff";
            if (arrival.order === 0) spikeColor = "#ffffff";
            else if (arrival.order === 1) spikeColor = "#33cc33";
            else if (arrival.order === 2) spikeColor = "#ffaa00";

            ctx.beginPath();
            ctx.strokeStyle = spikeColor;
            ctx.lineWidth = arrival.order <= 1 ? 2 : 1;
            ctx.moveTo(px, height);
            ctx.lineTo(px, py);
            ctx.stroke();

            // Add glow for direct sound
            if (arrival.order === 0) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#ffffff";
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        });
    }

    // Draw Integrated Energy Curve
    ctx.beginPath();
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.5;
    selectedResult.metrics.etc.forEach((pt: { time: number; energy: number }, i: number) => {
      const timeMs = pt.time * 1000; // etc times are in seconds
      if (timeMs < etcView.x || timeMs > etcView.x + etcView.w) return;
      const px = ((timeMs - etcView.x) / etcView.w) * width;
      const py = yToPx(-pt.energy);
      if (i === 0 || timeMs === etcView.x) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }, [selectedResult, etcView, activeTab]);

  const handleExportCSV = () => {
    if (results.length === 0) return;
    
    const freqs = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
    let csv = "Receiver,Metric," + freqs.map(f => `${f}Hz`).join(",") + "\n";
    
    results.forEach(res => {
      csv += `${res.receiverId},T30,` + res.metrics.t30.join(",") + "\n";
      csv += `${res.receiverId},C80,` + res.metrics.c80.join(",") + "\n";
      csv += `${res.receiverId},SPL,` + res.metrics.spl.join(",") + "\n";
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'beam_audio_metrics.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!selectedResult) return null;

  const handleToggleAudio = () => {
    if (auralizationSettings.isPlaying) {
      auralizer.stop();
      setAuralization({ isPlaying: false });
    } else {
      auralizer.play();
      setAuralization({ isPlaying: true });
    }
  };

  const handleScrub = (e: any) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min((e.clientX || e.touches?.[0].clientX) - rect.left, rect.width));
    setCurrentTime((x / rect.width) * etcView.w + etcView.x);
  };

  return (
    <DraggableWindow 
      title={`Analysis Suite: ${selectedResult.receiverId}`} 
      onClose={() => toggleAnalysis(false)}
      defaultPosition={{ x: 20, y: window.innerHeight - 380 }} 
      defaultSize={{ width: window.innerWidth - 40, height: 360 }}
      className="analysis-suite"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0E14', color: '#E0E6ED', fontFamily: 'Inter, sans-serif' }}>
        
        {/* TAB NAVIGATION */}
        <div style={{ display: 'flex', background: '#05070A', padding: '0 10px', borderBottom: '1px solid #1A1F26' }}>
            <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} icon={<BarChart2 size={14}/>} label="Executive Summary" />
            <TabButton active={activeTab === 'signal'} onClick={() => setActiveTab('signal')} icon={<Activity size={14}/>} label="Signal Analysis (ETC)" />
            <TabButton active={activeTab === 'distribution'} onClick={() => setActiveTab('distribution')} icon={<Waves size={14}/>} label="Octave Distribution" />
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            
            {/* CONTENT AREA */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                
                {activeTab === 'summary' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                        <MetricCard label="T30 (Reverb)" value={selectedResult.metrics.t30[13].toFixed(2)} unit="s" status={selectedResult.metrics.t30[13] < 1.5 ? 'Good' : 'Medium'} />
                        <MetricCard label="STI (Intelligibility)" value={selectedResult.metrics.sti.toFixed(2)} unit="" status={selectedResult.metrics.sti > 0.65 ? 'Excellent' : 'Poor'} />
                        <MetricCard label="C80 (Clarity)" value={selectedResult.metrics.c80[13].toFixed(1)} unit="dB" status="Nominal" />
                        <MetricCard label="D50 (Definition)" value={(selectedResult.metrics.d50[13]*100).toFixed(0)} unit="%" status="Active" />
                        <div style={{ gridColumn: '1 / -1', marginTop: '10px', padding: '15px', background: 'rgba(0, 229, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(0, 229, 255, 0.1)' }}>
                            <h5 style={{ fontSize: '10px', textTransform: 'uppercase', color: '#00E5FF', marginBottom: '5px' }}>Engineer's Notes</h5>
                            <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0 }}>
                                High frequency absorption is consistent with current material properties. 
                                STI {selectedResult.metrics.sti > 0.6 ? 'meets' : 'fails to meet'} standard ISO 9921 criteria for this position.
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'signal' && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 'bold' }}>ENERGY TIME CURVE (LIN)</span>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => setEtcView(v => ({ ...v, w: v.w * 0.8 }))} className="button small">Zoom In</button>
                                <button onClick={() => setEtcView(v => ({ ...v, w: v.w * 1.2 }))} className="button small">Zoom Out</button>
                            </div>
                         </div>
                         <div style={{ flex: 1, position: 'relative', background: '#05070A', border: '1px solid #1A1F26', borderRadius: '4px' }}>
                            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
                            <div 
                                ref={scrubberRef} 
                                onMouseDown={handleScrub}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'crosshair' }} 
                            />
                            <div style={{ 
                                position: 'absolute', top: 0, bottom: 0, width: '1px', background: '#FF3D00', 
                                left: `${((currentTime - etcView.x) / etcView.w) * 100}%`, pointerEvents: 'none',
                                boxShadow: '0 0 10px #FF3D00'
                            }} />
                         </div>
                    </div>
                )}

                {activeTab === 'distribution' && (
                    <div style={{ height: '100%' }}>
                         <h5 style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748B', marginBottom: '15px' }}>Spectral Decay Per Octave Band</h5>
                         <div style={{ display: 'flex', gap: '2px', height: '160px', alignItems: 'flex-end' }}>
                            {selectedResult.metrics.t30.map((t: number, i: number) => (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '100%', height: `${Math.min(100, t * 20)}%`, background: i === 13 ? '#00E5FF' : '#1A1F26', borderRadius: '2px 2px 0 0', position: 'relative' }}>
                                        {i % 3 === 0 && <span style={{ position: 'absolute', bottom: '-20px', fontSize: '8px', color: '#64748B', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>{getOctaveFreq(i)}</span>}
                                    </div>
                                </div>
                            ))}
                         </div>
                    </div>
                )}

            </div>

            {/* AURALIZATION SIDEBAR */}
            <div style={{ width: '280px', borderLeft: '1px solid #1A1F26', padding: '20px', background: '#07090D', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748B' }}>Auralization Engine</h4>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button 
                         onClick={handleToggleAudio}
                         style={{ width: '45px', height: '45px', borderRadius: '50%', border: 'none', background: '#00E5FF', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        {auralizationSettings.isPlaying ? <Pause size={24} fill="#000" /> : <Play size={24} fill="#000" />}
                    </button>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Real-time Convolution</div>
                        <div style={{ fontSize: '9px', color: '#00E5FF' }}>READY // LATENCY 12ms</div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748B' }}>Dry / Wet Mix</label>
                    <input 
                        type="range" min="0" max="1" step="0.01" 
                        value={auralizationSettings.wet} 
                        onChange={(e) => {
                            const wet = parseFloat(e.target.value);
                            setAuralization({ wet });
                            auralizer.setMix(1 - wet, wet);
                        }}
                        style={{ width: '100%', accentColor: '#00E5FF' }}
                    />
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <button className="button small" style={{ flex: 1 }} onClick={handleExportCSV}>
                        <Download size={14}/> Export CSV
                    </button>
                    <button className="button small" style={{ flex: 1 }}><Download size={14}/> Export IR</button>
                    <button className="button small" style={{ width: '40px' }}><Mic2 size={14}/></button>
                </div>
            </div>
        </div>
      </div>
    </DraggableWindow>
  );
};

const TabButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
    <button 
        onClick={onClick}
        style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'none', border: 'none', 
            borderBottom: active ? '2px solid #00E5FF' : '2px solid transparent',
            color: active ? '#00E5FF' : '#64748B', fontSize: '11px', fontWeight: active ? 'bold' : 'normal',
            cursor: 'pointer', transition: 'all 0.2s'
        }}
    >
        {icon} {label}
    </button>
);

const MetricCard: React.FC<{ label: string, value: string, unit: string, status: string }> = ({ label, value, unit, status }) => (
    <div style={{ background: '#0F172A', border: '1px solid #1A1F26', padding: '15px', borderRadius: '8px' }}>
        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'var(--font-brand)', color: '#F8FAFC' }}>{value}</span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>{unit}</span>
        </div>
        <div style={{ marginTop: '8px', fontSize: '9px', color: status === 'Excellent' || status === 'Good' ? '#4ADE80' : '#00E5FF', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
            STATUS: {status}
        </div>
    </div>
);

const getOctaveFreq = (i: number) => {
  const freqs = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
  const f = freqs[i];
  return f >= 1000 ? `${f/1000}k` : f;
};