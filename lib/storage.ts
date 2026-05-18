import { FactBank } from './types'
import { resolveContactHeadline } from './contact-headline'

const STORAGE_KEY = 'resume_builder_factbank'

const EMPTY_FACTBANK: FactBank = {
  contact: { name: '', headline: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' },
  summary: '',
  experiences: [],
  education: [],
  skills: [],
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Migrate legacy data: rename frames → versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(fb: any): FactBank {
  if (!fb) return EMPTY_FACTBANK
  if (typeof fb.summary !== 'string') fb.summary = ''
  if (fb.contact && typeof fb.contact.headline !== 'string') fb.contact.headline = ''
  if (!fb?.experiences) return fb as FactBank
  fb.experiences = fb.experiences.map((exp: any) => {
    if (exp.frames && !exp.versions) {
      exp.versions = exp.frames
      delete exp.frames
    }
    if (!exp.versions) exp.versions = []
    return exp
  })
  const bank = fb as FactBank
  bank.contact = resolveContactHeadline(bank.contact, bank.summary || '')
  return bank
}

export function loadFactBank(): FactBank {
  if (typeof window === 'undefined') return EMPTY_FACTBANK
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_FACTBANK
    return migrate(JSON.parse(raw))
  } catch {
    return EMPTY_FACTBANK
  }
}

export function saveFactBank(fb: FactBank): void {
  if (typeof window === 'undefined') return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fb))
  }, 1000)
}

export function exportFactBank(fb: FactBank): void {
  const blob = new Blob([JSON.stringify(fb, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'factbank.json'
  a.click()
  URL.revokeObjectURL(url)
}

export function importFactBank(file: File): Promise<FactBank> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const fb = JSON.parse(e.target?.result as string) as FactBank
        resolve(fb)
      } catch {
        reject(new Error('Invalid JSON file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
