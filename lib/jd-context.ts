import type { JDReport } from '@/lib/types'

/** Reconstruct JD context for boost pass when full JD text is not available. */
export function jdContextFromReport(report: JDReport): string {
  const lines = [
    report.role && `Role: ${report.role}`,
    report.company && `Company: ${report.company}`,
    report.top10?.length ? `Top keywords: ${report.top10.join(', ')}` : '',
    report.titleKeywords?.length ? `Title/function: ${report.titleKeywords.join(', ')}` : '',
    report.hardSkills?.length ? `Hard skills: ${report.hardSkills.join(', ')}` : '',
    report.businessContext?.length ? `Business context: ${report.businessContext.join(', ')}` : '',
    report.actionKeywords?.length ? `Responsibilities: ${report.actionKeywords.join(', ')}` : '',
    report.domainKeywords?.length ? `Domain: ${report.domainKeywords.join(', ')}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}
