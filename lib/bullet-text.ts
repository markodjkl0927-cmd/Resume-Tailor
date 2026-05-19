/** Clean bullet strings for storage, preview, and PDF (no trailing period, no embedded newlines). */
export function normalizeBulletText(text: string): string {
  return text
    .trimEnd()
    .replace(/\.$/, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
