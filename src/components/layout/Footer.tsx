interface FooterProps {
  copyright: string;
  version: string;
  license: string;
}

export function Footer({ copyright, version, license }: FooterProps) {
  return (
    <footer
      className="px-8 py-4 flex items-center justify-between border-t relative"
      style={{
        borderColor: "var(--border)",
        height: "60px",
        borderStyle: "solid",
        margin: "0px",
        padding: "16px 32px",
        fontWeight: 500,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "var(--bg)",
          opacity: "var(--tweak-footer-bg-opacity, 1)",
          transition: "opacity 200ms ease",
        }}
      />
      <div
        className="font-body text-[11px] tabular-nums tracking-wide relative"
        style={{ color: "var(--ink-soft)" }}
      >
        {copyright}
      </div>
      <div
        className="flex items-center gap-3 font-body text-[10px] tracking-[0.12em] uppercase relative"
        style={{ color: "var(--ink-soft)" }}
      >
        <span>{version}</span>
        <span style={{ color: "var(--border)" }}>·</span>
        <span>{license}</span>
      </div>
    </footer>
  );
}
