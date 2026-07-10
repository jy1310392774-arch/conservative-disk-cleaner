import React, { ReactNode, useEffect, useRef } from "react";

type GlowColor = "blue" | "purple" | "green" | "red" | "orange";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: GlowColor;
}

const glowColorMap: Record<GlowColor, { base: number; spread: number }> = {
  blue: { base: 210, spread: 65 },
  purple: { base: 280, spread: 90 },
  green: { base: 145, spread: 65 },
  red: { base: 0, spread: 55 },
  orange: { base: 28, spread: 45 },
};

const GlowCard: React.FC<GlowCardProps> = ({ children, className = "", glowColor = "blue" }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncPointer = (event: PointerEvent) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      cardRef.current.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
      cardRef.current.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
    };

    window.addEventListener("pointermove", syncPointer, { passive: true });
    return () => window.removeEventListener("pointermove", syncPointer);
  }, []);

  const { base, spread } = glowColorMap[glowColor];

  return (
    <div
      ref={cardRef}
      className={`spotlight-card ${className}`}
      style={{ "--glow-base": base, "--glow-spread": spread } as React.CSSProperties}
    >
      <div className="spotlight-card-content">{children}</div>
    </div>
  );
};

export { GlowCard };
