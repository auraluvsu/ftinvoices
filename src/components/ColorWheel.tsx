import { useRef, useState } from 'react';
import { hexToHsv, hsvToHex, isHex, normaliseHex, type Hsv } from '../lib/color';

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * HSV colour wheel: angle = hue, distance from centre = saturation,
 * plus a brightness slider and a hex field.
 */
export function ColorWheel({ value, onChange }: Props) {
  const wheelRef = useRef<HTMLDivElement>(null);
  // Keep HSV locally so hue survives at zero saturation/brightness.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const [synced, setSynced] = useState(value);

  // Re-sync if the colour is changed from outside (e.g. a swatch click).
  if (value !== synced) {
    setSynced(value);
    setHsv(hexToHsv(value));
    setHexText(value);
  }

  const commit = (next: Hsv) => {
    const hex = hsvToHex(next);
    setHsv(next);
    setHexText(hex);
    setSynced(hex);
    onChange(hex);
  };

  const pickAt = (clientX: number, clientY: number) => {
    const rect = wheelRef.current!.getBoundingClientRect();
    const r = rect.width / 2;
    const dx = clientX - rect.left - r;
    const dy = clientY - rect.top - r;
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    commit({ ...hsv, h, s: Math.min(1, Math.hypot(dx, dy) / r) });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 15 : 5;
    const moves: Record<string, () => Hsv> = {
      ArrowLeft: () => ({ ...hsv, h: (hsv.h - step + 360) % 360 }),
      ArrowRight: () => ({ ...hsv, h: (hsv.h + step) % 360 }),
      ArrowUp: () => ({ ...hsv, s: clamp(hsv.s + step / 100, 0, 1) }),
      ArrowDown: () => ({ ...hsv, s: clamp(hsv.s - step / 100, 0, 1) }),
    };
    if (moves[e.key]) {
      e.preventDefault();
      commit(moves[e.key]());
    }
  };

  const rad = (hsv.h * Math.PI) / 180;
  const current = hsvToHex(hsv);
  const fullBright = hsvToHex({ ...hsv, v: 1 });

  return (
    <div className="color-wheel">
      <div
        ref={wheelRef}
        className="wheel"
        style={{ '--v': hsv.v } as React.CSSProperties}
        tabIndex={0}
        role="group"
        aria-label={`Colour wheel: hue ${Math.round(hsv.h)}°, saturation ${Math.round(hsv.s * 100)}%. Arrow keys adjust.`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pickAt(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e.clientX, e.clientY);
        }}
      >
        <span
          className="wheel-thumb"
          style={{
            left: `${50 + 50 * hsv.s * Math.sin(rad)}%`,
            top: `${50 - 50 * hsv.s * Math.cos(rad)}%`,
            background: current,
          }}
        />
      </div>

      <div className="wheel-controls">
        <label className="field">
          <span className="field-label">Brightness</span>
          <input
            type="range"
            className="brightness"
            min={0}
            max={100}
            value={Math.round(hsv.v * 100)}
            style={{ '--full': fullBright } as React.CSSProperties}
            onChange={(e) => commit({ ...hsv, v: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="field">
          <span className="field-label">Hex</span>
          <div className="hex-input">
            <span className="dot" style={{ '--cat': current } as React.CSSProperties} aria-hidden />
            <input
              type="text"
              value={hexText}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setHexText(e.target.value);
                if (isHex(e.target.value)) {
                  const hex = normaliseHex(e.target.value);
                  setHsv(hexToHsv(hex));
                  setSynced(hex);
                  onChange(hex);
                }
              }}
              onBlur={() => setHexText(current)}
            />
          </div>
        </label>
      </div>
    </div>
  );
}
