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
        className="font-body text-[11px] tabular-nums tracking-wide relative"
        style={{ color: "var(--ink-soft)" }}
      >
        {copyright}
      </div>
      <div
        className="flex items-center gap-3 font-mono text-[10px] tracking-[0.12em] uppercase relative"
        style={{ color: "var(--ink-soft)" }}
      >
        <span>{version}</span>
        <span style={{ color: "var(--border)" }}>·</span>
        <span>{license}</span>
      </div>
    </footer>
  );
}
