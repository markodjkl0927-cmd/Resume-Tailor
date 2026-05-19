import { Experience } from './types'

export function buildParsePrompt(text: string, filename: string): string {
  return `You are a resume parser. Extract structured data from the resume text below and return valid JSON.

RESUME TEXT (from file: ${filename}):
${text}

Return JSON with this exact structure:
{
  "contact": {
    "name": "",
    "headline": "",
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
- CONTACT: For linkedin, extract only the profile slug or full URL. Same for github. If a field is absent, use "". For "headline": the professional title line directly under the candidate name on its own line (e.g. "Senior Full Stack | AI Engineer"). Must NOT include city, phone, or email — those belong in location/phone/email. If absent, use "".
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
  jdText: string,
  jdReport: {
    role: string
    top10: string[]
    titleKeywords: string[]
    hardSkills: string[]
    businessContext: string[]
    actionKeywords: string[]
  },
  experiencesWithBullets: Array<{
    experienceId: string
    company: string
    title: string
    dates: string
    tenureYears: number | null
    sourceBulletCount: number
    numberedBullets: string
  }>
): string {
  const expBlocks = experiencesWithBullets.map(e => {
    const tenureHint = e.tenureYears != null ? `~${e.tenureYears.toFixed(1)} years` : 'tenure unclear'
    return `EXPERIENCE: ${e.company} | ${e.title} | ${e.dates} (${tenureHint}, ${e.sourceBulletCount} source bullets) (id: ${e.experienceId})\nSOURCE BULLETS:\n${e.numberedBullets}`
  }).join('\n\n')

  return `You are a professional resume writer tailoring WORK EXPERIENCE for a specific job. Rewrite bullets so they read like strong, recruiter-ready achievements — not a task log.

JOB DESCRIPTION:
${jdText.slice(0, 3000)}

TARGET ROLE: ${jdReport.role || '(see JD)'}

JD LANGUAGE TO MIRROR (use exact phrasing from the JD where truthful):
- Top priorities: ${(jdReport.top10 || []).join(', ') || '(none)'}
- Title / function: ${(jdReport.titleKeywords || []).join(', ') || '(none)'}
- Hard skills / tools: ${(jdReport.hardSkills || []).join(', ') || '(none)'}
- Business context: ${(jdReport.businessContext || []).join(', ') || '(none)'}
- Action phrases from JD: ${(jdReport.actionKeywords || []).join(', ') || '(none)'}

TAILORING RULES (follow all):

1) MIRROR JD LANGUAGE (truthful only)
- Use the JD's exact phrases ONLY when the SOURCE BULLETS for that role already prove that work (same domain, tools, or outcomes).
- Prefer technical phrases (Python, React, CI/CD, LangChain, REST APIs) over employer marketing language from the JD.
- NEVER paste employer-specific or industry jargon into a role unless that role's source bullets mention it (e.g. do NOT add "incident response", "cyber incident", "client-centric approach", or "IR workflows" to an AI evaluation role unless the source says so).
- Do NOT repeat the same JD phrase in more than one bullet for the same role.

2) PRIORITIZE AND CUT
- Drop routine duties, outdated tools, and bullets irrelevant to this JD — but long roles need enough depth.
- Bullet targets by tenure (use the dates on each EXPERIENCE line):
  • ~4+ years in role: keep **5–7** tailored bullets when the source has 5+ bullets
  • ~2–3 years: keep **4–6** bullets
  • Under ~2 years or very few source bullets: keep **3–4** (never 0; never more than the source count)
- REORDER bullets within each role: most relevant accomplishments and JD-aligned skills FIRST (recruiters read top-down).

3) ACHIEVEMENTS OVER DUTIES
- Replace generic duty lines with impact-focused bullets.
- Structure: strong action verb + what you did + outcome when the source provides it.
- Example direction: "Managed social media" → "Developed and executed targeted social campaigns, increasing engagement [use source metrics only]."
- Lead with verbs like Led, Built, Delivered, Improved, Reduced, Scaled — match the JD's tone.

4) PRESERVE METRICS (mandatory)
- If a source bullet contains a number, percentage, latency/performance figure, or quantified outcome, that metric MUST appear in the tailored set for that role (same role's output bullets).
- Do NOT drop metrics when shortening bullets — shorten other words instead.
- NEVER invent new numbers; only preserve or lightly rephrase metrics already in the source.

5) STAR (when rewriting weak bullets)
- Implicitly cover Situation/Task in one short clause if needed, then Action and Result.
- Use numbers, %, revenue, time saved ONLY if they appear in the source bullets — NEVER invent metrics.

6) TRUTH AND ATS
- NEVER fabricate employers, titles, tools, projects, or achievements not supported by the source bullets.
- Do NOT claim tools/skills (Terraform, Kubernetes, MCP, GitHub Actions, AWS ownership) unless the source bullets for that role mention them.
- You may rephrase, merge, or split bullets; you may drop weak bullets.
- NEVER end a bullet with a period.
- One line per bullet when possible; two lines max for dense accomplishments.

${expBlocks}

Return JSON only (no markdown):
{
  "experiences": [
    {
      "experienceId": "...",
      "bullets": ["most relevant bullet first", "..."]
    }
  ]
}`
}

export function buildAggressiveBulletRewritePrompt(
  jdText: string,
  jdReport: {
    role: string
    top10: string[]
    titleKeywords: string[]
    hardSkills: string[]
    businessContext: string[]
    actionKeywords: string[]
  },
  missingBusinessContext: string[],
  missingHardSkills: string[],
  experiencesWithBullets: Array<{
    experienceId: string
    company: string
    title: string
    dates: string
    numberedBullets: string
  }>
): string {
  const expBlocks = experiencesWithBullets.map(e =>
    `EXPERIENCE: ${e.company} | ${e.title} | ${e.dates} (id: ${e.experienceId})\nCURRENT BULLETS:\n${e.numberedBullets}`
  ).join('\n\n')

  return `You are doing a second-pass BOOST on an already tailored resume. Push ATS keyword coverage while keeping achievement-style bullets.

JOB DESCRIPTION (excerpt):
${jdText.slice(0, 2000)}

TARGET ROLE: ${jdReport.role || '(see JD)'}

TOP 10 JD KEYWORDS: ${(jdReport.top10 || []).join(', ')}

STILL APPLY:
- Achievement-focused bullets (action verb + impact); STAR-style when helpful
- Most relevant bullets first within each role
- Mirror JD exact phrasing ONLY where that role's CURRENT bullets already support it
- PRESERVE every metric (%, numbers, performance outcomes) from the current bullets — do not remove them
- NEVER add employer/industry jargon (cyber IR, client-centric, incident response) unless already in that role's bullets
- NEVER fabricate metrics, tools, or employers
- NEVER end bullets with a period
- 4–7 bullets for 4+ year roles; 4–6 for 2–3 years; drop only weak/irrelevant lines

BOOST (more aggressive than first pass):
- Work in MISSING business context keywords below only when the bullet's existing work topic matches — do not add fake facts or unrelated domain language
- Work in MISSING hard skills ONLY where the bullet already proves that skill

MISSING BUSINESS CONTEXT: ${missingBusinessContext.length > 0 ? missingBusinessContext.join(', ') : '(none)'}
MISSING HARD SKILLS (evidence required): ${missingHardSkills.length > 0 ? missingHardSkills.join(', ') : '(none)'}

${expBlocks}

Return JSON only:
{
  "experiences": [
    { "experienceId": "...", "bullets": ["..."] }
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
- Consolidate into exactly 2–3 compact groups (merge related categories; avoid sparse lines with only 1–2 skills)
- Put JD-relevant skills first within each group
- Format each group as: "CategoryName: skill1, skill2, skill3"
- Add JD tools (e.g. Terraform, Kubernetes, MCP) ONLY if they appear in the candidate's raw skills or are clearly implied by listed experience — do NOT invent skills to match the JD
- Do NOT add employer-specific domain buzzwords (e.g. incident response, cyber resilience) to the skills section unless the candidate already listed them

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
6. METRICS: Keep every number, percentage, and quantified outcome from the ORIGINAL SUMMARY — do not remove them when editing.
7. DOMAIN LANGUAGE: Do NOT add employer-specific or industry jargon from the JD (e.g. cyber incident, incident response, client-centric) unless the original summary already uses that domain.
8. ALIGNMENT: Gently align opening line with the JD role (${jdReport.role || 'target role'}) and selected titles — without changing seniority, years, or employers the candidate did not state.
9. NEVER fabricate employers, titles, years, tools, degrees, metrics, or achievements not implied by the original summary or selected titles.
10. No bullet points. Plain prose only. No trailing period required on the last sentence (match original style).

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

  return `The resume is too long and needs to be trimmed to fit two pages.

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
