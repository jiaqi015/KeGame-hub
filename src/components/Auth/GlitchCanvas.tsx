import { useRef, useEffect } from 'react';

const COLORS = ['#8a8a8a', '#9e9e9e', '#d4d4d4'];
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789';
const FONT_SIZE = 16;
const COL_WIDTH = 10;
const ROW_HEIGHT = 20;
const UPDATE_INTERVAL = 50;
const ANIMATE = true;
const COLOR_LERP_SPEED = 0.05;
const MUTATE_RATIO = 0.05;

interface Cell {
  char: string;
  color: string;
  targetColor: string;
  colorProgress: number;
}

function hexToRgb(hex: string) {
  const expanded = hex.replace(
    /^#?([\da-f])([\da-f])([\da-f])$/i,
    (_, r, g, b) => r + r + g + g + b + b,
  );
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(expanded);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : null;
}

function lerpColor(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  return `rgb(${Math.round(a.r + (b.r - a.r) * t)},${Math.round(a.g + (b.g - a.g) * t)},${Math.round(a.b + (b.b - a.b) * t)})`;
}

export function GlitchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cells: Cell[] = [];
    let dims = { columns: 0, rows: 0 };
    let animFrame = 0;
    let lastUpdate = Date.now();

    const randomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];
    const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

    function initGrid(cols: number, rows: number) {
      dims = { columns: cols, rows: rows };
      cells = [];
      for (let i = 0; i < cols * rows; i++) {
        cells.push({
          char: randomChar(),
          color: randomColor(),
          targetColor: randomColor(),
          colorProgress: 1,
        });
      }
    }

    function render() {
      if (cells.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textBaseline = 'top';
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        ctx.fillStyle = cell.color;
        ctx.fillText(
          cell.char,
          (i % dims.columns) * COL_WIDTH,
          Math.floor(i / dims.columns) * ROW_HEIGHT,
        );
      }
    }

    function mutate() {
      if (cells.length === 0) return;
      const count = Math.max(1, Math.floor(cells.length * MUTATE_RATIO));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * cells.length);
        cells[idx].char = randomChar();
        cells[idx].targetColor = randomColor();
        cells[idx].colorProgress = ANIMATE ? 0 : 1;
      }
    }

    function animateColors() {
      let dirty = false;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.colorProgress < 1) {
          cell.colorProgress = Math.min(1, cell.colorProgress + COLOR_LERP_SPEED);
          const from = hexToRgb(cell.color);
          const to = hexToRgb(cell.targetColor);
          if (from && to) {
            cell.color = lerpColor(from, to, cell.colorProgress);
            dirty = true;
          }
        }
      }
      if (dirty) render();
    }

    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initGrid(
        Math.ceil(rect.width / COL_WIDTH),
        Math.ceil(rect.height / ROW_HEIGHT),
      );
      render();
    }

    function loop() {
      const now = Date.now();
      if (now - lastUpdate >= UPDATE_INTERVAL) {
        mutate();
        render();
        lastUpdate = now;
      }
      if (ANIMATE) animateColors();
      animFrame = requestAnimationFrame(loop);
    }

    resize();
    loop();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        cancelAnimationFrame(animFrame);
        resize();
        loop();
      }, 100);
    };

    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ opacity: 0.35 }}
    />
  );
}
