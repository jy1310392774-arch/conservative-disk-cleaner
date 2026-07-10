"use client";

import classNames from "classnames";
import { useEffect, useRef } from "react";

type BackgroundGradientAnimationProps = {
  firstColor?: string;
  secondColor?: string;
  thirdColor?: string;
  fourthColor?: string;
  fifthColor?: string;
  pointerColor?: string;
  size?: string;
  blendingValue?: string;
  children?: React.ReactNode;
  className?: string;
  interactive?: boolean;
  containerClassName?: string;
};

export function BackgroundGradientAnimation({
  firstColor = "62, 113, 142",
  secondColor = "75, 158, 165",
  thirdColor = "126, 162, 194",
  fourthColor = "224, 171, 111",
  fifthColor = "101, 132, 160",
  pointerColor = "104, 151, 176",
  size = "56%",
  blendingValue = "soft-light",
  children,
  className,
  interactive = true,
  containerClassName,
}: BackgroundGradientAnimationProps) {
  const interactiveRef = useRef<HTMLDivElement>(null);
  const currentX = useRef(0);
  const currentY = useRef(0);
  const targetX = useRef(0);
  const targetY = useRef(0);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--gradient-first-color", firstColor);
    root.setProperty("--gradient-second-color", secondColor);
    root.setProperty("--gradient-third-color", thirdColor);
    root.setProperty("--gradient-fourth-color", fourthColor);
    root.setProperty("--gradient-fifth-color", fifthColor);
    root.setProperty("--gradient-pointer-color", pointerColor);
    root.setProperty("--gradient-size", size);
    root.setProperty("--gradient-blend", blendingValue);
  }, [firstColor, secondColor, thirdColor, fourthColor, fifthColor, pointerColor, size, blendingValue]);

  useEffect(() => {
    if (!interactive) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      targetX.current = event.clientX - window.innerWidth / 2;
      targetY.current = event.clientY - window.innerHeight / 2;
    };

    const animate = () => {
      currentX.current += (targetX.current - currentX.current) / 26;
      currentY.current += (targetY.current - currentY.current) / 26;
      if (interactiveRef.current) {
        interactiveRef.current.style.transform = `translate(${Math.round(currentX.current)}px, ${Math.round(currentY.current)}px)`;
      }
      animationFrame.current = requestAnimationFrame(animate);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    animationFrame.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    };
  }, [interactive]);

  return (
    <div className={classNames("background-gradient-animation", containerClassName)} aria-hidden="true">
      <div className={classNames("background-gradient-content", className)}>{children}</div>
      <div className="background-gradient-orbs">
        <div className="gradient-orb gradient-orb-first" />
        <div className="gradient-orb gradient-orb-second" />
        <div className="gradient-orb gradient-orb-third" />
        <div className="gradient-orb gradient-orb-fourth" />
        <div className="gradient-orb gradient-orb-fifth" />
        {interactive && <div ref={interactiveRef} className="gradient-orb gradient-orb-pointer" />}
      </div>
    </div>
  );
}
