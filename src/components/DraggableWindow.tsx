import React, { useState, useRef } from 'react';

interface DraggableWindowProps {
  title: string;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  onClose?: () => void;
  zIndex?: number;
  onFocus?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DraggableWindow: React.FC<DraggableWindowProps> = ({
  title,
  children,
  defaultPosition = { x: 50, y: 50 },
  defaultSize = { width: 400, height: 300 },
  minSize = { width: 250, height: 150 },
  onClose,
  zIndex = 100,
  onFocus,
  className,
  style: styleOverride
}) => {
  const [pos, setPos] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  const windowRef = useRef<HTMLDivElement>(null);

  // Dragging logic
  const startDrag = (e: React.MouseEvent) => {
    // Only drag from header
    if ((e.target as HTMLElement).closest('.window-controls')) return;
    setIsDragging(true);
    if (onFocus) onFocus();

    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;

    const onMove = (moveEvent: MouseEvent) => {
      setPos({
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY
      });
    };

    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Resizing logic
  const startResize = (e: React.MouseEvent, direction: 'se' | 'e' | 's') => {
    e.stopPropagation();
    setIsResizing(true);
    if (onFocus) onFocus();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const onMove = (moveEvent: MouseEvent) => {
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction === 'se' || direction === 'e') {
        newWidth = Math.max(minSize.width, startWidth + (moveEvent.clientX - startX));
      }
      if (direction === 'se' || direction === 's') {
        newHeight = Math.max(minSize.height, startHeight + (moveEvent.clientY - startY));
      }

      setSize({ width: newWidth, height: newHeight });
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={windowRef}
      onMouseDown={() => onFocus && onFocus()}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: zIndex,
        background: 'rgba(15, 15, 20, 0.95)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        backdropFilter: 'blur(10px)',
        userSelect: isDragging || isResizing ? 'none' : 'auto',
        ...styleOverride
      }}
      className={className}
    >
      {/* Header / Drag Handle */}
      <div
        onMouseDown={startDrag}
        style={{
          height: '32px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          cursor: isDragging ? 'grabbing' : 'grab',
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{title}</span>
        <div className="window-controls" style={{ display: 'flex', gap: '5px' }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', fontSize: '14px'
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flexGrow: 1, overflow: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>

      {/* Resize Handles */}
      <div
        onMouseDown={(e) => startResize(e, 'e')}
        style={{ position: 'absolute', right: 0, top: '32px', bottom: '10px', width: '5px', cursor: 'ew-resize', zIndex: 10 }}
      />
      <div
        onMouseDown={(e) => startResize(e, 's')}
        style={{ position: 'absolute', bottom: 0, left: 0, right: '10px', height: '5px', cursor: 'ns-resize', zIndex: 10 }}
      />
      <div
        onMouseDown={(e) => startResize(e, 'se')}
        style={{
          position: 'absolute', right: 0, bottom: 0, width: '12px', height: '12px', cursor: 'nwse-resize', zIndex: 10,
          background: 'linear-gradient(135deg, transparent 50%, var(--border-color) 50%)'
        }}
      />
      
      {/* Invisible overlay during drag/resize to prevent iframes/svgelements stealing pointer events */}
      {(isDragging || isResizing) && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }} />
      )}
    </div>
  );
};
