import React, { useState, useEffect } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (val: number) => void;
  label?: string;
  step?: number;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * A robust numeric input that allows the user to type freely (including backspacing to empty)
 * and only syncs with the central store when a valid number is present.
 */
export const NumericInput: React.FC<NumericInputProps> = ({ 
  value, onChange, label, step = 0.1, min, max, style, className 
}) => {
  const [internalValue, setInternalValue] = useState(value.toString());

  // Sync internal value if external value changes (e.g. from undo/redo or simulation results)
  useEffect(() => {
    // Only update if the parsed internal value is different from the external value
    // to avoid resetting the cursor position while typing "10." for "10.5"
    if (parseFloat(internalValue) !== value) {
      setInternalValue(value.toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setInternalValue(newVal);

    const parsed = parseFloat(newVal);
    if (!isNaN(parsed)) {
       // Clamp if needed
       let final = parsed;
       if (min !== undefined) final = Math.max(min, final);
       if (max !== undefined) final = Math.min(max, final);
       onChange(final);
    }
  };

  const handleBlur = () => {
    // On blur, if the value is invalid (empty or NaN), reset to the store's current value
    const parsed = parseFloat(internalValue);
    if (isNaN(parsed)) {
      setInternalValue(value.toString());
    } else {
      setInternalValue(parsed.toString());
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {label && <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>{label}</label>}
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={internalValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={className}
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '4px',
          color: '#fff',
          padding: '4px 8px',
          fontSize: '11px',
          width: '100%',
          outline: 'none',
          ...style
        }}
      />
    </div>
  );
};
