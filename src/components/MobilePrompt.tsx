import React, { useEffect, useState } from 'react';
import { Maximize2, RotateCcw } from 'lucide-react';

export const MobilePrompt: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check if it's a touch device (likely mobile) and in portrait
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsPortrait(isMobile && window.innerHeight > window.innerWidth);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '20px', color: '#fff', textAlign: 'center', padding: '20px'
    }}>
      <RotateCcw size={48} />
      <h2 style={{ fontSize: '20px' }}>Rotate Your Device</h2>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
        For the best simulation experience, please rotate your phone to landscape mode.
      </p>
      <button 
        className="button primary" 
        onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
        style={{ marginTop: '10px' }}
      >
        <Maximize2 size={16} /> Enter Fullscreen
      </button>
    </div>
  );
};
