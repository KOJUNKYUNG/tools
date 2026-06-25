/**
 * Route-level loading UI shown during a tool page's server render (params +
 * dictionary fetch). A single quiet spinner on the design tokens — no skeleton,
 * since each tool draws its own controls once mounted.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-32" aria-label="로딩 중" role="status">
      <div
        className="size-6 animate-spin rounded-full border-2"
        style={{ borderColor: "var(--border)", borderTopColor: "var(--ink-strong)" }}
      />
    </div>
  );
}
