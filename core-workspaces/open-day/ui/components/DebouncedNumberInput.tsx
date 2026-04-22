import React, { useState, useEffect } from 'react';

interface DebouncedNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  debounceMs?: number;
}

export function DebouncedNumberInput({
  value,
  onChange,
  debounceMs = 300,
  ...props
}: DebouncedNumberInputProps) {
  const [localValue, setLocalValue] = useState<string>(String(value));

  // Sync with incoming value from props (e.g. when presets are applied)
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const numValue = Number(localValue);
      if (!isNaN(numValue) && numValue !== value) {
        onChange(numValue);
      }
    }, debounceMs);

    return () => clearTimeout(handler);
  }, [localValue, debounceMs, onChange, value]);

  return (
    <input
      {...props}
      type="number"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
    />
  );
}
