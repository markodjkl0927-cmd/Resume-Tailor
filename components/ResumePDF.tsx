import React from 'react'
import path from 'path'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
  Font,
} from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { GeneratedResume } from '@/lib/types'

const COLORS = {
  body: '#000000',
  alt: '#3E3E3E',
  divider: '#9A9A9A',
}

let carlitoRegistered = false
function registerCarlitoFonts() {
  if (carlitoRegistered) return
  try {
    Font.register({
      family: 'Carlito',
      fonts: [
        { src: path.join(process.cwd(), 'public', 'fonts', 'Carlito-Regular.ttf'), fontWeight: 'normal' },
        { src: path.join(process.cwd(), 'public', 'fonts', 'Carlito-Bold.ttf'), fontWeight: 'bold' },
      ],
    })
    carlitoRegistered = true
  } catch (e) {
    console.warn('[ResumePDF] Carlito registration failed:', e)
  }
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Carlito',
    fontSize: 10,
    lineHeight: 1.15,
    color: COLORS.body,
    backgroundColor: '#ffffff',
    /** ~0.30 in from physical top; sides/bottom 0.50 in — matches DOCX-first-line placement */
    paddingTop: 22,
    paddingBottom: 36,
    paddingHorizontal: 36,
  },
  hr: {
    borderTopWidth: 1.2,
    borderTopColor: COLORS.divider,
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 8,
    marginBottom: 20,
  },
  centered: {
    textAlign: 'center',
    lineHeight: 1.15,
  },
  name: {
    fontSize: 16,
    fontWeight: 'normal',
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 1.15,
  },
  headline: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.15,
    marginBottom: 2,
    color: COLORS.body,
  },
  headerContact: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 1.15,
    color: COLORS.body,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 1.15,
    color: COLORS.body,
    textAlign: 'left',
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 0,
    lineHeight: 1.15,
    paddingLeft: 13,
  },
  skillDot: {
    width: 18,
    fontSize: 10,
    paddingTop: 0,
    color: COLORS.body,
  },
  skillBody: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 4,
    fontSize: 10,
    lineHeight: 1.15,
    color: COLORS.body,
  },
  bold: {
    fontWeight: 'bold',
  },
  jobBlockFirst: {
    marginTop: 0,
    marginBottom: 0,
  },
  jobBlock: {
    marginTop: 14,
    marginBottom: 0,
  },
  jobHeaderLine: {
    fontSize: 11,
    lineHeight: 1.15,
    marginBottom: 5,
    marginLeft: 0,
    paddingLeft: 0,
    color: COLORS.body,
    textAlign: 'left',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
    paddingLeft: 10,
    lineHeight: 1.08,
  },
  bulletGlyph: {
    width: 12,
    fontSize: 10,
    color: COLORS.alt,
  },
  bulletTextWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 11,
    maxWidth: '100%',
  },
  justifiedLine: {
    fontSize: 10,
    lineHeight: 1.09,
    textAlign: 'justify',
    color: COLORS.alt,
    width: '100%',
  },
  /** Flush to body margin — not indented with bullet columns (DOCX) */
  roleSkillsLine: {
    fontSize: 10,
    lineHeight: 1.1,
    marginTop: 2,
    marginBottom: 11,
    marginLeft: 0,
    paddingLeft: 0,
    color: COLORS.body,
    textAlign: 'left',
  },
  educationLine: {
    fontSize: 10,
    lineHeight: 1.15,
    marginLeft: 0,
    marginTop: 2,
    color: COLORS.body,
  },
  projectHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 1.15,
  },
})

function toAbsoluteURL(str: string): string {
  if (str.startsWith('http')) return str
  return 'https://' + str
}

function formatEducationLikeDocx(edu: GeneratedResume['education'][0]): string {
  const degPart = [edu.degree, edu.field].filter(Boolean).join(' in ')
  const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ')
  const body = [degPart, edu.school].filter(Boolean).join(' ')
  return dates ? `${body} | ${dates}` : body
}

function parseSkillLine(line: string): { category: string; items: string } {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return { category: '', items: line.trim() }
  return {
    category: line.slice(0, colonIdx + 1),
    items: line.slice(colonIdx + 1),
  }
}

/** Renders **bold** as nested Text; must not return Fragment wrapper (react-pdf). */
function RichParagraph({
  text,
  paragraphStyle,
  baseStyle,
  boldStyle,
}: {
  text: string
  paragraphStyle: Style
  baseStyle: Style
  boldStyle: Style
}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  const children = parts.flatMap((p, i) => {
    if (!p) return []
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return [<Text key={i} style={[baseStyle, boldStyle]}>{p.slice(2, -2)}</Text>]
    }
    return [<Text key={i} style={baseStyle}>{p}</Text>]
  })
  return <Text style={paragraphStyle}>{children}</Text>
}

export function ResumePDFDocument({ resume }: { resume: GeneratedResume }) {
  registerCarlitoFonts()

  const { phone, email, linkedin, github, website, headline } = resume.contact
  const headlineTrim = (headline || '').trim()

  function contactSegment(sep: boolean, inner: React.ReactNode) {
    return (
      <Text style={styles.headerContact}>
        {sep ? ' | ' : ''}
        {inner}
      </Text>
    )
  }

  function buildContactChunks(): React.ReactNode[] {
    const chunks: React.ReactNode[] = []
    if (resume.contact.location) chunks.push(contactSegment(false, resume.contact.location))
    if (phone) chunks.push(contactSegment(chunks.length > 0, phone))
    if (email) {
      chunks.push(
        contactSegment(
          chunks.length > 0,
          <Link src={`mailto:${email}`} style={{ color: '#000000' }}>{email}</Link>,
        ),
      )
    }
    if (linkedin) {
      const url = toAbsoluteURL(linkedin)
      chunks.push(contactSegment(chunks.length > 0, <Link src={url} style={{ color: '#000000' }}>LinkedIn</Link>))
    }
    if (github) {
      const url = toAbsoluteURL(github)
      chunks.push(contactSegment(chunks.length > 0, <Link src={url} style={{ color: '#000000' }}>GitHub</Link>))
    }
    if (website) {
      const url = toAbsoluteURL(website)
      chunks.push(contactSegment(chunks.length > 0, <Link src={url} style={{ color: '#000000' }}>Website</Link>))
    }
    return chunks
  }

  const summaryTrim = (resume.summary || '').trim()
  const hasSkills = resume.skills.length > 0
  const hasExp = resume.experiences.length > 0
  const projList = resume.projects || []
  const hasProj = projList.length > 0
  const hasEdu = resume.education.length > 0

  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <View wrap={false}>
          <Text style={styles.name}>{resume.contact.name || '\u200B'}</Text>
          {headlineTrim ? <Text style={styles.headline}>{headlineTrim}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
            {buildContactChunks()}
          </View>
        </View>

        <View style={styles.hr} />

        {summaryTrim ? (
          <>
            <Text style={styles.sectionTitle}>Summary</Text>
            <RichParagraph
              text={summaryTrim.replace(/\u00A0/g, ' ')}
              paragraphStyle={{
                fontSize: 10,
                lineHeight: 1.22,
                textAlign: 'justify',
                color: COLORS.body,
                marginBottom: 18,
              }}
              baseStyle={{ fontSize: 10, lineHeight: 1.22, textAlign: 'justify', color: COLORS.body }}
              boldStyle={{ fontWeight: 'bold' }}
            />
            <View style={styles.hr} />
          </>
        ) : null}

        {hasSkills ? (
          <>
            <Text style={styles.sectionTitle}>Skills & Technologies</Text>
            {resume.skills.map((line, i) => {
              const trimmed = line.trim()
              if (!trimmed) return null
              const { category, items } = parseSkillLine(trimmed)
              return (
                <View key={i} style={styles.skillRow} wrap={false}>
                  <Text style={styles.skillDot}>•</Text>
                  <View style={styles.skillBody}>
                    <Text>
                      {category ? <Text style={{ fontWeight: 'bold' }}>{category}</Text> : null}
                      <Text>{items}</Text>
                    </Text>
                  </View>
                </View>
              )
            })}
            <View style={styles.hr} />
          </>
        ) : null}

        {hasExp ? (
          <>
            <Text style={styles.sectionTitle}>Experience</Text>
            {resume.experiences.map((exp, idx) => {
              const bullets = exp.bullets.filter(b => b.trim())
              const company = (exp.company || '').trim()
              const datePart = `${exp.startDate || ''}${exp.endDate ? ` – ${exp.endDate}` : ''}`
              const loc = (exp.location || '').trim()
              const et = (exp.pdfEmploymentType || '').trim()
              const rest = [datePart, loc, et].filter(Boolean).join(' | ')
              const jobRight = [company, rest].filter(Boolean).join(' | ')
              return (
                <View key={`${exp.company}-${idx}`} style={idx === 0 ? styles.jobBlockFirst : styles.jobBlock} wrap={false}>
                  <Text style={styles.jobHeaderLine} wrap={false}>
                    <Text style={{ fontWeight: 'bold' }}>{exp.title || ''}</Text>
                    {jobRight ? <Text>{` ${jobRight}`}</Text> : null}
                  </Text>
                  {bullets.map((bullet, j) => (
                    <React.Fragment key={j}>
                      {typeof exp.pdfPageBreakBeforeBulletIndex === 'number' && exp.pdfPageBreakBeforeBulletIndex === j ? (
                        <View break />
                      ) : null}
                      <View style={styles.bulletRow} wrap={false}>
                        <Text style={styles.bulletGlyph}>•</Text>
                        <View style={styles.bulletTextWrap}>
                          <RichParagraph
                            text={bullet.trimEnd().replace(/\.$/, '').replace(/\u00A0/g, ' ')}
                            paragraphStyle={styles.justifiedLine}
                            baseStyle={{ fontSize: 10, lineHeight: 1.09, textAlign: 'justify', color: COLORS.alt, width: '100%' }}
                            boldStyle={{ fontWeight: 'bold', color: COLORS.alt }}
                          />
                        </View>
                      </View>
                    </React.Fragment>
                  ))}
                  {(exp.pdfRoleSkillsLine || '').trim() ? (
                    <Text style={styles.roleSkillsLine} wrap={false}>
                      Skills: {(exp.pdfRoleSkillsLine || '').trim()}
                    </Text>
                  ) : null}
                </View>
              )
            })}
            <View style={styles.hr} />
          </>
        ) : null}

        {hasProj ? (
          <>
            <Text style={styles.sectionTitle}>Projects</Text>
            {projList.map((proj, i) => (
              <View key={proj.id || i} style={{ marginBottom: 8 }} wrap={false}>
                <Text style={styles.projectHeader}>
                  {proj.name}
                  {(proj.startDate || proj.endDate) ? `  |  ${[proj.startDate, proj.endDate].filter(Boolean).join(' – ')}` : ''}
                </Text>
                {proj.bullets.filter(b => b.trim()).map((b, j) => (
                  <View key={j} style={styles.bulletRow} wrap={false}>
                    <Text style={styles.bulletGlyph}>•</Text>
                    <View style={styles.bulletTextWrap}>
                      <RichParagraph
                        text={b.trimEnd().replace(/\.$/, '')}
                        paragraphStyle={styles.justifiedLine}
                        baseStyle={{ fontSize: 10, lineHeight: 1.09, textAlign: 'justify', color: COLORS.alt, width: '100%' }}
                        boldStyle={{ fontWeight: 'bold', color: COLORS.alt }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.hr} />
          </>
        ) : null}

        {hasEdu ? (
          <>
            <Text style={styles.sectionTitle}>Education</Text>
            {resume.education.map(edu => (
              <View key={edu.id} style={{ marginBottom: 6 }} wrap={false}>
                <Text style={styles.educationLine}>{formatEducationLikeDocx(edu)}</Text>
                {edu.notes.filter(n => n.trim()).map((n, ni) => (
                  <Text key={ni} style={[styles.educationLine, { marginTop: 4, marginLeft: 0 }]}>• {n}</Text>
                ))}
              </View>
            ))}
          </>
        ) : null}
      </Page>
    </Document>
  )
}
