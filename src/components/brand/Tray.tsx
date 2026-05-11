import type { ReactNode, CSSProperties } from "react";

interface TrayProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Tray({ children, className = "", style }: TrayProps) {
  return (
    <div className={`relative rim rounded-[22px] ${className}`} style={style}>
      <div
        className="absolute inset-[14px] brushed rounded-[12px]"
        style={{
          boxShadow:
            "inset 0 2px 6px rgba(20,30,60,0.18), inset 0 -1px 2px rgba(255,255,255,0.4)",
        }}
      />
      <div className="relative" style={{ padding: "36px 32px" }}>
        {children}
      </div>
    </div>
  );
}
