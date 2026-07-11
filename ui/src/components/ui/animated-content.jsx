import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

export default function AnimatedContent({
  children,
  viewKey,
  distance = 28,
  duration = 0.45,
  ease = "power3.out",
  className = ""
}) {
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    const context = gsap.context(() => {
      gsap.fromTo(element, { autoAlpha: 0, y: distance, scale: 0.992 }, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration,
        ease,
        clearProps: "transform"
      });
    }, element);
    return () => context.revert();
  }, [viewKey, distance, duration, ease]);

  return <div ref={elementRef} className={className}>{children}</div>;
}
