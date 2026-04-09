import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../state/project_state';
import { DraggableWindow } from './DraggableWindow';
import { Play, Pause, Zap, Mic2, Download } from 'lucide-react';
import { auralizer } from '../engine/auralizer';

export const BottomPanel: React.FC = () => {
  const { 
    results, selectedId,
    currentTime, setCurrentTime,
    auralizationSettings, setAuralization
  } = useProjectStore();
  
  const scrubberRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [etcView, setEtcView] = useState({ x: 0, y: 0, w: 500, h: 90 });

  const selectedResult = results.find(r => r.receiverId === selectedId) || (results.length > 0 ? results[0] : null);

  useEffect(() => {
    if (selectedResult) {
      const totalTimeMs = selectedResult.metrics.etc.length;
      setEtcView(v => ({ ...v, w: totalTimeMs }));
    }
  }, [selectedId, results.length]);

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

  // ETC Drawing Logic (simplified for brevity, mirroring original style)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedResult.metrics.etc) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, width, height);

    const xToPx = (x: number) => ((x - etcView.x) / etcView.w) * width;
    const yToPx = (y: number) => ((y - etcView.y) / etcView.h) * height;

    ctx.beginPath();
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.5;
    selectedResult.metrics.etc.forEach((pt: { time: number; energy: number }, i: number) => {
      if (i < etcView.x || i > etcView.x + etcView.w) return;
      const px = xToPx(i);
      const py = yToPx(-pt.energy);
      if (i === Math.floor(etcView.x)) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }, [selectedResult, etcView]);

  return (
    <DraggableWindow 
      title="Acoustic Intelligence Console" 
      defaultPosition={{ x: 20, y: window.innerHeight - 340 }} 
      defaultSize={{ width: window.innerWidth - 40, height: 320 }}
      className="glass-panel"
    >
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        
        {/* LEFT: Metrics & STI */}
        <div style={{ width: '300px', borderRight: '1px solid var(--border-color)', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Broadband Metrics</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <MetricItem label="T30" value={`${selectedResult.metrics.t30[13].toFixed(2)} s`} sub="Reverb" />
              <MetricItem label="C80" value={`${selectedResult.metrics.c80[13].toFixed(1)} dB`} sub="Clarity" />
              <MetricItem label="D50" value={`${(selectedResult.metrics.d50[13]*100).toFixed(0)}%`} sub="Definition" />
              <MetricItem label="SPL" value={`${selectedResult.metrics.spl[13].toFixed(1)} dB`} sub="Level" />
            </div>
          </div>

          <div className="sti-gauge" style={{ background: 'rgba(0,229,255,0.05)', padding: '12px', borderRadius: '12px', border: '1px solid var(--accent-glow)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '10px', color: 'var(--accent-primary)', textTransform: 'uppercase' }}>STI Analysis</h4>
                <Zap size={12} color="var(--accent-primary)" />
             </div>
             <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0' }}>
                <span style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'var(--font-brand)' }}>{selectedResult.metrics.sti.toFixed(2)}</span>
                <span style={{ fontSize: '10px', fontWeight: '600', color: selectedResult.metrics.sti > 0.6 ? '#4ADE80' : '#F87171' }}>
                  {selectedResult.metrics.sti > 0.75 ? 'EXCELLENT' : (selectedResult.metrics.sti > 0.6 ? 'GOOD' : 'POOR')}
                </span>
             </div>
             <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                Targeting Speech Intelligibility @ ISO 9921
             </div>
          </div>
        </div>

        {/* MIDDLE: ETC & Auralization */}
        <div style={{ flex: 1, padding: '15px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Energy Time Curve (ETC)</h4>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button onClick={() => setEtcView(v => ({ ...v, w: v.w * 0.8 }))} className="button" style={{ padding: '2px 8px' }}>+</button>
              <button onClick={() => setEtcView(v => ({ ...v, w: v.w * 1.2 }))} className="button" style={{ padding: '2px 8px' }}>-</button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
            <div 
              ref={scrubberRef} 
              onMouseDown={handleScrub}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'crosshair' }} 
            />
            <div style={{ 
              position: 'absolute', top: 0, bottom: 0, width: '1px', background: 'var(--accent-primary)', 
              left: `${((currentTime - etcView.x) / etcView.w) * 100}%`, pointerEvents: 'none',
              boxShadow: '0 0 8px var(--accent-primary)'
            }} />
          </div>

          {/* AURALIZATION FOOTER */}
          <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '20px', background: 'var(--bg-tertiary)', padding: '10px', borderRadius: '12px' }}>
            <button 
              onClick={handleToggleAudio}
              className={`button ${auralizationSettings.isPlaying ? 'primary' : ''}`}
              style={{ width: '40px', height: '40px', borderRadius: '50%', padding: 0 }}
            >
              {auralizationSettings.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Source Sample</span>
              <select 
                className="input"
                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                value={auralizationSettings.sampleUrl}
                onChange={async (e) => {
                  const url = e.target.value;
                  setAuralization({ sampleUrl: url });
                  await auralizer.setSampleFromUrl(url);
                }}
              >
                <option value="https://www.soundjay.com/buttons/sounds/beep-01a.mp3">System Beep</option>
                <option value="https://www.w3schools.com/html/horse.mp3">Ambient Nature</option>
                <option value="https://actions.google.com/sounds/v1/alarms/alarm_clock_beeping.ogg">Metronome</option>
              </select>
            </div>
            
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <span>Auralization Mix (Dry/Wet)</span>
                <span>{Math.round(auralizationSettings.wet * 100)}% Room</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01" 
                value={auralizationSettings.wet} 
                onChange={(e) => {
                  const wet = parseFloat(e.target.value);
                  setAuralization({ wet });
                  auralizer.setMix(1 - wet, wet);
                }}
                style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="button" title="Import Custom Sample"><Mic2 size={16} /></button>
              <button className="button" title="Download Impulse Response"><Download size={16} /></button>
            </div>
          </div>
        </div>

        {/* RIGHT: Octave Band Details */}
        <div style={{ width: '300px', borderLeft: '1px solid var(--border-color)', padding: '15px' }}>
           <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Octave Band Distribution</h4>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '180px', overflowY: 'auto' }}>
              {selectedResult.metrics.t30.map((t: number, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9px' }}>
                  <span style={{ width: '30px', color: 'var(--text-secondary)' }}>{getOctaveFreq(i)}</span>
                  <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
                    <div style={{ width: `${Math.min(100, t * 20)}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: '3px', opacity: 0.8 }} />
                  </div>
                  <span style={{ width: '35px', textAlign: 'right' }}>{t.toFixed(2)}s</span>
                </div>
              ))}
           </div>
        </div>
      </div>
    </DraggableWindow>
  );
};

const MetricItem: React.FC<{ label: string, value: string, sub: string }> = ({ label, value, sub }) => (
  <div style={{ background: 'var(--bg-tertiary)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{value}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
      <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--accent-primary)' }}>{label}</span>
      <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>{sub}</span>
    </div>
  </div>
);

const getOctaveFreq = (i: number) => {
  const freqs = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
  const f = freqs[i];
  return f >= 1000 ? `${f/1000}k` : f;
};