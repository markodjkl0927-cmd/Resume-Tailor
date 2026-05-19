import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { GeneratedResume, JDReport } from '@/lib/types'
import {
  buildAggressiveBulletRewritePrompt,
  buildSkillsBoostPrompt,
} from '@/lib/prompts'
import { normalizeBulletText } from '@/lib/bullet-text'
import { applyBulletFidelity, collectScrubPhrases } from '@/lib/bullet-fidelity'
import { jdContextFromReport } from '@/lib/jd-context'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
    const { resume, jdReport }: { resume: GeneratedResume; jdReport: JDReport } = await req.json()

    if (!resume || !jdReport) {
      return NextResponse.json({ error: 'Missing resume or jdReport' }, { status: 400 })
    }

    const missingKeywords = jdReport.needToAdd || []
    const missingBusinessContext = missingKeywords.filter(kw =>
      jdReport.businessContext?.includes(kw) || jdReport.actionKeywords?.includes(kw)
    )
    const missingHardSkills = missingKeywords.filter(kw =>
      jdReport.hardSkills?.includes(kw)
    )

    // Step 1: Run aggressive bullet rewrite first
    const jdText = jdContextFromReport(jdReport)
    const jdReportForBullets = {
      role: jdReport.role || '',
      top10: jdReport.top10 || [],
      titleKeywords: jdReport.titleKeywords || [],
      hardSkills: jdReport.hardSkills || [],
      businessContext: jdReport.businessContext || [],
      actionKeywords: jdReport.actionKeywords || [],
    }

    const experiencesWithBullets = resume.experiences.map(exp => ({
      experienceId: `${exp.company}-${exp.title}`,
      company: exp.company,
      title: exp.title,
      dates: [exp.startDate, exp.endDate].filter(Boolean).join(' – '),
      numberedBullets: exp.bullets.map((b, i) => `[${i + 1}] ${b}`).join('\n'),
    }))

    const bulletCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: buildAggressiveBulletRewritePrompt(
          jdText,
          jdReportForBullets,
          missingBusinessContext,
          missingHardSkills,
          experiencesWithBullets,
        ),
      }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const bulletResult = JSON.parse(bulletCompletion.choices[0].message.content || '{}') as {
      experiences: Array<{ experienceId: string; bullets: string[] }>
    }

    const bulletMap = new Map(bulletResult.experiences.map(e => [e.experienceId, e.bullets]))
    const scrubPhrases = collectScrubPhrases(jdReport)

    const boostedExperiences = resume.experiences.map(exp => {
      const key = `${exp.company}-${exp.title}`
      const sourceBullets = exp.bullets.map(b => normalizeBulletText(b))
      const rawBullets = (bulletMap.get(key) ?? exp.bullets).map(b => normalizeBulletText(b))
      return {
        ...exp,
        bullets: applyBulletFidelity(sourceBullets, rawBullets, scrubPhrases),
      }
    })

    // Step 2: Check which hard skill keywords are STILL missing after bullet rewrite
    const bulletText = [
      (resume.summary || '').trim(),
      (resume.contact.headline || '').trim(),
      ...boostedExperiences.map(e => e.title),
      ...boostedExperiences.flatMap(e => e.bullets),
    ].filter(Boolean).join(' ').toLowerCase()

    const hardSkillsStillMissing = missingHardSkills.filter(kw => !keywordMatches(kw, bulletText))

    // Step 3: Only add to skills the hard skill words that bullet couldn't absorb
    let boostedSkills = resume.skills
    if (hardSkillsStillMissing.length > 0) {
      const skillsCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildSkillsBoostPrompt(resume.skills, hardSkillsStillMissing) }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      })
      const parsed = JSON.parse(skillsCompletion.choices[0].message.content || '{}') as { skills: string[] }
      boostedSkills = parsed.skills || resume.skills
    }

    // Recalculate score
    const allKeywords = [
      ...(jdReport.hardSkills || []),
      ...(jdReport.businessContext || []),
      ...(jdReport.titleKeywords || []),
    ]

    function calcWeightedScore(text: string): number {
      let earned = 0, total = 0
      ;(jdReport.hardSkills || []).forEach(kw => { total += 2; if (keywordMatches(kw, text)) earned += 2 })
      ;(jdReport.titleKeywords || []).forEach(kw => { total += 1.5; if (keywordMatches(kw, text)) earned += 1.5 })
      ;(jdReport.businessContext || []).forEach(kw => { total += 1; if (keywordMatches(kw, text)) earned += 1 })
      return total > 0 ? Math.round(earned / total * 100) : 0
    }

    const boostedText = [
      (resume.summary || '').trim(),
      (resume.contact.headline || '').trim(),
      ...boostedExperiences.map(e => e.title),
      ...boostedExperiences.flatMap(e => e.bullets),
      ...boostedSkills,
    ].filter(Boolean).join(' ').toLowerCase()

    const covered = allKeywords.filter(kw => keywordMatches(kw, boostedText))
    const missing = allKeywords.filter(kw => !keywordMatches(kw, boostedText))
    const hardSkillsMissing = (jdReport.hardSkills || []).filter(kw => !keywordMatches(kw, boostedText))
    const boostedScore = calcWeightedScore(boostedText)

    const boostedResume: GeneratedResume = {
      ...resume,
      experiences: boostedExperiences,
      skills: boostedSkills,
      jdKeywordCoverage: {
        ...resume.jdKeywordCoverage,
        covered,
        missing,
        hardSkillsMissing,
        score: boostedScore,
      },
      jdReport: {
        ...resume.jdReport,
        alreadyHave: covered,
        needToAdd: missing,
      },
    }

    return NextResponse.json({ resume: boostedResume })
  } catch (err) {
    console.error('Boost ATS error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
