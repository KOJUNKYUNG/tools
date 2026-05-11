"use client";
import { useEffect, useState, type ReactNode } from "react";

export function FadeInCenter({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "scale(1)" : "scale(0.96)",
        transformOrigin: "50% 50%",
        transition: "opacity 320ms ease 80ms, transform 360ms cubic-bezier(.4,0,.2,1) 80ms",
      }}
    >
      {children}
    </div>
  );
}
