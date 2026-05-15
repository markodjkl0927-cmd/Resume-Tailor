'use client'

import { useState, useRef } from 'react'
import { Application, deleteApplication, exportApplications, importApplications } from '@/lib/applications'

interface Props {
  applications: Application[]
  onChange: (apps: Application[]) => void
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default function ApplicationsLog({ applications, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleDelete(id: string) {
    deleteApplication(id)
    onChange(applications.filter(a => a.id !== id))
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    try {
      const imported = await importApplications(file)
      // merge: imported first, skip duplicates by id
      const existingIds = new Set(applications.map(a => a.id))
      const merged = [...imported.filter(a => !existingIds.has(a.id)), ...applications]
      localStorage.setItem('resume_builder_applications', JSON.stringify(merged))
      onChange(merged)
    } catch (err) {
      setImportError(String(err))
    }
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div style={{ fontSize: 40, opacity: 0.2 }}>📋</div>
        <p style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 700, color: 'var(--text-muted)' }}>No applications yet</p>
        <p style={{ fontFamily: 'Instrument Sans', fontSize: 14, color: 'var(--text-dim)' }}>
          Generate a resume and click "Save Application" to log it here
        </p>
        <div className="flex gap-2 mt-4">
          <label className="btn-ghost text-xs cursor-pointer">
            Import JSON
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
        </div>
        {importError && <p style={{ color: 'var(--red)', fontFamily: 'Instrument Sans', fontSize: 13 }}>{importError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p style={{ fontFamily: 'Instrument Sans', fontSize: 13, color: 'var(--text-muted)' }}>
          {applications.length} application{applications.length !== 1 ? 's' : ''} saved
        </p>
        <div className="flex gap-2">
          <button onClick={() => exportApplications(applications)} className="btn-ghost text-xs">Export JSON</button>
          <label className="btn-ghost text-xs cursor-pointer">
            Import JSON
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
        </div>
      </div>

      {importError && (
        <div className="rounded-lg p-3" style={{ background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
          <p style={{ color: 'var(--red)', fontFamily: 'Instrument Sans', fontSize: 13 }}>{importError}</p>
        </div>
      )}

      {/* Application cards */}
      {applications.map(app => {
        const isOpen = expanded.has(app.id)
        const score = app.resume?.jdKeywordCoverage?.score ?? null
        const beforeScore = app.resume?.jdKeywordCoverage?.beforeScore ?? null
        const improvement = score != null && beforeScore != null ? score - beforeScore : null
        const exp = app.resume?.experiences ?? []
        const skills = app.resume?.skills ?? []

        return (
          <div key={app.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Card header */}
            <div
              className="flex items-center justify-between cursor-pointer"
              style={{ padding: '16px 20px' }}
              onClick={() => setExpanded(prev => { const s = new Set(prev); isOpen ? s.delete(app.id) : s.add(app.id); return s })}
            >
              <div className="flex items-center gap-4">
                {/* Date */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>{fmt(app.date)}</span>
                </div>

                {/* Role + Company */}
                <div>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                    {app.role || '—'}
                  </span>
                  {app.company && app.company !== '—' && (
                    <span style={{ fontFamily: 'Instrument Sans', fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>
                      @ {app.company}
                    </span>
                  )}
                </div>

                {/* ATS score badge */}
                {score != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 12, fontWeight: 700, color: 'var(--green)', background: 'var(--green-dim)', border: '1px solid var(--green-border)', padding: '2px 8px', borderRadius: 6 }}>
                      {score}%
                    </span>
                    {improvement != null && improvement > 0 && (
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--green)' }}>+{improvement}%</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(app.id) }}
                  style={{ fontFamily: 'Instrument Sans', fontSize: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
                >Remove</button>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
              </div>
            </div>

            {/* Expanded resume view */}
            {isOpen && app.resume && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '20px 24px', background: 'var(--surface-2)' }}>

                {/* Contact */}
                {app.resume.contact?.name && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>
                      {app.resume.contact.name}
                    </p>
                    <p style={{ fontFamily: 'Instrument Sans', fontSize: 12, color: 'var(--text-muted)' }}>
                      {[app.resume.contact.email, app.resume.contact.phone, app.resume.contact.location].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                )}

                {/* Summary */}
                {(app.resume.summary || '').trim() && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'Instrument Sans', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Summary</p>
                    <p style={{ fontFamily: 'Instrument Sans', fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{app.resume.summary.trim()}</p>
                  </div>
                )}

                {/* Skills */}
                {skills.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'Instrument Sans', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Skills</p>
                    <div className="space-y-1">
                      {skills.map((s, i) => (
                        <p key={i} style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{s || '—'}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Experiences */}
                {exp.length > 0 && (
                  <div>
                    <p style={{ fontFamily: 'Instrument Sans', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>Experience</p>
                    <div className="space-y-4">
                      {exp.map((e, i) => (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                              {e?.company || '—'}
                            </span>
                            <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>
                              {[e?.startDate, e?.endDate].filter(Boolean).join(' – ')}
                            </span>
                          </div>
                          <p style={{ fontFamily: 'Instrument Sans', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontStyle: 'italic' }}>
                            {e?.title || '—'}
                          </p>
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {(e?.bullets ?? []).map((b, j) => (
                              <li key={j} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                                <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>•</span>
                                <span style={{ fontFamily: 'Instrument Sans', fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{b || '—'}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* JD text */}
                {app.jdText && (
                  <details style={{ marginTop: 16 }}>
                    <summary style={{ fontFamily: 'Instrument Sans', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>View original JD</summary>
                    <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 8, whiteSpace: 'pre-wrap' }}>{app.jdText.slice(0, 2000)}{app.jdText.length > 2000 ? '...' : ''}</p>
                  </details>
                )}
              </div>
            )}

            {/* Expanded but no resume */}
            {isOpen && !app.resume && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', background: 'var(--surface-2)' }}>
                <p style={{ fontFamily: 'Instrument Sans', fontSize: 13, color: 'var(--text-dim)' }}>No resume data saved for this application.</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
