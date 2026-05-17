'use client'

import React, { useState, useRef, useEffect } from 'react'
import { GeneratedResume } from '@/lib/types'

interface Props {
  resume: GeneratedResume
  onChange: (r: GeneratedResume) => void
  onDownloaded?: () => void
}

// Editable: uses ref-based DOM updates so hover re-renders never reset typed content
interface EditableProps {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  tag?: 'span' | 'div'
  bold?: boolean // render value with bold category (for skills)
}

function Editable({ value, onChange, style, tag = 'span' }: EditableProps) {
  const elRef = useRef<HTMLElement | null>(null)
  const isEditing = useRef(false)

  // Callback ref: set initial innerHTML on mount
  const mountRef = (el: HTMLElement | null) => {
    elRef.current = el
    if (el && !isEditing.current) {
      el.innerHTML = value
    }
  }

  // Sync external value changes (e.g. delete another row) when not editing
  useEffect(() => {
    if (elRef.current && !isEditing.current) {
      elRef.current.innerHTML = value
    }
  }, [value])

  const sharedProps: React.HTMLAttributes<HTMLElement> = {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onFocus: () => { isEditing.current = true },
    onBlur: (e) => {
      isEditing.current = false
      onChange((e.currentTarget as HTMLElement).innerText.trim())
    },
    style: { outline: 'none', cursor: 'text', ...style },
  }

  if (tag === 'div') {
    return <div ref={el => mountRef(el)} {...sharedProps as React.HTMLAttributes<HTMLDivElement>} />
  }
  return <span ref={el => mountRef(el)} {...sharedProps as React.HTMLAttributes<HTMLSpanElement>} />
}

// SkillEditable: whole skill line is editable including bold category
function SkillEditable({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const isEditing = useRef(false)

  const { category, items } = parseSkillLine(value)
  const html = `<strong>${category}</strong>${items}`

  const mountRef = (el: HTMLDivElement | null) => {
    elRef.current = el
    if (el && !isEditing.current) {
      el.innerHTML = html
    }
  }

  useEffect(() => {
    if (elRef.current && !isEditing.current) {
      elRef.current.innerHTML = html
    }
  }, [html])

  return (
    <div
      ref={el => mountRef(el)}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => { isEditing.current = true }}
      onBlur={e => {
        isEditing.current = false
        onChange((e.currentTarget as HTMLElement).innerText.trim())
      }}
      style={{ flex: 1, outline: 'none', cursor: 'text' }}
    />
  )
}

function parseSkillLine(line: string): { category: string; items: string } {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return { category: '', items: line }
  return { category: line.slice(0, colonIdx + 1), items: line.slice(colonIdx + 1) }
}

// Row with hover-reveal delete button
function Row({ id, hovered, setHovered, onDelete, children, style }: {
  id: string
  hovered: string | null
  setHovered: (v: string | null) => void
  onDelete: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const [btnHot, setBtnHot] = useState(false)
  const isHovered = hovered === id
  return (
    <div
      onMouseEnter={() => setHovered(id)}
      onMouseLeave={() => setHovered(null)}
      style={{ display: 'flex', alignItems: 'flex-start', ...style }}
    >
      {children}
      {isHovered && (
        <button
          onMouseEnter={() => setBtnHot(true)}
          onMouseLeave={() => setBtnHot(false)}
          onClick={onDelete}
          style={{ marginLeft: '5px', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: btnHot ? '#cc2222' : '#aaa', fontSize: '13px', lineHeight: 1.2, padding: '0 2px', fontFamily: 'sans-serif' }}
        >×</button>
      )}
    </div>
  )
}

export default function ResumePreview({ resume, onChange, onDownloaded }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [boosting, setBoosting] = useState(false)
  const [boosted, setBoosted] = useState(false)

  function stem(word: string): string {
    return word
      .replace(/ing$/, '').replace(/tion$/, '').replace(/ment$/, '')
      .replace(/ed$/, '').replace(/er$/, '').replace(/ly$/, '')
      .replace(/s$/, '').replace(/es$/, '')
  }
  function kwMatches(kw: string, text: string): boolean {
    const kwL = kw.toLowerCase()
    if (text.includes(kwL)) return true
    const stemmed = kwL.split(/\s+/).map(stem).join(' ')
    if (text.includes(stemmed)) return true
    return kwL.split(/\s+/).every(w => {
      const ws = stem(w)
      return text.includes(w) || text.split(/\s+/).some(tw => stem(tw) === ws)
    })
  }
  function recalcScore() {
    const rpt = resume.jdReport
    if (!rpt) return
    const text = [
      (resume.contact.headline || '').trim(),
      (resume.summary || '').trim(),
      ...resume.experiences.map(e => e.title),
      ...resume.experiences.flatMap(e => e.bullets),
      ...resume.skills,
    ].filter(Boolean).join(' ').toLowerCase()
    const allKw = [...(rpt.hardSkills || []), ...(rpt.businessContext || []), ...(rpt.titleKeywords || [])]
    let earned = 0, total = 0
    ;(rpt.hardSkills || []).forEach(kw => { total += 2; if (kwMatches(kw, text)) earned += 2 })
    ;(rpt.titleKeywords || []).forEach(kw => { total += 1.5; if (kwMatches(kw, text)) earned += 1.5 })
    ;(rpt.businessContext || []).forEach(kw => { total += 1; if (kwMatches(kw, text)) earned += 1 })
    const score = total > 0 ? Math.round(earned / total * 100) : 0
    const covered = allKw.filter(kw => kwMatches(kw, text))
    const missing = allKw.filter(kw => !kwMatches(kw, text))
    const hardSkillsMissing = (rpt.hardSkills || []).filter(kw => !kwMatches(kw, text))
    onChange({
      ...resume,
      jdKeywordCoverage: { ...resume.jdKeywordCoverage, covered, missing, hardSkillsMissing, score },
      jdReport: { ...rpt, alreadyHave: covered, needToAdd: missing },
    })
  }

  const upContact = (field: keyof typeof resume.contact, v: string) =>
    onChange({ ...resume, contact: { ...resume.contact, [field]: v } })

  const upEdu = (id: string, field: string, v: string) =>
    onChange({ ...resume, education: resume.education.map(e => e.id === id ? { ...e, [field]: v } : e) })

  const upEduNote = (id: string, ni: number, v: string) =>
    onChange({ ...resume, education: resume.education.map(e => e.id === id ? { ...e, notes: e.notes.map((n, i) => i === ni ? v : n) } : e) })

  const deleteEduNote = (id: string, ni: number) =>
    onChange({ ...resume, education: resume.education.map(e => e.id === id ? { ...e, notes: e.notes.filter((_, i) => i !== ni) } : e) })

  const upExp = (idx: number, field: string, v: string) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === idx ? { ...e, [field]: v } : e) })

  const upBullet = (ei: number, bi: number, v: string) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === ei ? { ...e, bullets: e.bullets.map((b, j) => j === bi ? v : b) } : e) })

  const deleteBullet = (ei: number, bi: number) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === ei ? { ...e, bullets: e.bullets.filter((_, j) => j !== bi) } : e) })

  const addBullet = (ei: number) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === ei ? { ...e, bullets: [...e.bullets, ''] } : e) })

  const upSkill = (idx: number, v: string) =>
    onChange({ ...resume, skills: resume.skills.map((s, i) => i === idx ? v : s) })

  const deleteSkill = (idx: number) =>
    onChange({ ...resume, skills: resume.skills.filter((_, i) => i !== idx) })

  const upProj = (idx: number, field: string, v: string) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === idx ? { ...p, [field]: v } : p) })

  const upProjBullet = (pi: number, bi: number, v: string) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === pi ? { ...p, bullets: p.bullets.map((b, j) => j === bi ? v : b) } : p) })

  const deleteProjBullet = (pi: number, bi: number) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === pi ? { ...p, bullets: p.bullets.filter((_, j) => j !== bi) } : p) })

  const addProjBullet = (pi: number) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === pi ? { ...p, bullets: [...p.bullets, ''] } : p) })

  async function downloadPDF() {
    setDownloading(true)
    try {
      const res = await fetch('/api/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume }),
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const namePart = (resume.contact.name || 'Resume').replace(/\s+/g, '')
      const companyPart = (resume.jdReport?.company || '').replace(/\s+/g, '')
      a.download = companyPart ? `${namePart}_${companyPart}.pdf` : `${namePart}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      onDownloaded?.()
    } catch (err) {
      alert(String(err))
    } finally {
      setDownloading(false)
    }
  }

  async function boostATS() {
    if (!resume.jdReport) return
    setBoosting(true)
    try {
      const res = await fetch('/api/boost-ats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, jdReport: resume.jdReport }),
      })
      if (!res.ok) throw new Error('Boost failed')
      const data = await res.json()
      onChange(data.resume)
      setBoosted(true)
    } catch (err) {
      alert(String(err))
    } finally {
      setBoosting(false)
    }
  }

  const { phone, email, linkedin, github, website } = resume.contact

  const afterPct = resume.jdKeywordCoverage.score ?? 0
  const beforePct = resume.jdKeywordCoverage.beforeScore ?? 0
  const improvement = afterPct - beforePct

  function ScoreRing({ pct, color, label }: { pct: number; color: string; label: string }) {
    const r = 32, cx = 42, cy = 42, stroke = 5
    const circ = 2 * Math.PI * r
    const dash = (pct / 100) * circ
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <svg width={84} height={84}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 16, fontWeight: 700, fill: 'var(--text)', fontFamily: 'DM Mono' }}>{pct}%</text>
        </svg>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Instrument Sans', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      </div>
    )
  }

  const rpt = resume.jdReport

  return (
    <div className="flex flex-col h-full">
      {/* ATS Score Card */}
      <div className="mb-4 rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '2px solid var(--ink)', boxShadow: '0 2px 8px oklch(15% 0.010 80 / 0.06)' }}>

        {/* Main row */}
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24 }}>

          {/* Score rings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <ScoreRing pct={beforePct} color="var(--text-dim)" label="Before" />
            <svg width={16} height={16} fill="none" stroke="var(--text-dim)" strokeWidth={2} style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10m-4-4 4 4-4 4" /></svg>
            <ScoreRing pct={afterPct} color="var(--green)" label="After" />
          </div>

          {/* Stats — flex-1 so it occupies middle space */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {improvement > 0 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--green)', fontFamily: 'DM Mono', letterSpacing: '-0.03em', lineHeight: 1 }}>+{improvement}%</span>
                <span style={{ fontSize: 13, color: 'var(--green)', fontFamily: 'Instrument Sans', opacity: 0.75 }}>ATS match improvement</span>
              </div>
            )}
            {resume.jdKeywordCoverage.hardSkillsMissing?.length > 0 && (
              <span style={{ fontSize: 13, color: 'var(--red)', fontFamily: 'Instrument Sans', lineHeight: 1.5 }}>
                ⚠ Missing hard skills: {resume.jdKeywordCoverage.hardSkillsMissing.join(', ')}
              </span>
            )}
            {resume.jdKeywordCoverage.missing.filter(k => !resume.jdKeywordCoverage.hardSkillsMissing?.includes(k)).length > 0 && (
              <span style={{ fontSize: 13, color: 'var(--orange)', fontFamily: 'Instrument Sans', lineHeight: 1.5 }}>
                Missing: {resume.jdKeywordCoverage.missing.filter(k => !resume.jdKeywordCoverage.hardSkillsMissing?.includes(k)).join(', ')}
              </span>
            )}
          </div>

          {/* Action buttons — all same height/font */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {resume.jdReport && (
                <button
                  onClick={recalcScore}
                  style={{ height: 34, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)' }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text-muted)'; el.style.borderColor = 'var(--border)' }}
                >
                  Recalculate
                </button>
              )}
              {!boosted && resume.jdReport?.needToAdd && resume.jdReport.needToAdd.length > 0 && (
                <button
                  onClick={boostATS}
                  disabled={boosting}
                  style={{ height: 34, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)' }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text-muted)'; el.style.borderColor = 'var(--border)' }}
                >
                  {boosting ? (
                    <><span style={{ width: 12, height: 12, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Boosting...</>
                  ) : (
                    <>Boost ATS</>
                  )}
                </button>
              )}
              {boosted && (
                <span style={{ height: 34, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontWeight: 600, fontSize: 13 }}>
                  Boosted
                </span>
              )}
              <button
                onClick={downloadPDF}
                disabled={downloading}
                style={{ height: 34, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontWeight: 600, fontSize: 13, cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.5 : 1, transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { if (!downloading) { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)' } }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text-muted)'; el.style.borderColor = 'var(--border)' }}
              >
                {downloading ? (
                  <><span style={{ width: 12, height: 12, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', opacity: 0.6 }} />Generating...</>
                ) : (
                  <>Download PDF</>
                )}
              </button>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'Instrument Sans' }}>Click to edit · hover row to delete</span>
          </div>
        </div>

        {/* Keyword report toggle — centered pill */}
        {rpt && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 24px', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setShowReport(r => !r)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 20, background: showReport ? 'var(--surface-2)' : 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.01em' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface-2)'; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = showReport ? 'var(--surface-2)' : 'transparent'; el.style.color = 'var(--text-muted)'; el.style.borderColor = 'var(--border)' }}
            >
              <svg width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ transition: 'transform 0.2s', transform: showReport ? 'rotate(180deg)' : 'rotate(0deg)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              {showReport ? 'Hide keyword report' : 'View keyword report'}
            </button>
          </div>
        )}

        {/* JD Keyword Report — expandable */}
        {showReport && rpt && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '20px 24px', display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr 1fr', fontFamily: 'Instrument Sans', fontSize: 13 }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontWeight: 700, marginBottom: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Role</p>
              <p style={{ color: 'var(--text)', lineHeight: 1.6 }}>{rpt.role}{rpt.company ? ` · ${rpt.company}` : ''}</p>
            </div>
            {[
              { label: 'Hard Skills', items: rpt.hardSkills, color: 'var(--red)' },
              { label: 'Business Context', items: rpt.businessContext, color: 'var(--blue)' },
              { label: 'Title / Function', items: rpt.titleKeywords, color: '#7c6fcd' },
              { label: 'Action Keywords', items: rpt.actionKeywords, color: 'var(--text-muted)' },
              { label: 'Domain', items: rpt.domainKeywords, color: 'var(--text-muted)' },
              { label: 'Hard Filters', items: rpt.hardFilters, color: 'var(--orange)' },
            ].map(({ label, items, color }) => items?.length > 0 && (
              <div key={label}>
                <p style={{ color, fontWeight: 700, marginBottom: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{items.join(', ')}</p>
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✓ Top 10</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{rpt.top10?.join(', ')}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✓ Have</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{rpt.alreadyHave?.join(', ') || '—'}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✗ Missing</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{rpt.needToAdd?.join(', ') || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resume */}
      <div className="overflow-auto flex-1">
        <div className="bg-white text-black mx-auto shadow-2xl relative" style={{ width: '816px', minHeight: '2112px', padding: '36px', fontFamily: 'Cambria, "Times New Roman", serif', fontSize: '8.5pt', lineHeight: 1.25, transform: 'scale(1.14)', transformOrigin: 'top center', marginBottom: '148px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '16pt', fontWeight: 400, marginBottom: '4px' }}>
              <Editable value={resume.contact.name} onChange={v => upContact('name', v)} />
            </div>
            <div style={{ fontSize: '12pt', lineHeight: 1.15, marginBottom: '2px', color: '#000' }}>
              <Editable value={resume.contact.headline || ''} onChange={v => upContact('headline', v)} />
            </div>
            <div style={{ fontSize: '10pt', color: '#000', lineHeight: 1.15, display: 'flex', justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                resume.contact.location ? <Editable key="loc" value={resume.contact.location} onChange={v => upContact('location', v)} /> : null,
                phone ? <Editable key="phone" value={phone} onChange={v => upContact('phone', v)} /> : null,
                email ? <a key="email" href={`mailto:${email}`} style={{ color: '#1155CC' }}><Editable value={email} onChange={v => upContact('email', v)} /></a> : null,
                linkedin ? <a key="linkedin" href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`} style={{ color: '#1155CC' }}>LinkedIn</a> : null,
                github ? <a key="github" href={github.startsWith('http') ? github : `https://${github}`} style={{ color: '#1155CC' }}>GitHub</a> : null,
                website ? <a key="website" href={website.startsWith('http') ? website : `https://${website}`} style={{ color: '#1155CC' }}>Website</a> : null,
              ].filter(Boolean).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} style={{ margin: '0 4px' }}>|</span>, el], [])}
            </div>
            <div style={{ borderTop: '1.2px solid #9A9A9A', marginTop: '8px', marginBottom: '20px' }} />
          </div>

          {/* Summary */}
          {(resume.summary || '').trim() && (
            <div style={{ marginTop: '4px', marginBottom: '6px' }}>
              <Editable
                tag="div"
                value={resume.summary}
                onChange={v => onChange({ ...resume, summary: v })}
                style={{ textAlign: 'justify', lineHeight: 1.3 }}
              />
            </div>
          )}

          {/* Skills */}
          {resume.skills.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9pt', borderBottom: '2px solid black', paddingBottom: '1px', marginBottom: '4px' }}>SKILLS</div>
              {resume.skills.map((line, i) => (
                <Row key={i} id={`skill-${i}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteSkill(i)} style={{ marginBottom: '2px' }}>
                  <span style={{ width: '10px', flexShrink: 0, userSelect: 'none' }}>•</span>
                  <SkillEditable value={line} onChange={v => upSkill(i, v)} />
                </Row>
              ))}
              <button
                onClick={() => onChange({ ...resume, skills: [...resume.skills, ''] })}
                style={{ fontSize: '7.5pt', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0 10px' }}
              >+ add skill</button>
            </div>
          )}

          {/* Work Experience */}
          {resume.experiences.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9pt', borderBottom: '2px solid black', paddingBottom: '1px', marginBottom: '4px' }}>WORK EXPERIENCE</div>
              {resume.experiences.map((exp, i) => (
                <div key={i} style={{ marginBottom: '5px' }}>
                  <Row id={`exp-header-${i}`} hovered={hovered} setHovered={setHovered} onDelete={() => onChange({ ...resume, experiences: resume.experiences.filter((_, j) => j !== i) })} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 'bold' }}><Editable value={exp.company} onChange={v => upExp(i, 'company', v)} /></span>
                    <span style={{ fontWeight: 'bold' }}><Editable value={exp.location} onChange={v => upExp(i, 'location', v)} /></span>
                  </Row>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <Editable value={exp.title} onChange={v => upExp(i, 'title', v)} style={{ fontStyle: 'italic' }} />
                    <span style={{ color: '#333' }}>
                      <Editable value={exp.startDate} onChange={v => upExp(i, 'startDate', v)} />
                      {exp.endDate ? <span> – <Editable value={exp.endDate} onChange={v => upExp(i, 'endDate', v)} /></span> : ''}
                    </span>
                  </div>
                  {exp.bullets.map((bullet, j) => (
                    <Row key={j} id={`bullet-${i}-${j}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteBullet(i, j)} style={{ marginBottom: '1.5px' }}>
                      <span style={{ width: '10px', flexShrink: 0, userSelect: 'none' }}>•</span>
                      <Editable value={bullet} onChange={v => upBullet(i, j, v)} style={{ flex: 1, textAlign: 'justify' }} />
                    </Row>
                  ))}
                  <button
                    onClick={() => addBullet(i)}
                    style={{ marginLeft: '10px', marginTop: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '7.5pt', fontFamily: 'Cambria, "Times New Roman", serif', padding: 0 }}
                  >+ add bullet</button>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {(resume.projects || []).length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9pt', borderBottom: '2px solid black', paddingBottom: '1px', marginBottom: '4px' }}>PROJECTS</div>
              {(resume.projects || []).map((proj, pi) => (
                <div key={proj.id} style={{ marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}><Editable value={proj.name} onChange={v => upProj(pi, 'name', v)} /></span>
                    <span style={{ fontWeight: 'bold', color: '#333' }}>
                      {proj.startDate && <Editable value={proj.startDate} onChange={v => upProj(pi, 'startDate', v)} />}
                      {proj.startDate && proj.endDate && <span> – </span>}
                      {proj.endDate && <Editable value={proj.endDate} onChange={v => upProj(pi, 'endDate', v)} />}
                    </span>
                  </div>
                  {proj.bullets.map((bullet, bi) => (
                    <Row key={bi} id={`projbullet-${pi}-${bi}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteProjBullet(pi, bi)} style={{ marginBottom: '1.5px' }}>
                      <span style={{ width: '10px', flexShrink: 0, userSelect: 'none' }}>•</span>
                      <Editable value={bullet} onChange={v => upProjBullet(pi, bi, v)} style={{ flex: 1, textAlign: 'justify' }} />
                    </Row>
                  ))}
                  <button
                    onClick={() => addProjBullet(pi)}
                    style={{ marginLeft: '10px', marginTop: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '7.5pt', fontFamily: 'Cambria, "Times New Roman", serif', padding: 0 }}
                  >+ add bullet</button>
                </div>
              ))}
            </div>
          )}

          {/* Education */}
          {resume.education.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9pt', borderBottom: '2px solid black', paddingBottom: '1px', marginBottom: '4px' }}>EDUCATION</div>
              {resume.education.map((edu) => (
                <div key={edu.id} style={{ marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 'bold' }}><Editable value={edu.school} onChange={v => upEdu(edu.id, 'school', v)} /></span>
                    <span style={{ fontWeight: 'bold' }}><Editable value={edu.location} onChange={v => upEdu(edu.id, 'location', v)} /></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      <em><Editable value={edu.degree} onChange={v => upEdu(edu.id, 'degree', v)} /></em>
                      {edu.field && <span>, <strong><em><Editable value={edu.field} onChange={v => upEdu(edu.id, 'field', v)} /></em></strong></span>}
                    </span>
                    <span style={{ color: '#333' }}>
                      <Editable value={edu.startDate} onChange={v => upEdu(edu.id, 'startDate', v)} />
                      {edu.endDate ? <span> – <Editable value={edu.endDate} onChange={v => upEdu(edu.id, 'endDate', v)} /></span> : ''}
                    </span>
                  </div>
                  {edu.notes?.map((note, ni) => (
                    <Row key={ni} id={`edunote-${edu.id}-${ni}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteEduNote(edu.id, ni)} style={{ marginLeft: '10px' }}>
                      <span style={{ width: '12px', flexShrink: 0, userSelect: 'none' }}>•</span>
                      <Editable value={note} onChange={v => upEduNote(edu.id, ni, v)} style={{ flex: 1 }} />
                    </Row>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Page boundaries (letter: 1056px per page, line at content bottom ≈ 1008px) */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '1008px', borderTop: '2px dashed rgba(239,68,68,0.5)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '2064px', borderTop: '2px dashed rgba(239,68,68,0.35)', pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  )
}
