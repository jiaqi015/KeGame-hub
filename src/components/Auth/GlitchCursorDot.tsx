import { useRef, useEffect, useState } from 'react';

interface GlitchCursorDotProps {
  hidden?: boolean;
}

export function GlitchCursorDot({ hidden = false }: GlitchCursorDotProps) {
  const [isPressed, setIsPressed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -100, y: -100, currentX: -100, currentY: -100 });
  const animRef = useRef(0);
  const smoothFactor = useRef(0.18);

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;

    const update = () => {
      const { x, y, currentX: cx, currentY: cy } = posRef.current;
      const nx = cx + (x - cx) * smoothFactor.current;
      const ny = cy + (y - cy) * smoothFactor.current;
      posRef.current.currentX = nx;
      posRef.current.currentY = ny;
      dot.style.left = `${nx}px`;
      dot.style.top = `${ny}px`;
      animRef.current = requestAnimationFrame(update);
    };

    animRef.current = requestAnimationFrame(update);

    const onMouseMove = (e: MouseEvent) => {
      posRef.current.x = e.clientX;
      posRef.current.y = e.clientY;
      setIsVisible(true);
    };

    const onMouseDown = () => setIsPressed(true);
    const onMouseUp = () => setIsPressed(false);
    const onMouseLeave = () => setIsVisible(false);
    const onMouseEnter = () => setIsVisible(true);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);

    return () => {
      cancelAnimationFrame(animRef.current);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mouseenter', onMouseEnter);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="fixed pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-difference transition-[width,height,background] duration-150"
        style={{
          width: isPressed ? 48 : 8,
          height: isPressed ? 48 : 8,
          background: isPressed
            ? 'rgba(0,0,0,0.6)'
            : 'rgba(255,255,255,0.85)',
          border: isPressed
            ? '1px solid rgba(255,255,255,0.3)'
            : 'none',
          opacity: isVisible && !hidden ? 1 : 0,
        }}
        aria-hidden="true"
      />
    </>
  );
}
