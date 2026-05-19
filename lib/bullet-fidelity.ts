import { normalizeBulletText } from '@/lib/bullet-text'

/** Metric patterns to preserve from source bullets (never drop during rewrite). */
const METRIC_SNIPPET_RE = [
  /\d+(?:\.\d+)?\s*%/g,
  /\bby\s+\d+(?:\.\d+)?\s*%/gi,
  /\b\d+(?:\.\d+)?x\b/gi,
  /\b(?:reduced|increased|improved|decreased|lowered|cut|grew|boosted|saved|drove)\s+[^.;]{0,35}?\d+(?:\.\d+)?\s*%/gi,
]

const FILLER_CLAUSE_RE =
  /,?\s*(?:aligning with|aligned with|supporting|contributing to|enhancing|supporting)\s+[^,.]{4,90}/gi

const ORPHAN_TAIL_RE =
  /\s+(?:and|or|to|with|for|by|in|on|of|the|a|an|as|at|from|into|through|support|supporting|ensuring|contributing|aligning|optimizing|refining|validating|collaborating|embodying|fostering|driving|delivering|integrating|developing|building|improving|leading|taking|tailoring)\s*$/i

/** True when a trailing comma-clause is an incomplete fragment (common after JD phrase scrub). */
function isDanglingFragment(fragment: string): boolean {
  const t = fragment.trim().toLowerCase()
  if (!t) return true
  if (/^(and|or|to|with|for|by|in|on|of|the|a|an|as|at|from|into|through|support)$/i.test(t)) return true
  if (/^[a-z]+ing$/i.test(t)) return true
  if (/\b(to|for|with)\s+support\s*$/i.test(t)) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length === 1 && /ing$/.test(words[0])) return true
  if (words.length <= 3 && /ing$/.test(words[words.length - 1] || '')) {
    const hasObject = words.some(w => !/ing$/.test(w) && w.length > 4)
    if (!hasObject) return true
  }
  return false
}

/** After phrase scrubbing, remove dangling conjunctions / incomplete clause tails. */
export function cleanOrphanBulletTail(bullet: string): string {
  let out = bullet.trim()

  for (let i = 0; i < 4; i++) {
    const comma = out.lastIndexOf(',')
    if (comma <= 0) break
    const tail = out.slice(comma + 1).trim()
    if (!isDanglingFragment(tail)) break
    out = out.slice(0, comma).trim()
  }

  for (let i = 0; i < 8; i++) {
    const next = out.replace(ORPHAN_TAIL_RE, '').replace(/,\s*$/, '').trim()
    if (next === out) break
    out = next
  }

  return out
}

function wordTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3),
  )
}

function wordOverlap(a: string, b: string): number {
  const aw = wordTokens(a)
  const bw = wordTokens(b)
  let n = 0
  for (const w of aw) if (bw.has(w)) n++
  return n
}

/** Extract numeric impact snippets from a bullet (%, by X%, improved … N%, etc.). */
export function extractMetricSnippets(text: string): string[] {
  const found = new Set<string>()
  for (const re of METRIC_SNIPPET_RE) {
    const copy = new RegExp(re.source, re.flags)
    const matches = text.match(copy)
    if (matches) {
      for (const m of matches) found.add(m.trim())
    }
  }
  return [...found]
}

/** Pull a short clause around the metric from the source bullet for re-attachment. */
function metricClauseFromSource(sourceBullet: string, metric: string): string {
  const idx = sourceBullet.toLowerCase().indexOf(metric.toLowerCase())
  if (idx === -1) return metric

  const before = sourceBullet.slice(0, idx)
  const after = sourceBullet.slice(idx + metric.length)

  const start = Math.max(
    before.lastIndexOf(','),
    before.lastIndexOf(';'),
    before.lastIndexOf('.'),
  ) + 1
  let end = after.search(/[.;]/)
  if (end === -1) end = after.length

  const clause = (before.slice(start) + metric + after.slice(0, end)).trim()
  return clause.length > 120 ? metric : clause.replace(/^,+\s*/, '')
}

function metricPresentInText(metric: string, text: string): boolean {
  const t = text.toLowerCase()
  const m = metric.toLowerCase()
  if (t.includes(m)) return true
  const digits = m.match(/\d+(?:\.\d+)?/g)
  if (digits?.length && digits.every(d => t.includes(d))) return true
  return false
}

/** Re-attach source metrics dropped by the model. */
export function preserveSourceMetrics(sourceBullets: string[], tailoredBullets: string[]): string[] {
  if (tailoredBullets.length === 0) return tailoredBullets

  const result = tailoredBullets.map(b => normalizeBulletText(b))
  const tailoredJoin = result.join(' ')

  for (const source of sourceBullets) {
    for (const metric of extractMetricSnippets(source)) {
      if (metricPresentInText(metric, tailoredJoin)) continue

      const clause = metricClauseFromSource(source, metric)
      if (!clause) continue

      let bestIdx = 0
      let bestScore = -1
      for (let i = 0; i < result.length; i++) {
        const score = wordOverlap(source, result[i])
        if (score > bestScore) {
          bestScore = score
          bestIdx = i
        }
      }

      if (!metricPresentInText(metric, result[bestIdx])) {
        result[bestIdx] = normalizeBulletText(`${result[bestIdx]}, ${clause}`)
      }
    }
  }

  return result
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Remove JD/domain phrases not supported by this role's source bullets. */
export function scrubUnsupportedJdPhrases(
  tailoredBullets: string[],
  sourceBullets: string[],
  jdPhrases: string[],
): string[] {
  const sourceText = sourceBullets.join(' ').toLowerCase()

  return tailoredBullets.map(bullet => {
    let out = bullet
    for (const phrase of jdPhrases) {
      const p = phrase.trim()
      if (p.length < 4) continue
      if (sourceText.includes(p.toLowerCase())) continue

      const esc = escapeRegExp(p)
      out = out.replace(
        new RegExp(`,?\\s*(?:aligning with|aligned with|supporting|contributing to|enhancing)\\s+[^,.]{0,30}${esc}[^,.]*`, 'gi'),
        '',
      )
      out = out.replace(new RegExp(`,?\\s*${esc}[^,.]*`, 'gi'), '')
      out = out.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '')
    }
    out = out.replace(FILLER_CLAUSE_RE, '')
    return cleanOrphanBulletTail(normalizeBulletText(out))
  })
}

/** If the same JD phrase appears in multiple bullets for one role, keep it only in the first. */
export function dedupePhrasesAcrossBullets(bullets: string[], phrases: string[]): string[] {
  const used = new Set<string>()
  return bullets.map(bullet => {
    let out = bullet
    for (const phrase of phrases) {
      const p = phrase.trim().toLowerCase()
      if (p.length < 8 || !out.toLowerCase().includes(p)) continue
      if (used.has(p)) {
        const esc = escapeRegExp(phrase.trim())
        out = out.replace(new RegExp(`,?\\s*${esc}[^,.]*`, 'gi'), '')
        out = out.replace(FILLER_CLAUSE_RE, '')
      } else {
        used.add(p)
      }
    }
    return cleanOrphanBulletTail(normalizeBulletText(out))
  })
}

export function collectScrubPhrases(jdReport: {
  domainKeywords?: string[]
  businessContext?: string[]
  actionKeywords?: string[]
}): string[] {
  const fromReport = [
    ...(jdReport.domainKeywords || []),
    ...(jdReport.businessContext || []),
    ...(jdReport.actionKeywords || []),
  ]
  const commonStuffing = [
    'client-centric',
    'client-centric approach',
    'incident response',
    'cyber incident',
    'IR workflow',
    'IR workflows',
    'engineering projects in flight',
    'fortify their cyber resilience',
  ]
  return [...new Set([...fromReport, ...commonStuffing].map(p => p.trim()).filter(p => p.length >= 4))]
}

/**
 * If the model over-trimmed, add strongest source bullets not already represented
 * until minCount is met (keeps long tenures from looking empty).
 */
export function ensureMinimumBullets(
  sourceBullets: string[],
  tailoredBullets: string[],
  minCount: number,
): string[] {
  if (minCount <= 0 || tailoredBullets.length >= minCount) return tailoredBullets

  const result = [...tailoredBullets]
  const normalizedTailored = result.map(b => b.toLowerCase())

  for (const src of sourceBullets) {
    if (result.length >= minCount) break
    const n = normalizeBulletText(src)
    if (!n) continue
    const dup = normalizedTailored.some(t => t === n.toLowerCase() || t.includes(n.toLowerCase().slice(0, 40)))
    if (!dup) {
      result.push(n)
      normalizedTailored.push(n.toLowerCase())
    }
  }
  return result
}

export function applyBulletFidelity(
  sourceBullets: string[],
  tailoredBullets: string[],
  jdPhrases: string[],
  minBullets = 0,
): string[] {
  let bullets = tailoredBullets.map(b => normalizeBulletText(b)).filter(Boolean)
  bullets = preserveSourceMetrics(sourceBullets, bullets)
  bullets = scrubUnsupportedJdPhrases(bullets, sourceBullets, jdPhrases)
  bullets = dedupePhrasesAcrossBullets(bullets, jdPhrases)
  bullets = bullets.map(cleanOrphanBulletTail).filter(b => b.length > 0)
  if (minBullets > 0) {
    bullets = ensureMinimumBullets(sourceBullets, bullets, minBullets)
    bullets = bullets.map(cleanOrphanBulletTail)
  }
  return bullets.filter(b => b.length > 12)
}

/** Keep quantified outcomes from the original summary in the tailored summary. */
export function preserveSummaryMetrics(originalSummary: string, tailoredSummary: string): string {
  const original = originalSummary.trim()
  let out = tailoredSummary.trim()
  if (!original || !out) return out

  for (const metric of extractMetricSnippets(original)) {
    if (!metricPresentInText(metric, out)) {
      const clause = metricClauseFromSource(original, metric)
      out = `${out.replace(/\s+$/, '')}, ${clause}`
    }
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}
