'use client'

import { useState, useRef, useCallback } from 'react'
import { FactBank, Experience, Education, Version, Project } from '@/lib/types'
import { saveFactBank, exportFactBank, importFactBank } from '@/lib/storage'

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface Props {
  factBank: FactBank
  onChange: (fb: FactBank) => void
}

export default function FactBankEditor({ factBank, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [expandedExp, setExpandedExp] = useState<Set<string>>(new Set())
  const [expandedProj, setExpandedProj] = useState<Set<string>>(new Set())
  const [activeVersion, setActiveVersion] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const update = useCallback((fb: FactBank) => {
    onChange(fb)
    saveFactBank(fb)
  }, [onChange])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadErrors([])
    try {
      const form = new FormData()
      for (const f of Array.from(files)) form.append('files', f)
      const res = await fetch('/api/parse-resume', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Merge new data into existing factBank
      const newFB = data.factBank as FactBank
      const merged: FactBank = {
        contact: factBank.contact.name ? factBank.contact : newFB.contact,
        summary: factBank.summary?.trim() ? factBank.summary : (newFB.summary || ''),
        education: mergeEducation(factBank.education, newFB.education),
        experiences: mergeExperiences(factBank.experiences, newFB.experiences),
        skills: mergeSkills(factBank.skills, newFB.skills),
        projects: mergeProjects(factBank.projects || [], newFB.projects || []),
      }
      update(merged)
      if (data.errors?.length) {
        setUploadErrors(data.errors.map((e: { filename: string; error: string }) => `${e.filename}: ${e.error}`))
      }
    } catch (err) {
      setUploadErrors([String(err)])
    } finally {
      setUploading(false)
    }
  }

  function mergeEducation(existing: Education[], incoming: Education[]): Education[] {
    const map = new Map(existing.map(e => [e.school.toLowerCase(), e]))
    for (const edu of incoming) {
      if (!map.has(edu.school.toLowerCase())) map.set(edu.school.toLowerCase(), edu)
    }
    return Array.from(map.values())
  }

  function mergeExperiences(existing: Experience[], incoming: Experience[]): Experience[] {
    const map = new Map(existing.map(e => [e.company.toLowerCase(), e]))
    for (const exp of incoming) {
      const key = exp.company.toLowerCase()
      if (map.has(key)) {
        const ex = map.get(key)!
        map.set(key, { ...ex, versions: [...ex.versions, ...exp.versions] })
      } else {
        map.set(key, exp)
      }
    }
    return Array.from(map.values())
  }

  function mergeSkills(existing: string[], incoming: string[]): string[] {
    const set = new Set([...existing, ...incoming])
    return Array.from(set)
  }

  function mergeProjects(existing: Project[], incoming: Project[]): Project[] {
    const map = new Map(existing.map(p => [p.name.toLowerCase(), p]))
    for (const proj of incoming) {
      if (!map.has(proj.name.toLowerCase())) map.set(proj.name.toLowerCase(), proj)
    }
    return Array.from(map.values())
  }

  function updateProj(id: string, patch: Partial<Project>) {
    update({ ...factBank, projects: (factBank.projects || []).map(p => p.id === id ? { ...p, ...patch } : p) })
  }

  function deleteProj(id: string) {
    update({ ...factBank, projects: (factBank.projects || []).filter(p => p.id !== id) })
  }

  function addProj() {
    const id = newId()
    const newProj: Project = { id, name: 'New Project', startDate: '', endDate: '', bullets: [''] }
    update({ ...factBank, projects: [...(factBank.projects || []), newProj] })
    setExpandedProj(prev => new Set([...prev, id]))
  }

  function updateProjBullet(projId: string, idx: number, value: string) {
    const proj = (factBank.projects || []).find(p => p.id === projId)!
    const newBullets = proj.bullets.map((b, i) => i === idx ? value : b)
    updateProj(projId, { bullets: newBullets })
  }

  function addProjBullet(projId: string) {
    const proj = (factBank.projects || []).find(p => p.id === projId)!
    updateProj(projId, { bullets: [...proj.bullets, ''] })
  }

  function deleteProjBullet(projId: string, idx: number) {
    const proj = (factBank.projects || []).find(p => p.id === projId)!
    updateProj(projId, { bullets: proj.bullets.filter((_, i) => i !== idx) })
  }

  function updateContact(field: keyof FactBank['contact'], value: string) {
    update({ ...factBank, contact: { ...factBank.contact, [field]: value } })
  }

  function updateExp(id: string, patch: Partial<Experience>) {
    update({ ...factBank, experiences: factBank.experiences.map(e => e.id === id ? { ...e, ...patch } : e) })
  }

  function deleteExp(id: string) {
    update({ ...factBank, experiences: factBank.experiences.filter(e => e.id !== id) })
  }

  function addExp() {
    const id = newId()
    const versionId = newId()
    const newExp: Experience = {
      id,
      company: 'New Company',
      location: '',
      startDate: '',
      endDate: '',
      versions: [{ id: versionId, title: 'Title', bullets: [''], sourceFile: undefined }],
    }
    update({ ...factBank, experiences: [...factBank.experiences, newExp] })
    setExpandedExp(prev => new Set([...prev, id]))
    setActiveVersion(prev => ({ ...prev, [id]: versionId }))
  }

  function addVersion(expId: string) {
    const versionId = newId()
    update({
      ...factBank,
      experiences: factBank.experiences.map(e =>
        e.id === expId
          ? { ...e, versions: [...e.versions, { id: versionId, title: 'New Title', bullets: [''], sourceFile: undefined }] }
          : e
      ),
    })
    setActiveVersion(prev => ({ ...prev, [expId]: versionId }))
  }

  function updateVersion(expId: string, versionId: string, patch: Partial<Version>) {
    update({
      ...factBank,
      experiences: factBank.experiences.map(e =>
        e.id === expId
          ? { ...e, versions: e.versions.map(f => f.id === versionId ? { ...f, ...patch } : f) }
          : e
      ),
    })
  }

  function deleteVersion(expId: string, versionId: string) {
    update({
      ...factBank,
      experiences: factBank.experiences.map(e =>
        e.id === expId ? { ...e, versions: e.versions.filter(f => f.id !== versionId) } : e
      ),
    })
  }

  function updateBullet(expId: string, versionId: string, idx: number, value: string) {
    const exp = factBank.experiences.find(e => e.id === expId)!
    const version = exp.versions.find(f => f.id === versionId)!
    const newBullets = version.bullets.map((b, i) => i === idx ? value : b)
    updateVersion(expId, versionId, { bullets: newBullets })
  }

  function addBullet(expId: string, versionId: string) {
    const exp = factBank.experiences.find(e => e.id === expId)!
    const version = exp.versions.find(f => f.id === versionId)!
    updateVersion(expId, versionId, { bullets: [...version.bullets, ''] })
  }

  function deleteBullet(expId: string, versionId: string, idx: number) {
    const exp = factBank.experiences.find(e => e.id === expId)!
    const version = exp.versions.find(f => f.id === versionId)!
    updateVersion(expId, versionId, { bullets: version.bullets.filter((_, i) => i !== idx) })
  }

  function updateSkill(idx: number, value: string) {
    const newSkills = factBank.skills.map((s, i) => i === idx ? value : s)
    update({ ...factBank, skills: newSkills })
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const fb = await importFactBank(file)
      update({ ...fb, summary: typeof fb.summary === 'string' ? fb.summary : '' })
    } catch (err) {
      setUploadErrors([String(err)])
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        className="rounded-xl p-8 text-center cursor-pointer transition-all"
        style={{ border: '1.5px dashed var(--border-2)', background: 'var(--surface-2)' }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.background = 'var(--surface)' }}
        onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-2)' }}
        onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-2)'; handleUpload(e.dataTransfer.files) }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.docx,.txt"
          onChange={e => handleUpload(e.target.files)}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-2)', borderTopColor: 'var(--ink)' }} />
            <span className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans' }}>Parsing resumes with AI...</span>
          </div>
        ) : (
          <div>
            <div className="mb-3" style={{ color: 'var(--text-dim)' }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            </div>
            <p className="font-medium" style={{ color: 'var(--text)', fontFamily: 'Instrument Sans' }}>Drop resume files here or click to upload</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans' }}>PDF · DOCX · TXT — multiple files supported</p>
          </div>
        )}
      </div>

      {uploadErrors.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
          {uploadErrors.map((e, i) => (
            <p key={i} className="text-sm" style={{ color: 'var(--red)', fontFamily: 'Instrument Sans' }}>{e}</p>
          ))}
        </div>
      )}

      {/* Export/Import */}
      <div className="flex gap-2">
        <button onClick={() => exportFactBank(factBank)} className="btn-ghost text-xs">Export JSON</button>
        <label className="btn-ghost text-xs cursor-pointer">
          Import JSON
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {/* Contact */}
      <section>
        <h3 className="section-label">Contact</h3>
        <div className="card grid grid-cols-2 gap-3">
          {(['name', 'email', 'phone', 'location', 'linkedin', 'github', 'website'] as const).map(field => (
            <div key={field}>
              <label className="block mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{field}</label>
              <input
                className="input-field w-full"
                value={factBank.contact[field] || ''}
                onChange={e => updateContact(field, e.target.value)}
                placeholder={field}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Summary */}
      <section>
        <h3 className="section-label">Summary</h3>
        <div className="card">
          <p className="mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '12px', lineHeight: 1.5 }}>
            Professional summary from your resume. Used when tailoring for each job (2–3 sentences).
          </p>
          <textarea
            className="input-field w-full"
            rows={4}
            value={factBank.summary || ''}
            onChange={e => update({ ...factBank, summary: e.target.value })}
            placeholder="e.g. Product Manager with 5+ years driving cross-functional execution..."
            style={{ resize: 'vertical', minHeight: '88px' }}
          />
        </div>
      </section>

      {/* Education */}
      <section>
        <h3 className="section-label">Education</h3>
        {factBank.education.map(edu => (
          <div key={edu.id} className="card mb-3">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => update({ ...factBank, education: factBank.education.filter(e => e.id !== edu.id) })}
                className="transition-colors text-sm" style={{ color: "var(--text-muted)" }} onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
              >Remove</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['school', 'location', 'degree', 'field', 'startDate', 'endDate'] as const).map(f => (
                <div key={f}>
                  <label className="block mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{f}</label>
                  <input
                    className="input-field w-full"
                    value={(edu[f] as string) || ''}
                    onChange={e => {
                      update({
                        ...factBank,
                        education: factBank.education.map(ed =>
                          ed.id === edu.id ? { ...ed, [f]: e.target.value } : ed
                        ),
                      })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Skills */}
      <section>
        <h3 className="section-label">Skills</h3>
        <div className="card space-y-2">
          {factBank.skills.map((skill, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="font-mono text-sm" style={{ color: 'var(--text-dim)' }}>•</span>
              <input
                className="input-field flex-1"
                value={skill}
                onChange={e => updateSkill(i, e.target.value)}
                placeholder="Category: skill1, skill2, skill3"
              />
              <button
                onClick={() => update({ ...factBank, skills: factBank.skills.filter((_, j) => j !== i) })}
                className="transition-colors text-lg leading-none" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >×</button>
            </div>
          ))}
          <button
            onClick={() => update({ ...factBank, skills: [...factBank.skills, ''] })}
            className="text-sm font-mono transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >+ Add skill group</button>
        </div>
      </section>

      {/* Divider between Skills and Work Experience */}
      <hr style={{ borderColor: 'var(--border-2)' }} />

      {/* Experiences */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-label mb-0">Work Experience</h3>
          <button onClick={addExp} className="btn-ghost text-xs">+ Add Experience</button>
        </div>
        <div className="space-y-3">
          {factBank.experiences.map(exp => {
            const isOpen = expandedExp.has(exp.id)
            const currentVersionId = activeVersion[exp.id] || exp.versions[0]?.id
            const currentVersion = exp.versions.find(f => f.id === currentVersionId) || exp.versions[0]

            return (
              <div key={exp.id} className="card">
                {/* Experience Header */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedExp(prev => { const s = new Set(prev); isOpen ? s.delete(exp.id) : s.add(exp.id); return s })}
                >
                  <div>
                    <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>{exp.company || 'Unnamed Company'}</span>
                    <span className="ml-2" style={{ fontFamily: 'Instrument Sans', fontSize: '12px', color: 'var(--text-muted)' }}>{exp.versions.length} version{exp.versions.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); deleteExp(exp.id) }}
                      className="transition-colors text-sm" style={{ color: "var(--text-muted)" }} onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                    >Remove</button>
                    <span className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }}>▾</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-4">
                    {/* Company meta fields */}
                    <div className="grid grid-cols-4 gap-2">
                      {(['company', 'location', 'startDate', 'endDate'] as const).map(f => (
                        <div key={f}>
                          <label className="block mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{f}</label>
                          <input
                            className="input-field w-full"
                            value={exp[f] || ''}
                            onChange={e => updateExp(exp.id, { [f]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Frame Tabs */}
                    <div>
                      <div className="flex items-center gap-1 mb-3 flex-wrap">
                        {exp.versions.map(version => (
                          <div
                            key={version.id}
                            role="tab"
                            onClick={() => setActiveVersion(prev => ({ ...prev, [exp.id]: version.id }))}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-all"
                            style={currentVersionId === version.id
                              ? { background: 'var(--green-dim)', border: '1px solid var(--green-border)', color: 'var(--green)' }
                              : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                          >
                            <span className="truncate max-w-32" style={{ fontFamily: 'Instrument Sans', fontSize: '12px' }}>{version.title || 'Untitled'}</span>
                            {exp.versions.length > 1 && (
                              <button
                                onClick={e => { e.stopPropagation(); deleteVersion(exp.id, version.id) }}
                                className="ml-1 leading-none" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                              >×</button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addVersion(exp.id)}
                          className="px-3 py-1.5 rounded-lg text-xs transition-all font-mono"
                          style={{ color: 'var(--text-muted)', border: '1px dashed var(--border-2)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-dim)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)' }}
                        >+ Version</button>
                      </div>

                      {/* Active Frame Editor */}
                      {currentVersion && (
                        <div className="rounded-lg p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <div className="mb-3">
                            <label className="block mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Title</label>
                            <input
                              className="input-field w-full"
                              value={currentVersion.title}
                              onChange={e => updateVersion(exp.id, currentVersion.id, { title: e.target.value })}
                              placeholder="Job Title"
                            />
                          </div>
                          <div>
                            <label className="block mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Bullets</label>
                            <div className="space-y-2">
                              {currentVersion.bullets.map((bullet, j) => (
                                <div key={j} className="flex gap-2 items-start">
                                  <span className="mt-2 font-mono" style={{ color: 'var(--text-dim)' }}>•</span>
                                  <textarea
                                    className="input-field flex-1 resize-none"
                                    rows={2}
                                    value={bullet}
                                    onChange={e => updateBullet(exp.id, currentVersion.id, j, e.target.value)}
                                    placeholder="Describe your achievement..."
                                  />
                                  <button
                                    onClick={() => deleteBullet(exp.id, currentVersion.id, j)}
                                    className="transition-colors mt-2 text-lg leading-none" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                                  >×</button>
                                </div>
                              ))}
                              <button
                                onClick={() => addBullet(exp.id, currentVersion.id)}
                                className="text-sm font-mono transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                              >+ Add bullet</button>
                            </div>
                          </div>
                          {currentVersion.sourceFile && (
                            <p className="text-xs mt-3" style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>Source: {currentVersion.sourceFile}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Projects */}
      {((factBank.projects || []).length > 0) && (
        <hr style={{ borderColor: 'var(--border-2)' }} />
      )}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-label mb-0">Project Experience</h3>
          <button onClick={addProj} className="btn-ghost text-xs">+ Add Project</button>
        </div>
        <div className="space-y-3">
          {(factBank.projects || []).map(proj => {
            const isOpen = expandedProj.has(proj.id)
            return (
              <div key={proj.id} className="card">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedProj(prev => { const s = new Set(prev); isOpen ? s.delete(proj.id) : s.add(proj.id); return s })}
                >
                  <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>{proj.name || 'Unnamed Project'}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); deleteProj(proj.id) }}
                      className="transition-colors text-sm" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >Remove</button>
                    <span className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }}>▾</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      {(['name', 'startDate', 'endDate'] as const).map(f => (
                        <div key={f}>
                          <label className="block mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{f === 'name' ? 'Project Name' : f}</label>
                          <input
                            className="input-field w-full"
                            value={proj[f] || ''}
                            onChange={e => updateProj(proj.id, { [f]: e.target.value })}
                            placeholder={f === 'startDate' || f === 'endDate' ? 'optional' : ''}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'Instrument Sans', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bullets</label>
                      <div className="space-y-2">
                        {proj.bullets.map((bullet, j) => (
                          <div key={j} className="flex gap-2 items-start">
                            <span className="mt-2 font-mono" style={{ color: 'var(--text-dim)' }}>•</span>
                            <textarea
                              className="input-field flex-1 resize-none"
                              rows={2}
                              value={bullet}
                              onChange={e => updateProjBullet(proj.id, j, e.target.value)}
                              placeholder="Describe your project..."
                            />
                            <button
                              onClick={() => deleteProjBullet(proj.id, j)}
                              className="transition-colors mt-2 text-lg leading-none" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                            >×</button>
                          </div>
                        ))}
                        <button
                          onClick={() => addProjBullet(proj.id)}
                          className="text-sm font-mono transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                        >+ Add bullet</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
