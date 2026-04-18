import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SpeakerModel, AcousticMaterial } from '../types';
import { Search, Download, Check, ArrowUpRight, Layers, Zap, Globe, Box } from 'lucide-react';
import { DirectivityLibrary } from '../engine/directivity_library';

type MarketTab = 'devices' | 'materials';

export const Marketplace: React.FC = () => {
  const { installedModels, installModel, installedMaterials, installMaterial } = useProjectStore();
  const [tab, setTab] = useState<MarketTab>('devices');
  const [search, setSearch] = useState('');
  const [cloudModels, setCloudModels] = useState<SpeakerModel[]>([]);

  useEffect(() => {
    const fetchMarketplace = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/marketplace.json`);
        const data = await response.json();
        const hydrated = data.map((model: any) => {
          const patternKey = model.id.replace('official_', '');
          return { ...model, directivity: DirectivityLibrary[patternKey] || model.directivity };
        });
        setCloudModels(hydrated);
      } catch (err) {
        console.error('Marketplace fetch failed:', err);
      }
    };
    fetchMarketplace();
  }, []);

  // Community presets
  const communityModels: SpeakerModel[] = [
    {
      id: 'comm_line_array_8',
      name: 'V-Series 8" Array',
      manufacturer: 'Laminar Sound',
      type: 'Line-Array',
      directivity: DirectivityLibrary['horn_90x60'],
      specs: 'High-SPL line array segment for concert hall reinforcement.',
    },
  ];

  const allDevices = [...cloudModels, ...communityModels];

  // Library devices & materials also visible in Marketplace (from Designer)
  const libraryDevices: SpeakerModel[] = installedModels.filter(m => !allDevices.find(c => c.id === m.id));
  const libraryMaterials: AcousticMaterial[] = installedMaterials;

  const filteredDevices = [...allDevices, ...libraryDevices].filter(m =>
    `${m.name} ${m.manufacturer} ${m.type}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredMaterials = libraryMaterials.filter(m =>
    `${m.name} ${m.category}`.toLowerCase().includes(search.toLowerCase())
  );

  const isInstalled = (id: string) => installedModels.some(m => m.id === id);

  const tagStyle = (color: string): React.CSSProperties => ({
    padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: `${color}18`, color,
  });

  return (
    <div style={{ padding: '0', height: 'calc(100vh - 60px)', overflowY: 'auto', background: 'var(--bg-primary)' }}>
      {/* ── Header */}
      <div style={{ padding: '40px 48px 0', maxWidth: '1080px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '6px', letterSpacing: '0.06em' }}>
          Device <span style={{ color: 'var(--accent-primary)' }}>Library</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '28px' }}>
          Speaker models, resonators, acoustic panels, and custom devices — from the community and your own Micro Sandbox.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-color)' }}>
            {([
              { id: 'devices',   icon: <Zap size={12} />,   label: `Acoustic Devices (${filteredDevices.length})` },
              { id: 'materials', icon: <Layers size={12} />, label: `Materials (${filteredMaterials.length})` },
            ] as { id: MarketTab; icon: React.ReactNode; label: string }[]).map(({ id, icon, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                background: tab === id ? 'var(--accent-primary)' : 'transparent',
                color: tab === id ? '#000' : 'var(--text-secondary)',
                fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s',
              }}>
                {icon}{label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={14} />
              <input
                placeholder="Search…"
                style={{ paddingLeft: '34px', height: '38px', width: '240px', borderRadius: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '11px' }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              className="button"
              onClick={() => window.open('https://github.com/BeamAudio/Rays/compare', '_blank')}
              style={{ gap: '6px', borderRadius: '20px', fontSize: '10px' }}
            >
              <Globe size={12} /> Contribute
            </button>
          </div>
        </div>
      </div>

      {/* ── Grid */}
      <div style={{ padding: '0 48px 48px', maxWidth: '1080px', margin: '0 auto' }}>

        {tab === 'devices' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '18px' }}>
            {filteredDevices.length === 0 && (
              <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                No acoustic devices found. Design one in the Micro Sandbox and install it.
              </div>
            )}
            {filteredDevices.map(model => {
              const installed = isInstalled(model.id);
              const isLibrary = libraryDevices.some(d => d.id === model.id);
              return (
                <div key={model.id} className="glass-panel" style={{ padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={tagStyle(isLibrary ? '#cc00ff' : '#00e5ff')}>
                      {isLibrary ? '✦ My Device' : (model.type ?? 'Speaker').toUpperCase()}
                    </div>
                    <Box size={14} color="var(--text-tertiary)" />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', marginBottom: '3px' }}>{model.name}</h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>by {model.manufacturer}</p>
                  </div>

                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5', flex: 1 }}>{model.specs}</p>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      className={`button${installed ? '' : ' primary'}`}
                      style={{ flex: 1, gap: '6px', fontSize: '10px' }}
                      onClick={() => installModel(model)}
                      disabled={installed}
                    >
                      {installed ? <><Check size={13} /> Installed</> : <><Download size={13} /> Install</>}
                    </button>
                    <button className="button" style={{ width: '38px', padding: 0 }} title="View specs">
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'materials' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '18px' }}>
            {filteredMaterials.length === 0 && (
              <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                No materials in your library yet. Create one in the Micro Sandbox (Material mode) and install it.
              </div>
            )}
            {filteredMaterials.map(mat => {
              const avgAlpha = (mat.absorption.reduce((a, b) => a + b, 0) / mat.absorption.length).toFixed(3);
              return (
                <div key={mat.name} className="glass-panel" style={{ padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={tagStyle('#ffaa00')}>{(mat.category ?? 'Custom').toUpperCase()}</div>
                    <Layers size={14} color="var(--text-tertiary)" />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', marginBottom: '3px' }}>{mat.name}</h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>ᾱ = {avgAlpha}</p>
                  </div>

                  {/* Mini absorption bar chart */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '36px', marginTop: '4px' }}>
                    {mat.absorption.slice(0, 8).map((a, i) => (
                      <div key={i} title={`${(a * 100).toFixed(0)}%`} style={{
                        flex: 1, background: 'var(--accent-primary)', borderRadius: '2px', opacity: 0.7,
                        height: `${Math.max(4, a * 100)}%`,
                      }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: 'var(--text-tertiary)' }}>
                    <span>125 Hz</span><span>4 kHz</span>
                  </div>

                  <button
                    className="button"
                    style={{ fontSize: '10px', gap: '6px', color: '#ffaa00', borderColor: 'rgba(255, 170, 0, 0.3)' }}
                    onClick={() => installMaterial(mat)}
                  >
                    <Check size={12} /> In Library
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
