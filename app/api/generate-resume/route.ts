import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { renderToBuffer } from '@react-pdf/renderer'
import pdfParse from 'pdf-parse'
import { FactBank, GeneratedResume, GeneratedExperience, JDReport } from '@/lib/types'
import {
  buildVersionSelectionPrompt,
  buildJDReportPrompt,
  buildBulletRewritePrompt,
  buildSkillsPrompt,
  buildSummaryPrompt,
} from '@/lib/prompts'
import React from 'react'
import { ResumePDFDocument } from '@/components/ResumePDF'
import { resolveContactHeadline } from '@/lib/contact-headline'
import { normalizeBulletText } from '@/lib/bullet-text'
import { applyBulletFidelity, collectScrubPhrases, preserveSummaryMetrics } from '@/lib/bullet-fidelity'
import {
  estimateTenureYears,
  filterExperiencesForResume,
  recommendedMinBullets,
} from '@/lib/experience-priority'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function countPDFPages(resume: GeneratedResume): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(ResumePDFDocument, { resume }) as any)
    const parsed = await pdfParse(buffer)
    console.log(`[page check] pages: ${parsed.numpages}`)
    return parsed.numpages
  } catch (err) {
    console.error('[page check] renderToBuffer/pdfParse failed:', err)
    return 1
  }
}

function stem(word: string): string {
  return word
    .replace(/ing$/, '').replace(/tion$/, '').replace(/ment$/, '')
    .replace(/ed$/, '').replace(/er$/, '').replace(/ly$/, '')
    .replace(/s$/, '').replace(/es$/, '')
}

function keywordMatches(kw: string, text: string): boolean {
  const kwLower = kw.toLowerCase()
  if (text.includes(kwLower)) return true
  const stemmedKw = kwLower.split(/\s+/).map(stem).join(' ')
  if (text.includes(stemmedKw)) return true
  const kwWords = kwLower.split(/\s+/)
  return kwWords.every(w => {
    const ws = stem(w)
    return text.includes(w) || text.split(/\s+/).some(tw => stem(tw) === ws)
  })
}

export async function POST(req: NextRequest) {
  try {
    const { factBank, jdText }: { factBank: FactBank; jdText: string } = await req.json()

    if (!factBank || !jdText) {
      return NextResponse.json({ error: 'Missing factBank or jdText' }, { status: 400 })
    }

    // Focus resume on recent, relevant roles (last 4 jobs, within ~10 years)
    const resumeExperiences = filterExperiencesForResume(factBank.experiences)
    const excludedCompanies = factBank.experiences
      .filter(e => !resumeExperiences.some(r => r.id === e.id))
      .map(e => e.company)
    console.log('[experience filter]', `${resumeExperiences.length}/${factBank.experiences.length} roles included`)
    if (excludedCompanies.length > 0) {
      console.log('[experience filter] excluded (beyond 5 most recent / 12-year window):', excludedCompanies.join(', '))
    }

    // Step A + B in parallel: Frame selection & JD Report
    const [frameSelectionCompletion, jdReportCompletion] = await Promise.all([
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildVersionSelectionPrompt(jdText, resumeExperiences) }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildJDReportPrompt(jdText) }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    ])

    const versionSelection = JSON.parse(frameSelectionCompletion.choices[0].message.content || '{}') as {
      jdFunction: string
      jdSeniority: string
      selections: Array<{ experienceId: string; selectedVersionId: string }>
    }

    const rawReport = JSON.parse(jdReportCompletion.choices[0].message.content || '{}') as Omit<JDReport, 'alreadyHave' | 'needToAdd'>

    // Extract categorized keywords from report
    const hardSkills = rawReport.hardSkills || []
    const businessContext = rawReport.businessContext || []
    const titleFunction = rawReport.titleKeywords || []
    const top10 = rawReport.top10 || []
    const atsKeywords = [...new Set([...hardSkills, ...businessContext, ...titleFunction])]

    // Weighted score: hardSkills=2pts, titleFunction=1.5pts, businessContext=1pt
    function calcWeightedScore(text: string): number {
      let earned = 0, total = 0
      hardSkills.forEach(kw => { total += 2; if (keywordMatches(kw, text)) earned += 2 })
      titleFunction.forEach(kw => { total += 1.5; if (keywordMatches(kw, text)) earned += 1.5 })
      businessContext.forEach(kw => { total += 1; if (keywordMatches(kw, text)) earned += 1 })
      return total > 0 ? Math.round(earned / total * 100) : 0
    }

    // Build version map
    const versionMap = new Map(versionSelection.selections.map(s => [s.experienceId, s.selectedVersionId]))

    const jdReportForBullets = {
      role: rawReport.role || '',
      top10: top10 || [],
      titleKeywords: titleFunction || [],
      hardSkills: hardSkills || [],
      businessContext: businessContext || [],
      actionKeywords: rawReport.actionKeywords || [],
    }

    // Build numbered bullets for included experiences using selected version
    const experiencesWithBullets = resumeExperiences.map(exp => {
      const selectedVersionId = versionMap.get(exp.id)
      const selectedVersion = exp.versions.find(v => v.id === selectedVersionId) || exp.versions[0]
      const bullets = selectedVersion.bullets.filter(b => b.trim())
      const numberedBullets = bullets.map((b, i) => `[${i + 1}] ${b}`).join('\n')
      const dates = [exp.startDate, exp.endDate].filter(Boolean).join(' – ')
      const tenureYears = estimateTenureYears(exp)
      return {
        experienceId: exp.id,
        company: exp.company,
        title: selectedVersion.title,
        dates,
        tenureYears,
        sourceBulletCount: bullets.length,
        numberedBullets,
      }
    })

    const selectedTitles = resumeExperiences.map(exp => {
      const selectedVersionId = versionMap.get(exp.id)
      const selectedVersion = exp.versions.find(v => v.id === selectedVersionId) || exp.versions[0]
      return `${selectedVersion.title} at ${exp.company}`
    })

    const originalSummary = (factBank.summary || '').trim()

    // Calculate BEFORE score (include titles so "Data Scientist Intern" etc. are matched)
    const originalText = [
      originalSummary,
      (factBank.contact.headline || '').trim(),
      ...factBank.experiences.map(exp => {
        const selectedVersionId = versionMap.get(exp.id)
        const selectedVersion = exp.versions.find(v => v.id === selectedVersionId) || exp.versions[0]
        return [selectedVersion.title, ...selectedVersion.bullets].join(' ')
      }),
    ].filter(Boolean).join(' ').toLowerCase()

    const beforeCovered = atsKeywords.filter(kw => keywordMatches(kw, originalText))
    const beforeMissing = atsKeywords.filter(kw => !keywordMatches(kw, originalText))
    const beforeScore = calcWeightedScore(originalText)

    console.log('[keywords] hardSkills:', hardSkills)
    console.log('[keywords] businessContext:', businessContext)
    console.log('[keywords] top10:', top10)
    console.log('[keywords] missingKeywords:', beforeMissing)
    console.log('[score] beforeScore:', beforeScore)

    // Step C + D (+ summary when present) in parallel: Bullet rewrite, Skills, Summary
    const summaryVariantKeywords = originalSummary
      ? atsKeywords.filter(kw => {
          const kwLower = kw.toLowerCase()
          const sumLower = originalSummary.toLowerCase()
          return !sumLower.includes(kwLower) && keywordMatches(kw, sumLower)
        })
      : []
    const summaryMissingKeywords = originalSummary
      ? atsKeywords.filter(kw => !keywordMatches(kw, originalSummary.toLowerCase()))
      : []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const round2Tasks: Promise<any>[] = [
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildBulletRewritePrompt(jdText, jdReportForBullets, experiencesWithBullets) }],
        response_format: { type: 'json_object' },
        temperature: 0.35,
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildSkillsPrompt(jdText, factBank.skills) }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    ]

    if (originalSummary) {
      round2Tasks.push(
        openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: buildSummaryPrompt(
              jdText,
              originalSummary,
              {
                role: rawReport.role || '',
                titleKeywords: titleFunction,
                hardSkills,
                businessContext,
                top10,
              },
              selectedTitles,
              summaryMissingKeywords,
              summaryVariantKeywords,
            ),
          }],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      )
    }

    const round2Results = await Promise.all(round2Tasks)
    const bulletRewriteCompletion = round2Results[0]
    const skillsCompletion = round2Results[1]
    const summaryCompletion = originalSummary ? round2Results[2] : null

    const bulletResult = JSON.parse(bulletRewriteCompletion.choices[0].message.content || '{}') as {
      experiences: Array<{ experienceId: string; bullets: string[] }>
    }
    console.log('[bullet rewrite result]', JSON.stringify(bulletResult.experiences?.map(e => ({ id: e.experienceId, count: e.bullets?.length, sample: e.bullets?.[0]?.slice(0, 80) }))))
    const bulletMap = new Map(bulletResult.experiences.map(e => [e.experienceId, e.bullets]))
    const scrubPhrases = collectScrubPhrases(rawReport)

    const skillsResult = JSON.parse(skillsCompletion.choices[0].message.content || '{}') as { skills: string[] }

    let tailoredSummary = originalSummary
    if (summaryCompletion) {
      const summaryResult = JSON.parse(summaryCompletion.choices[0].message.content || '{}') as { summary?: string }
      const rawSummary = (summaryResult.summary || originalSummary).trim()
      tailoredSummary = preserveSummaryMetrics(originalSummary, rawSummary)
    }

    // Assemble generated resume
    const generatedExperiences: GeneratedExperience[] = resumeExperiences.map(exp => {
      const selectedVersionId = versionMap.get(exp.id)
      const selectedVersion = exp.versions.find(v => v.id === selectedVersionId) || exp.versions[0]
      const sourceBullets = selectedVersion.bullets.filter(b => b.trim())
      const rawBullets = bulletMap.get(exp.id) || sourceBullets
      const minBullets = recommendedMinBullets(estimateTenureYears(exp), sourceBullets.length)
      const bullets = applyBulletFidelity(sourceBullets, rawBullets, scrubPhrases, minBullets)
      return {
        company: exp.company,
        title: selectedVersion.title,
        location: exp.location,
        startDate: exp.startDate,
        endDate: exp.endDate,
        bullets,
        pdfRoleSkillsLine: exp.pdfRoleSkillsLine?.trim(),
        pdfEmploymentType: exp.pdfEmploymentType?.trim(),
        pdfPageBreakBeforeBulletIndex: exp.pdfPageBreakBeforeBulletIndex,
      }
    })

    // Calculate AFTER score (include summary + titles + bullets + skills)
    const resumeText = [
      tailoredSummary,
      (factBank.contact.headline || '').trim(),
      ...generatedExperiences.map(e => e.title),
      ...generatedExperiences.flatMap(e => e.bullets),
      ...(skillsResult.skills || factBank.skills),
    ].filter(Boolean).join(' ').toLowerCase()

    const covered = atsKeywords.filter(kw => keywordMatches(kw, resumeText))
    const missing = atsKeywords.filter(kw => !keywordMatches(kw, resumeText))
    const afterScore = calcWeightedScore(resumeText)
    const hardSkillsMissing = hardSkills.filter(kw => !keywordMatches(kw, resumeText))

    // Build final JD report with gap analysis
    const jdReport: JDReport = {
      ...rawReport,
      alreadyHave: covered,
      needToAdd: missing,
    }

    const contactForResume = resolveContactHeadline(factBank.contact, tailoredSummary)

    let resume: GeneratedResume = {
      contact: contactForResume,
      summary: tailoredSummary,
      education: factBank.education,
      skills: skillsResult.skills || factBank.skills,
      experiences: generatedExperiences,
      projects: factBank.projects?.length ? factBank.projects : undefined,
      jdKeywordCoverage: {
        covered, missing, beforeCovered, beforeMissing,
        hardSkillsMissing, score: afterScore, beforeScore,
      },
      jdReport,
    }

    // Two-page max: render and trim experience bullets if content exceeds 2 pages
    let pageCount = await countPDFPages(resume)
    let iterations = 0
    const maxIterations = 15
    const maxPages = 2

    while (pageCount > maxPages && iterations < maxIterations) {
      iterations++

      const perExp = resume.experiences
        .map((exp, expIdx) => {
          if (exp.bullets.length <= 1) return null
          let lowestScore = Infinity
          let lowestBulletIdx = -1
          exp.bullets.forEach((bullet, j) => {
            const score = hardSkills.filter(kw => bullet.toLowerCase().includes(kw.toLowerCase())).length * 2
              + businessContext.filter(kw => bullet.toLowerCase().includes(kw.toLowerCase())).length
            if (score < lowestScore) { lowestScore = score; lowestBulletIdx = j }
          })
          if (lowestBulletIdx === -1) return null
          return { expIdx, bulletIdx: lowestBulletIdx, score: lowestScore }
        })
        .filter(Boolean) as Array<{ expIdx: number; bulletIdx: number; score: number }>

      if (perExp.length === 0) break

      const oldest = perExp[perExp.length - 1]
      const newest = perExp[0]
      const toRemove = (perExp.length > 1 && oldest.score > newest.score + 1) ? newest : oldest

      resume = {
        ...resume,
        experiences: resume.experiences.map((exp, i) =>
          i === toRemove.expIdx
            ? { ...exp, bullets: exp.bullets.filter((_, j) => j !== toRemove.bulletIdx) }
            : exp
        ),
      }

      pageCount = await countPDFPages(resume)
    }

    return NextResponse.json({ resume })
  } catch (err) {
    console.error('Generate resume error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
