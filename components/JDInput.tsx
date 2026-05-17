'use client'

import { useState, useEffect, useRef } from 'react'
import { FactBank, GeneratedResume } from '@/lib/types'

interface Props {
  factBank: FactBank
  onGenerated: (resume: GeneratedResume, jdText: string) => void
}

type InputMode = 'url' | 'text'

export default function JDInput({ factBank, onGenerated }: Props) {
  const [mode, setMode] = useState<InputMode>('url')
  const [url, setUrl] = useState('')
  const [jdText, setJdText] = useState('')
  const [loading, setLoading] = useState<'scraping' | 'generating' | null>(null)
  const [error, setError] = useState('')
  const [scrapedText, setScrapedText] = useState('')
  const [activeStep, setActiveStep] = useState(0)
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  async function scrapeURL() {
    if (!url.trim()) return
    setLoading('scraping')
    setError('')
    try {
      const res = await fetch('/api/scrape-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        if (!data.isLinkedIn) {
          setMode('text')
        }
        return
      }
      setScrapedText(data.jdText)
    } finally {
      setLoading(null)
    }
  }

  async function generate() {
    const text = mode === 'url' ? scrapedText : jdText
    if (!text.trim()) {
      setError('Please provide a job description first')
      return
    }
    if (!factBank.experiences.length) {
      setError('Your Fact Bank is empty. Please upload at least one resume first.')
      return
    }

    setLoading('generating')
    setActiveStep(0)
    setError('')
    stepTimers.current.forEach(t => clearTimeout(t))
    stepTimers.current = [
      setTimeout(() => setActiveStep(1), 4000),
      setTimeout(() => setActiveStep(2), 9000),
      setTimeout(() => setActiveStep(3), 16000),
    ]
    try {
      const res = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factBank, jdText: text }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      onGenerated(data.resume, text)
    } finally {
      setLoading(null)
      stepTimers.current.forEach(t => clearTimeout(t))
      setActiveStep(0)
    }
  }

  const isLoading = loading !== null
  const activeText = mode === 'url' ? scrapedText : jdText

  return (
    <div className="space-y-5">
      <div>
        <h2 style={{ fontFamily: 'Syne', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: '4px' }}>Job Description</h2>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '13px' }}>Paste a job posting URL or the full JD text</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: '1px solid var(--border)' }}>
        <button
          onClick={() => setMode('url')}
          className="px-4 py-1.5 text-sm transition-colors"
          style={mode === 'url'
            ? { background: 'var(--ink)', color: 'var(--surface)', fontFamily: 'Syne', fontWeight: 600 }
            : { background: 'var(--surface-2)', color: 'var(--text-muted)', fontFamily: 'Instrument Sans' }}
        >URL</button>
        <button
          onClick={() => setMode('text')}
          className="px-4 py-1.5 text-sm transition-colors"
          style={mode === 'text'
            ? { background: 'var(--ink)', color: 'var(--surface)', fontFamily: 'Syne', fontWeight: 600 }
            : { background: 'var(--surface-2)', color: 'var(--text-muted)', fontFamily: 'Instrument Sans' }}
        >Paste Text</button>
      </div>

      {mode === 'url' ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="input-field flex-1"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isLoading && scrapeURL()}
              placeholder="https://boards.greenhouse.io/company/jobs/123..."
              disabled={isLoading}
            />
            <button
              onClick={scrapeURL}
              disabled={isLoading || !url.trim()}
              className="btn-primary whitespace-nowrap"
            >
              {loading === 'scraping' ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-stone-900/50 border-t-stone-900 rounded-full animate-spin" />
                  Fetching...
                </span>
              ) : 'Fetch JD'}
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'Instrument Sans' }}>
            Works with: Greenhouse, Lever, company career pages · LinkedIn requires manual paste · <strong>Always verify fetched JD looks correct — if not, paste text directly</strong>
          </p>
          {scrapedText && (
            <div className="rounded-lg p-3" style={{ background: 'var(--green-dim)', border: '1px solid var(--green-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                  <span className="text-xs font-bold" style={{ color: 'var(--green)', fontFamily: 'Instrument Sans' }}>JD fetched — please verify content carefully</span>
                </div>
              </div>
              <textarea
                className="w-full resize-none"
                rows={10}
                value={scrapedText}
                onChange={e => setScrapedText(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-muted)',
                  fontFamily: 'DM Mono',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  width: '100%',
                  cursor: 'text',
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <textarea
          className="input-field w-full resize-none font-mono text-xs"
          rows={12}
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          placeholder="Paste the full job description here..."
          disabled={isLoading}
        />
      )}

      {error && (
        <div className="rounded-lg p-3" style={{ background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
          <p className="text-sm" style={{ color: 'var(--red)', fontFamily: 'Instrument Sans' }}>{error}</p>
        </div>
      )}

      <button
        onClick={generate}
        disabled={isLoading || !activeText.trim() || !factBank.experiences.length}
        className="btn-primary w-full flex items-center justify-center gap-3"
        style={{ padding: '14px 20px', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', borderRadius: '10px' }}
      >
        {loading === 'generating' ? (
          <>
            <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            <span>Generating tailored resume...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate Resume
          </>
        )}
      </button>

      {loading === 'generating' && (
        <div className="space-y-2.5">
          {[
            'Selecting best title version for each experience...',
            'Analyzing JD keywords...',
            'Rewriting bullets with JD keywords...',
            'Fitting to two pages...',
          ].map((label, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs" style={{ color: i <= activeStep ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'Instrument Sans', transition: 'color 0.4s' }}>
              <span
                className={i === activeStep ? 'animate-pulse' : ''}
                style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: i < activeStep ? 'var(--green)' : i === activeStep ? 'var(--green)' : 'var(--border-2)',
                  transition: 'background 0.4s',
                }}
              />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
