import type { Experience } from '@/lib/types'

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

/** Parse common resume date strings; Present/current → today. */
export function parseResumeDate(value: string): Date | null {
  const raw = (value || '').trim()
  if (!raw) return null
  const t = raw.toLowerCase()
  if (t === 'present' || t === 'current' || t === 'now' || t === 'ongoing') {
    return new Date()
  }

  const slash = t.match(/^(\d{1,2})\/(\d{4})$/)
  if (slash) return new Date(Number(slash[2]), Number(slash[1]) - 1, 1)

  const monYear = t.match(/^([a-z]+)\s+(\d{4})$/)
  if (monYear) {
    const m = MONTH_MAP[monYear[1]]
    if (m !== undefined) return new Date(Number(monYear[2]), m, 1)
  }

  const yearOnly = t.match(/^(\d{4})$/)
  if (yearOnly) return new Date(Number(yearOnly[1]), 0, 1)

  const iso = Date.parse(raw)
  if (!Number.isNaN(iso)) return new Date(iso)

  return null
}

/** Most recent first (by end date, then start date). */
export function sortExperiencesByRecency(experiences: Experience[]): Experience[] {
  return [...experiences].sort((a, b) => experienceRecencyScore(b) - experienceRecencyScore(a))
}

function experienceRecencyScore(exp: Experience): number {
  const end = parseResumeDate(exp.endDate)
  const start = parseResumeDate(exp.startDate)
  return (end || start || new Date(0)).getTime()
}

/**
 * Resume focus: last N roles and roles ending within the past M years.
 * Unparseable dates are kept (do not drop data silently).
 */
/** Approximate years in role from start/end dates (for bullet-count guidance). */
export function estimateTenureYears(exp: Experience): number | null {
  const start = parseResumeDate(exp.startDate)
  const end = parseResumeDate(exp.endDate)
  if (!start || !end) return null
  const ms = end.getTime() - start.getTime()
  if (ms < 0) return null
  return ms / (365.25 * 24 * 60 * 60 * 1000)
}

/** Minimum tailored bullets so long tenures are not under-represented. */
export function recommendedMinBullets(tenureYears: number | null, sourceBulletCount: number): number {
  if (sourceBulletCount <= 0) return 0
  if (sourceBulletCount <= 3) return sourceBulletCount
  if (tenureYears === null) return Math.min(sourceBulletCount, 5)
  if (tenureYears >= 4) return Math.min(sourceBulletCount, 7)
  if (tenureYears >= 2) return Math.min(sourceBulletCount, 6)
  return Math.min(sourceBulletCount, 5)
}

export function filterExperiencesForResume(
  experiences: Experience[],
  /** Include up to N most recent roles (5 fits a typical 5-job career on 1–2 pages). */
  maxRoles = 5,
  maxYears = 12,
): Experience[] {
  const sorted = sortExperiencesByRecency(experiences)
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - maxYears)

  const inWindow = sorted.filter(exp => {
    const end = parseResumeDate(exp.endDate)
    const start = parseResumeDate(exp.startDate)
    const anchor = end || start
    if (!anchor) return true
    return anchor >= cutoff
  })

  return inWindow.slice(0, maxRoles)
}
