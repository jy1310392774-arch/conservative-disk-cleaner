import { useCallback, useEffect, useRef } from "react";
import "./border-glow.css";

function parseHsl(value) {
  const match = String(value).match(/([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?/);
  return match ? { h: match[1], s: match[2], l: match[3] } : { h: "201", s: "66", l: "64" };
}

export default function BorderGlow({
  children,
  className = "",
  glowColor = "201 66 64",
  borderRadius = 18,
  glowIntensity = 0.72
}) {
  const cardRef = useRef(null);
  const { h, s, l } = parseHsl(glowColor);

  const updatePointer = useCallback((event) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const angle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI) + 90;
    const edgeX = Math.min(x, rect.width - x) / Math.max(centerX, 1);
    const edgeY = Math.min(y, rect.height - y) / Math.max(centerY, 1);
    const proximity = 1 - Math.max(0, Math.min(edgeX, edgeY));
    card.style.setProperty("--border-glow-angle", `${angle}deg`);
    card.style.setProperty("--border-glow-strength", proximity.toFixed(3));
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return undefined;
    card.style.setProperty("--border-glow-angle", "135deg");
    card.style.setProperty("--border-glow-strength", "0");
    return undefined;
  }, []);

  const color = `hsl(${h}deg ${s}% ${l}% / ${Math.min(Math.max(glowIntensity, 0), 1)})`;
  return (
    <div
      ref={cardRef}
      className={`border-glow-card ${className}`}
      onPointerMove={updatePointer}
      style={{ "--border-glow-color": color, "--border-glow-radius": `${borderRadius}px` }}
    >
      <span className="border-glow-light" aria-hidden="true" />
      <div className="border-glow-content">{children}</div>
    </div>
  );
}
