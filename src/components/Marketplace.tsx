import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../state/project_state';
import type { SpeakerModel } from '../types';
import { Search, Download, Check, Info, ArrowUpRight, X } from 'lucide-react';
import { DirectivityLibrary } from '../engine/directivity_library';
import { Canvas } from '@react-three/fiber';
import { BalloonVisualizer } from './BalloonVisualizer';

export const Marketplace: React.FC = () => {
  const { installedModels, installModel } = useProjectStore();
  const [search, setSearch] = useState('');
  const [previewModel, setPreviewModel] = useState<SpeakerModel | null>(null);

  const [cloudModels, setCloudModels] = useState<SpeakerModel[]>([]);

  useEffect(() => {
    // Fetch from static 'cloud' manifest
    const fetchMarketplace = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}marketplace.json`);
        const data = await response.json();
        
        // Map simplified JSON to full patterns if needed or just use as-is
        const hydrated = data.map((model: any) => {
          // If the JSON only has the name, we link it to our engine's pattern generator
          // In a real scenario, this would match a unique ID
          const patternKey = model.id.replace('official_', '');
          return {
            ...model,
            directivity: DirectivityLibrary[patternKey] || model.directivity
          };
        });
        
        setCloudModels(hydrated);
      } catch (err) {
        console.error('Marketplace fetch failed:', err);
      }
    };

    fetchMarketplace();
  }, []);

  // Community / Mock Models (In-app presets)
  const communityModels: SpeakerModel[] = [
    {
      id: 'comm_line_array_8',
      name: 'V-Series 8" Array',
      manufacturer: 'Laminar Sound',
      type: 'Line-Array',
      directivity: DirectivityLibrary['horn_90x60'],
      specs: 'High-SPL line array segment for concert hall reinforcement.'
    }
  ];

  const allModels = [...cloudModels, ...communityModels];
  const filtered = allModels.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.manufacturer.toLowerCase().includes(search.toLowerCase())
  );

  const isInstalled = (id: string) => installedModels.some(m => m.id === id);

  return (
    <div className="marketplace-container" style={{ padding: '40px', height: 'calc(100vh - 60px)', overflowY: 'auto' }}>
      <div className="marketplace-header" style={{ maxWidth: '1000px', margin: '0 auto 40px auto' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Beam Audio <span style={{ color: 'var(--accent-primary)' }}>Rays</span></h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Explore professionally measured and community-authored speaker profiles for your Rays simulations.</p>
          <button 
            className="button" 
            onClick={() => window.open('https://github.com/BeamAudio/Rays/compare', '_blank')}
            style={{ marginBottom: '30px' }}
          >
            <Check size={14} /> Contribute Model
          </button>
        </div>
        
        <div style={{ position: 'relative', maxWidth: '500px' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={18} />
          <input 
            className="input" 
            placeholder="Search manufacturers, models, or types..." 
            style={{ paddingLeft: '40px', width: '100%', height: '45px', borderRadius: '12px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="market-grid" style={{ 
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: '24px', maxWidth: '1000px', margin: '0 auto' 
      }}>
        {filtered.map(model => (
          <div key={model.id} className="glass-panel market-card" style={{ 
            padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column',
            transition: 'transform 0.2s', cursor: 'default'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <div style={{ padding: '4px 8px', background: 'rgba(0,229,255,0.1)', borderRadius: '6px', fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 'bold' }}>
                {(model.type ?? 'Speaker').toUpperCase()}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}><Info size={16} /></div>
            </div>

            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>{model.name}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>By {model.manufacturer}</p>
            
            <div style={{ flex: 1, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '20px' }}>
              {model.specs}
            </div>

      {previewModel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '600px', height: '400px', position: 'relative', padding: '20px' }}>
            <button onClick={() => setPreviewModel(null)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#fff' }}><X size={20}/></button>
            <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>{previewModel.name} Directivity</h3>
            <Canvas>
              <BalloonVisualizer hSpread={60} vSpread={90} tilt={0} pan={0} />
            </Canvas>
          </div>
        </div>
      )}

      {/* Market Grid... */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className={`button ${isInstalled(model.id) ? '' : 'primary'}`} 
                style={{ flex: 1, gap: '8px' }}
                onClick={() => installModel(model)}
                disabled={isInstalled(model.id)}
              >
                {isInstalled(model.id) ? <><Check size={16} /> Installed</> : <><Download size={16} /> Install Free</>}
              </button>
              <button className="button" style={{ width: '40px', padding: 0 }} title="Preview Directivity" onClick={() => setPreviewModel(model)}>
                <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
