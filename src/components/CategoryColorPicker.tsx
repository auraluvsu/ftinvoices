import { useState } from 'react';
import { catVar, SUGGESTED_COLORS } from '../lib/color';
import { ColorWheel } from './ColorWheel';

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

/** Quick-pick swatches plus a button that opens a full colour wheel. */
export function CategoryColorPicker({ value, onChange }: Props) {
  const isCustom = !SUGGESTED_COLORS.includes(value);
  const [showWheel, setShowWheel] = useState(false);

  return (
    <div className="field">
      <span className="field-label">Colour</span>
      <div className="swatches" role="radiogroup" aria-label="Category colour">
        {SUGGESTED_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            className={`swatch${value === c ? ' selected' : ''}`}
            style={catVar(c)}
            onClick={() => onChange(c)}
          />
        ))}
        <button
          type="button"
          className={`swatch swatch-wheel${isCustom ? ' selected' : ''}`}
          style={catVar(value)}
          aria-expanded={showWheel}
          aria-label="Choose a custom colour from the colour wheel"
          title="Colour wheel"
          onClick={() => setShowWheel((s) => !s)}
        />
      </div>
      {showWheel && <ColorWheel value={value} onChange={onChange} />}
    </div>
  );
}
