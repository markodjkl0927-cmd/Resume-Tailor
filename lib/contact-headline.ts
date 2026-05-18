import { Contact } from './types'

/**
 * When headline is missing (common after upload or old localStorage),
 * infer from summary opening e.g. "Senior Full-Stack & AI Engineer with 9+ years..."
 */
export function inferHeadlineFromSummary(summary: string): string {
  const s = summary.trim()
  if (!s) return ''

  const withYears = s.match(/^(.+?)\s+with\s+\d/i)
  if (withYears) {
    const h = withYears[1].trim()
    if (h.length >= 8 && h.length <= 90) return h
  }

  const firstClause = s.split(/[.!]/)[0]?.trim() ?? ''
  if (
    firstClause.length >= 8 &&
    firstClause.length <= 90 &&
    /engineer|developer|architect|manager|analyst|designer|consultant|trainer|specialist|lead/i.test(firstClause)
  ) {
    return firstClause
  }

  return ''
}

export function resolveContactHeadline(contact: Contact, summary: string): Contact {
  if ((contact.headline || '').trim()) return contact
  const inferred = inferHeadlineFromSummary(summary)
  if (!inferred) return contact
  return { ...contact, headline: inferred }
}
