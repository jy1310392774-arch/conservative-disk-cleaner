import { CSSProperties, ReactNode, useEffect, useId, useRef, useState } from "react";
import "./glass-surface.css";

type Channel = "R" | "G" | "B";

interface GlassSurfaceProps {
  children?: ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: Channel;
  yChannel?: Channel;
  mixBlendMode?: GlobalCompositeOperation;
  className?: string;
  style?: CSSProperties;
}

function supportsSvgFilters(filterId: string) {
  if (typeof document === "undefined") return false;
  const test = document.createElement("div");
  test.style.backdropFilter = `url(#${filterId})`;
  return test.style.backdropFilter !== "";
}

export default function GlassSurface({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0.1,
  saturation = 1.15,
  distortionScale = -120,
  redOffset = 0,
  greenOffset = 8,
  blueOffset = 16,
  xChannel = "R",
  yChannel = "G",
  mixBlendMode = "screen",
  className = "",
  style = {}
}: GlassSurfaceProps) {
  const identifier = useId().replace(/:/g, "-");
  const filterId = `glass-filter-${identifier}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<SVGFEImageElement>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const [svgSupported, setSvgSupported] = useState(false);

  const updateMap = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const actualWidth = rect?.width || 400;
    const actualHeight = rect?.height || 200;
    const edge = Math.min(actualWidth, actualHeight) * borderWidth * 0.5;
    const svg = `<svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="r" x1="100%" x2="0%"><stop stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient><linearGradient id="b" y2="100%"><stop stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient></defs><rect width="${actualWidth}" height="${actualHeight}" fill="#000"/><rect width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#r)"/><rect width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#b)" style="mix-blend-mode:${mixBlendMode}"/><rect x="${edge}" y="${edge}" width="${actualWidth - edge * 2}" height="${actualHeight - edge * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)"/></svg>`;
    imageRef.current?.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`);
  };

  useEffect(() => {
    setSvgSupported(supportsSvgFilters(filterId));
  }, [filterId]);

  useEffect(() => {
    updateMap();
    blurRef.current?.setAttribute("stdDeviation", String(displace));
  }, [width, height, borderRadius, borderWidth, brightness, opacity, blur, displace, mixBlendMode]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => requestAnimationFrame(updateMap));
    observer.observe(element);
    return () => observer.disconnect();
  }, [borderRadius, borderWidth, brightness, opacity, blur, mixBlendMode]);

  const containerStyle = {
    ...style,
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    borderRadius: `${borderRadius}px`,
    "--glass-frost": backgroundOpacity,
    "--glass-saturation": saturation,
    "--filter-id": `url(#${filterId})`
  } as CSSProperties;

  return (
    <div ref={containerRef} className={`glass-surface ${svgSupported ? "glass-surface--svg" : "glass-surface--fallback"} ${className}`} style={containerStyle}>
      <svg className="glass-surface__filter" aria-hidden="true">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={imageRef} width="100%" height="100%" preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortionScale + redOffset} xChannelSelector={xChannel} yChannelSelector={yChannel} result="redMap" />
            <feColorMatrix in="redMap" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortionScale + greenOffset} xChannelSelector={xChannel} yChannelSelector={yChannel} result="greenMap" />
            <feColorMatrix in="greenMap" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortionScale + blueOffset} xChannelSelector={xChannel} yChannelSelector={yChannel} result="blueMap" />
            <feColorMatrix in="blueMap" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue" />
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={blurRef} in="output" stdDeviation={displace} />
          </filter>
        </defs>
      </svg>
      <div className="glass-surface__content">{children}</div>
    </div>
  );
}
