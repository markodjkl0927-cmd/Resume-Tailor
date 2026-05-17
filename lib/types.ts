export interface Version {
  id: string
  title: string
  bullets: string[]
  sourceFile?: string
}

export interface Experience {
  id: string
  company: string
  location: string
  startDate: string
  endDate: string
  /** Shown after role bullets on PDF (optional), e.g. "Python, SQL, GCP" */
  pdfRoleSkillsLine?: string
  /** E.g. Freelance, Contract, Full-time */
  pdfEmploymentType?: string
  /** Inserts PDF page break before this bullet index (0-based); optional tuning */
  pdfPageBreakBeforeBulletIndex?: number
  versions: Version[]
}

export interface Education {
  id: string
  school: string
  location: string
  degree: string
  field: string
  startDate: string
  endDate: string
  notes: string[]
}

export interface Contact {
  name: string
  headline: string
  email: string
  phone: string
  location: string
  linkedin: string
  github: string
  website: string
}

export interface Project {
  id: string
  name: string
  startDate: string
  endDate: string
  bullets: string[]
}

export interface FactBank {
  contact: Contact
  summary: string
  experiences: Experience[]
  education: Education[]
  skills: string[]
  projects?: Project[]
}

export interface GeneratedExperience {
  company: string
  title: string
  location: string
  startDate: string
  endDate: string
  bullets: string[]
  pdfRoleSkillsLine?: string
  pdfEmploymentType?: string
  pdfPageBreakBeforeBulletIndex?: number
}

export interface JDReport {
  role: string
  company: string
  titleKeywords: string[]
  hardSkills: string[]
  actionKeywords: string[]
  businessContext: string[]
  domainKeywords: string[]
  hardFilters: string[]
  top10: string[]
  alreadyHave: string[]
  needToAdd: string[]
}

export interface GeneratedResume {
  contact: Contact
  summary: string
  education: Education[]
  skills: string[]
  experiences: GeneratedExperience[]
  projects?: Project[]
  jdKeywordCoverage: {
    covered: string[]
    missing: string[]
    beforeCovered: string[]
    beforeMissing: string[]
    hardSkillsMissing: string[]
    score: number
    beforeScore: number
  }
  jdReport: JDReport
}
