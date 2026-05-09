import React, { useMemo } from 'react';
import { LiquidGlass, type GlassStyle } from '@specy/liquid-glass-react';

type LiquidGlassSurfacePreset = 'panel' | 'hero' | 'toolbar' | 'button';

interface LiquidGlassSurfaceProps {
  children: React.ReactNode;
  active?: boolean;
  as?: 'div' | 'section' | 'header';
  className?: string;
  glassClassName?: string;
  contentClassName?: string;
  config?: Partial<GlassStyle>;
  enabled?: boolean;
  preset?: LiquidGlassSurfacePreset;
  style?: React.CSSProperties;
}

const PRESET_STYLES: Record<LiquidGlassSurfacePreset, GlassStyle> = {
  panel: {
    depth: 0.42,
    segments: 44,
    radius: 0.18,
    roughness: 0.06,
    transmission: 0.98,
    reflectivity: 0.58,
    ior: 1.46,
    dispersion: 0.13,
    thickness: 0.58,
    tint: 0xf6fbff,
  },
  hero: {
    depth: 0.58,
    segments: 64,
    radius: 0.2,
    roughness: 0.035,
    transmission: 1,
    reflectivity: 0.68,
    ior: 1.5,
    dispersion: 0.18,
    thickness: 0.72,
    tint: 0xf7fcff,
  },
  toolbar: {
    depth: 0.34,
    segments: 48,
    radius: 0.16,
    roughness: 0.055,
    transmission: 0.98,
    reflectivity: 0.52,
    ior: 1.44,
    dispersion: 0.11,
    thickness: 0.46,
    tint: 0xfbfdff,
  },
  button: {
    depth: 0.32,
    segments: 48,
    radius: 0.5,
    roughness: 0.045,
    transmission: 1,
    reflectivity: 0.64,
    ior: 1.48,
    dispersion: 0.14,
    thickness: 0.5,
    tint: 0xffffff,
  },
};

export function LiquidGlassSurface({
  children,
  active = true,
  as: Element = 'div',
  className = '',
  glassClassName = '',
  contentClassName = '',
  config,
  enabled = true,
  preset = 'panel',
  style,
}: LiquidGlassSurfaceProps) {
  const glassStyle = useMemo(
    () => ({ ...PRESET_STYLES[preset], ...config }),
    [config, preset],
  );

  if (!enabled || !active) {
    return (
      <Element className={`${className} ${glassClassName}`} style={style}>
        <div className={contentClassName}>{children}</div>
      </Element>
    );
  }

  return (
    <div className={`seller-liquid-root ${className}`} style={style}>
      <div aria-hidden="true" className="seller-liquid-scene" />
      <LiquidGlass
        glassStyle={glassStyle}
        wrapperStyle={{ position: 'relative', display: 'block', width: '100%' }}
        style={`width:100%;display:block;`}
      >
        <Element className={`seller-liquid-surface seller-liquid-${preset} ${glassClassName}`}>
          <div className={`seller-liquid-content ${contentClassName}`}>
            {children}
          </div>
        </Element>
      </LiquidGlass>
    </div>
  );
}
