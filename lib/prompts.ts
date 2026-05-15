import { Experience } from './types'

export function buildParsePrompt(text: string, filename: string): string {
  return `You are a resume parser. Extract structured data from the resume text below and return valid JSON.

RESUME TEXT (from file: ${filename}):
${text}

Return JSON with this exact structure:
{
  "contact": {
    "name": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": "",
    "website": ""
  },
  "experiences": [
    {
      "company": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "title": "",
      "bullets": ["..."]
    }
  ],
  "education": [
    {
      "school": "",
      "location": "",
      "degree": "",
      "field": "",
      "startDate": "",
      "endDate": "",
      "notes": []
    }
  ],
  "summary": "",
  "skills": ["Category: skill1, skill2"],
  "projects": [
    {
      "name": "",
      "startDate": "",
      "endDate": "",
      "bullets": ["..."]
    }
  ]
}

Parsing rules:
- EXPERIENCES: Extract every work experience, internship, freelance role, and volunteer position. Each role is one object. If someone held multiple titles at the same company, create one experience object per title (they will be merged automatically). Copy bullets verbatim — do not paraphrase, summarize, or rephrase.
- PROJECTS: Extract all personal, academic, or side projects from sections labeled "Projects", "Academic Projects", "Personal Projects", or similar. Each project is one object. startDate and endDate may be empty strings if not stated. Copy bullets verbatim.
- SUMMARY: Extract text from Summary, Professional Summary, Profile, or Objective sections into "summary" as a single string. Copy verbatim — do not paraphrase. Join multiple lines with a single space. Use "" if absent. Do not put summary text into experience bullets.
- BULLETS: Only include actual bullet points or responsibility statements from the Experience or Project section. Never put summary or profile text here.
- DATES: Use the exact format written in the resume (e.g. "Jan 2022", "2020", "Present", "Current"). Use "" if absent.
- SKILLS: Flatten all skills into an array of strings. If the resume has skill categories (e.g. "Languages: Python, SQL"), preserve as "Languages: Python, SQL". If uncategorized, use "Skills: skill1, skill2".
- EDUCATION: Include all degrees, certifications, and bootcamps. Put honors, GPA, or relevant coursework in notes[].
- CONTACT: For linkedin, extract only the profile slug or full URL. Same for github. If a field is absent, use "".
- If the resume has no projects section, return "projects": [].
- If the resume text is garbled, poorly formatted, or has OCR artifacts, do your best to extract what you can.`
}

export function buildVersionSelectionPrompt(
  jdText: string,
  experiences: Experience[]
): string {
  const expSummary = experiences.map(exp => ({
    id: exp.id,
    company: exp.company,
    versions: exp.versions.map(v => ({
      id: v.id,
      title: v.title,
    }))
  }))

  return `You are a senior recruiter selecting the best job title version for each work experience to maximize a candidate's fit for a specific role.

JOB DESCRIPTION:
${jdText.slice(0, 3000)}

CANDIDATE'S EXPERIENCES WITH AVAILABLE VERSIONS:
${JSON.stringify(expSummary, null, 2)}

Your task — select the single best Version title for each experience.

Rule: Pick the Version whose title a recruiter hiring for this JD would find most relevant.
- Selection is based ENTIRELY on title function match — do NOT consider bullet content
- Choose the title that is closest in job function to the JD's primary role
- "Closest" means same functional family, not necessarily exact wording:
  • For a Product Manager JD: "Product Manager" > "Project Manager" > "Data Analyst" > "Risk Analytics"
  • For a Data Analyst JD: "Risk Data Analytics" > "Project Manager" > "Product Manager"
  • "Cofounder | Product" = product management function
- If no title closely matches the JD function, pick the one with the most transferable skills for that function

Return JSON:
{
  "jdFunction": "...",
  "jdSeniority": "...",
  "selections": [
    { "experienceId": "...", "selectedVersionId": "...", "reason": "one sentence why" }
  ]
}`
}

export function buildJDReportPrompt(jdText: string): string {
  return `You are an expert ATS analyst. Analyze this job description and extract structured keyword data.

JOB DESCRIPTION:
${jdText.slice(0, 3000)}

Extract keywords into these categories. Use EXACT phrasing from the JD. Do NOT include generic soft skills (communication, collaboration, teamwork — these have no ATS value).

Return JSON:
{
  "role": "job title from JD",
  "company": "company name if mentioned, else empty string",
  "titleKeywords": ["exact job title", "close variants", "function words — max 4"],
  "hardSkills": ["tools, software, languages, platforms, technical methods, A/B testing — max 12"],
  "actionKeywords": ["verb + object phrases from Responsibilities section, e.g. 'drive cross-functional execution' — max 8"],
  "businessContext": ["business scenarios and domain concepts, e.g. 'roadmap', 'stakeholder management', 'product launch' — max 10"],
  "domainKeywords": ["industry/domain words, e.g. 'SaaS', 'B2B', 'fintech' — max 5"],
  "hardFilters": ["explicit requirements, e.g. '3+ years', 'Bachelor degree', 'SQL required' — max 6"],
  "top10": ["the 10 most important keywords a recruiter would search for, ranked by importance"]
}`
}

export function buildBulletRewritePrompt(
  top10Keywords: string[],
  variantKeywords: string[],
  missingKeywords: string[],
  experiencesWithNumberedBullets: Array<{
    experienceId: string
    company: string
    numberedBullets: string
  }>
): string {
  const expBlocks = experiencesWithNumberedBullets.map(e =>
    `EXPERIENCE: ${e.company} (id: ${e.experienceId})\nBULLETS:\n${e.numberedBullets}`
  ).join('\n\n')

  return `You are optimizing resume bullet points for ATS (Applicant Tracking System) compatibility using MINIMAL changes.

GOAL: Maximize keyword match with the job description while preserving the original bullet quality as much as possible.

TOP 10 JD KEYWORDS (most important for this role):
${top10Keywords.join(', ')}

RULES (follow in strict order):
1. RETURN UNCHANGED: Any bullet that does not need a keyword change — copy it EXACTLY character-for-character. Do not rephrase, reorder, or improve it.
2. VARIANT FIX: If a bullet contains a variant form of a keyword (e.g. "A/B testing" when JD says "A/B test", or "managing" when JD says "management") — replace ONLY that word/phrase with the JD's exact phrasing. Change absolutely nothing else in that bullet.
3. KEYWORD INSERT: For MISSING keywords only — find the single most relevant bullet and insert the keyword naturally with the absolute minimum edit. If no bullet can naturally accept the keyword, skip it. Do NOT force awkward insertions.
4. NEVER fabricate facts, numbers, company names, tools, or any detail not in the original bullet.
5. NEVER end any bullet with a period.
6. Return the EXACT SAME NUMBER of bullets for each experience — do not merge, split, or drop any bullet.

VARIANT KEYWORDS — find the variant form in the bullets and replace with this exact JD phrasing:
${variantKeywords.length > 0 ? variantKeywords.join(', ') : '(none)'}

MISSING KEYWORDS — not present at all, insert naturally where possible:
${missingKeywords.length > 0 ? missingKeywords.join(', ') : '(none)'}

${expBlocks}

Return JSON (no markdown, no code blocks, just raw JSON):
{
  "experiences": [
    {
      "experienceId": "...",
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ]
}`
}

export function buildAggressiveBulletRewritePrompt(
  top10Keywords: string[],
  missingBusinessContext: string[],
  missingHardSkills: string[],
  experiencesWithNumberedBullets: Array<{
    experienceId: string
    company: string
    numberedBullets: string
  }>
): string {
  const expBlocks = experiencesWithNumberedBullets.map(e =>
    `EXPERIENCE: ${e.company} (id: ${e.experienceId})\nBULLETS:\n${e.numberedBullets}`
  ).join('\n\n')

  return `You are optimizing resume bullet points for maximum ATS keyword coverage.

TOP 10 JD KEYWORDS:
${top10Keywords.join(', ')}

RULES:
1. RETURN UNCHANGED: Any bullet that does not need changes — copy EXACTLY.
2. BUSINESS CONTEXT KEYWORDS — these are general PM/business concepts (e.g. NPS, feature development, friction points, consumer experiences). For each one, find the most relevant bullet and work it in naturally. Be proactive — if a bullet is about the same topic, add the keyword even if it requires a small rewrite of that phrase. Do NOT fabricate metrics or company-specific facts.
3. HARD SKILLS KEYWORDS — only insert if the bullet already demonstrates use of that skill. Do not add a tool the candidate clearly didn't use.
4. NEVER fabricate numbers, company names, or specific achievements not in the original.
5. NEVER end any bullet with a period.
6. Return the EXACT SAME NUMBER of bullets per experience.

MISSING BUSINESS CONTEXT KEYWORDS (insert proactively):
${missingBusinessContext.length > 0 ? missingBusinessContext.join(', ') : '(none)'}

MISSING HARD SKILLS (insert only where evidenced):
${missingHardSkills.length > 0 ? missingHardSkills.join(', ') : '(none)'}

${expBlocks}

Return JSON (no markdown, no code blocks, just raw JSON):
{
  "experiences": [
    {
      "experienceId": "...",
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ]
}`
}

export function buildSkillsBoostPrompt(
  currentSkills: string[],
  missingKeywords: string[]
): string {
  return `You are adding missing ATS keywords into an existing resume skills section.

CURRENT SKILLS:
${currentSkills.join('\n')}

MISSING KEYWORDS TO ADD:
${missingKeywords.join(', ')}

RULES:
- Add each missing keyword to the most relevant existing skill category
- If no existing category fits, add a new category line
- Keep EVERY existing skill — do not remove or modify existing content
- Format: "CategoryName: skill1, skill2, skill3"
- Keep to 2-4 total skill lines
- If a keyword is a business concept, outcome, or process (not a tool, technology, or methodology), do NOT add it to skills — skip it entirely

Return JSON (no markdown):
{
  "skills": ["CategoryName: skill1, skill2", ...]
}`
}

export function buildSkillsPrompt(
  jdText: string,
  rawSkills: string[]
): string {
  return `You are organizing skills for a resume based on a job description.

JOB DESCRIPTION (excerpt):
${jdText.slice(0, 1500)}

CANDIDATE'S RAW SKILLS:
${rawSkills.join('\n')}

Task:
- Keep EVERY skill from the candidate's list — do NOT omit any skill
- Consolidate into exactly 2–3 groups (merge related categories together to save space)
- Put JD-relevant skills first within each group
- Format each group as: "CategoryName: skill1, skill2, skill3"

Return JSON (no markdown):
{
  "skills": [
    "CategoryName: skill1, skill2",
    "CategoryName: skill3, skill4"
  ]
}`
}

export function buildSummaryPrompt(
  jdText: string,
  originalSummary: string,
  jdReport: {
    role: string
    titleKeywords: string[]
    hardSkills: string[]
    businessContext: string[]
    top10: string[]
  },
  selectedTitles: string[],
  missingKeywords: string[],
  variantKeywords: string[]
): string {
  return `You are tailoring a resume SUMMARY for ATS compatibility using MINIMAL changes. This is NOT writing a new summary from scratch — preserve the candidate's voice, facts, metrics, and structure.

JOB DESCRIPTION (excerpt):
${jdText.slice(0, 2000)}

TARGET ROLE FROM JD: ${jdReport.role || '(see JD)'}

TITLES SELECTED FOR THIS APPLICATION:
${selectedTitles.length > 0 ? selectedTitles.join('\n') : '(none)'}

ORIGINAL SUMMARY (tailor this — do not replace unless necessary):
${originalSummary}

TOP 10 JD KEYWORDS:
${(jdReport.top10 || []).join(', ')}

TITLE / FUNCTION KEYWORDS:
${(jdReport.titleKeywords || []).join(', ')}

RULES (strict order):
1. PRESERVE: Keep the summary if it already fits the JD well — copy EXACTLY character-for-character when no keyword change is needed.
2. LENGTH: Keep 2–3 concise sentences (roughly 40–70 words). Do not expand into a paragraph.
3. VOICE: No first person — never use "I", "me", "my", or "we". Write in third-person professional style (e.g. "Product Manager with 5 years..." not "I am a Product Manager...").
4. VARIANT FIX: If the summary uses a variant form of a JD keyword (e.g. "A/B testing" vs "A/B test"), replace ONLY that phrase with the JD's exact phrasing.
5. KEYWORD INSERT: For MISSING keywords below, weave in naturally with the smallest possible edit. Prioritize title/function and business context over stuffing hard skills. Skip any keyword that cannot fit without sounding forced or inventing experience.
6. ALIGNMENT: Gently align opening line with the JD role (${jdReport.role || 'target role'}) and selected titles — without changing seniority, years, or employers the candidate did not state.
7. NEVER fabricate employers, titles, years, tools, degrees, metrics, or achievements not implied by the original summary or selected titles.
8. No bullet points. Plain prose only. No trailing period required on the last sentence (match original style).

VARIANT KEYWORDS — replace variant with JD phrasing only:
${variantKeywords.length > 0 ? variantKeywords.join(', ') : '(none)'}

MISSING KEYWORDS — insert naturally where possible:
${missingKeywords.length > 0 ? missingKeywords.join(', ') : '(none)'}

Return JSON (raw JSON only, no markdown):
{
  "summary": "tailored summary text"
}`
}

export function buildTrimPrompt(
  jdText: string,
  atsKeywords: string[],
  experiencesWithBullets: Array<{
    experienceId: string
    company: string
    bullets: string[]
  }>
): string {
  const expBlocks = experiencesWithBullets.map(e =>
    `${e.company} (id: ${e.experienceId}):\n${e.bullets.map((b, i) => `[${i}] ${b}`).join('\n')}`
  ).join('\n\n')

  return `The resume is too long and needs to be trimmed to fit one page.

JD ATS KEYWORDS: ${atsKeywords.join(', ')}

CURRENT BULLETS:
${expBlocks}

Remove the LEAST relevant bullets first (lowest keyword overlap with JD).
- Remove one bullet at a time from the least relevant experience
- Never remove all bullets from an experience
- Return the trimmed result

Return JSON:
{
  "experiences": [
    { "experienceId": "...", "bullets": [...remaining bullets...] }
  ]
}`
}
