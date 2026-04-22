import { motion } from 'motion/react';

interface RadarChartProps {
  data: {
    scale: number;      // 规模
    traffic: number;    // 流量
    product: number;    // 货品
    interaction: number; // 交互
  };
  size?: number;
}

export function RadarChart({ data, size = 200 }: RadarChartProps) {
  const center = size / 2;
  const maxRadius = (size / 2) * 0.8;
  const gridLevels = [0.25, 0.5, 0.75, 1];

  // Convert 0-100 values to radius
  const getRadius = (val: number) => (val / 100) * maxRadius;

  // Vertex Coordinates (Top, Right, Bottom, Left)
  const points = [
    { x: center, y: center - getRadius(data.scale), label: '规模' },
    { x: center + getRadius(data.traffic), y: center, label: '流量' },
    { x: center, y: center + getRadius(data.product), label: '货品' },
    { x: center - getRadius(data.interaction), y: center, label: '交互' }
  ];

  const polygonPath = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Grid Circles */}
        {gridLevels.map((lvl) => (
          <circle
            key={lvl}
            cx={center}
            cy={center}
            r={maxRadius * lvl}
            fill="none"
            stroke="rgba(76, 58, 42, 0.08)"
            strokeDasharray="4 4"
          />
        ))}

        {/* Axes */}
        <line x1={center} y1={center - maxRadius} x2={center} y2={center + maxRadius} stroke="rgba(76, 58, 42, 0.1)" />
        <line x1={center - maxRadius} y1={center} x2={center + maxRadius} y2={center} stroke="rgba(76, 58, 42, 0.1)" />

        {/* Data Polygon */}
        <motion.polygon
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1, points: polygonPath }}
          transition={{ type: 'spring', damping: 20, stiffness: 60 }}
          points={polygonPath}
          fill="rgba(191, 98, 59, 0.2)"
          stroke="var(--od-primary)"
          strokeWidth="2"
        />

        {/* Vertex Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--od-primary)" />
        ))}

        {/* Labels */}
        <text x={center} y={center - maxRadius - 10} textAnchor="middle" fontSize={11} fill="var(--od-text-muted)" fontWeight="600">规模</text>
        <text x={center + maxRadius + 10} y={center + 4} textAnchor="start" fontSize={11} fill="var(--od-text-muted)" fontWeight="600">流量</text>
        <text x={center} y={center + maxRadius + 20} textAnchor="middle" fontSize={11} fill="var(--od-text-muted)" fontWeight="600">货品</text>
        <text x={center - maxRadius - 10} y={center + 4} textAnchor="end" fontSize={11} fill="var(--od-text-muted)" fontWeight="600">交互</text>
      </svg>
    </div>
  );
}
