/**
 * Interpolate {key} placeholders in a template string with values from `vars`.
 * Missing keys become empty strings. Pure function; safe across the
 * server/client component boundary because templates are plain strings.
 */
export function template(
  str: string,
  vars: Record<string, string | number>,
): string {
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
