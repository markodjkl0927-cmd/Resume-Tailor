import React from 'react'

import {

  Document,

  Page,

  Text,

  View,

  StyleSheet,

  Link,

} from '@react-pdf/renderer'

import type { Style } from '@react-pdf/types'

import { GeneratedResume } from '@/lib/types'
import { normalizeBulletText } from '@/lib/bullet-text'



const COLORS = {

  body: '#000000',

  dates: '#333333',

  link: '#1155CC',

}



const styles = StyleSheet.create({

  page: {

    fontFamily: 'Times-Roman',

    fontSize: 8.5,

    lineHeight: 1.25,

    color: COLORS.body,

    backgroundColor: '#ffffff',

    paddingTop: 36,

    paddingBottom: 36,

    paddingHorizontal: 36,

  },

  centered: {

    textAlign: 'center',

    lineHeight: 1.25,

  },

  name: {

    fontFamily: 'Times-Bold',

    fontSize: 14,

    marginBottom: 4,

    textAlign: 'center',

    lineHeight: 1.25,

  },

  headline: {

    fontFamily: 'Times-Roman',

    fontSize: 10,

    textAlign: 'center',

    lineHeight: 1.25,

    marginBottom: 2,

    color: COLORS.body,

  },

  headerContact: {

    fontFamily: 'Times-Roman',

    fontSize: 8,

    textAlign: 'center',

    lineHeight: 1.25,

    color: COLORS.body,

  },

  sectionTitleWrap: {

    marginTop: 6,

    marginBottom: 4,

    borderBottomWidth: 2,

    borderBottomColor: COLORS.body,

    paddingBottom: 1,

  },

  sectionTitle: {

    fontFamily: 'Times-Bold',

    fontSize: 9,

    textTransform: 'uppercase',

    lineHeight: 1.25,

    color: COLORS.body,

  },

  skillRow: {

    flexDirection: 'row',

    alignItems: 'flex-start',

    marginBottom: 3,

    paddingLeft: 0,

  },

  skillDot: {

    width: 10,

    fontSize: 8.5,

    lineHeight: 1.25,

    color: COLORS.body,

  },

  skillText: {

    flex: 1,

    fontSize: 8.5,

    lineHeight: 1.25,

    color: COLORS.body,

  },

  jobBlock: {

    marginBottom: 5,

  },

  jobCompanyLine: {

    fontFamily: 'Times-Bold',

    fontSize: 8.5,

    lineHeight: 1.25,

    marginBottom: 2,

    color: COLORS.body,

  },

  jobTitleRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'flex-start',

    marginBottom: 2,

  },

  jobTitle: {

    fontFamily: 'Times-Italic',

    fontSize: 8.5,

    flex: 1,

    paddingRight: 8,

    color: COLORS.body,

  },

  jobDates: {

    fontFamily: 'Times-Roman',

    fontSize: 8.5,

    color: COLORS.dates,

    textAlign: 'right',

  },

  bulletRow: {

    flexDirection: 'row',

    alignItems: 'flex-start',

    marginBottom: 2,

    paddingLeft: 0,

  },

  bulletGlyph: {

    width: 10,

    fontSize: 8.5,

    color: COLORS.body,

  },

  bulletText: {

    flex: 1,

    fontSize: 8.5,

    lineHeight: 1.25,

    textAlign: 'left',

    color: COLORS.body,

  },

  roleSkillsLine: {

    fontSize: 8.5,

    lineHeight: 1.25,

    marginTop: 2,

    marginBottom: 2,

    color: COLORS.body,

    textAlign: 'left',

  },

  eduSchoolRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginBottom: 2,

  },

  eduSchool: {

    fontFamily: 'Times-Bold',

    fontSize: 8.5,

    color: COLORS.body,

  },

  eduDegreeRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'flex-start',

    marginBottom: 2,

  },

  eduDates: {

    fontFamily: 'Times-Roman',

    fontSize: 8.5,

    color: COLORS.dates,

    textAlign: 'right',

  },

  eduBlock: {

    marginBottom: 5,

  },

  projectNameRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginBottom: 2,

  },

  projectName: {

    fontFamily: 'Times-Bold',

    fontSize: 8.5,

    color: COLORS.body,

  },

  summaryBody: {

    fontSize: 8.5,

    lineHeight: 1.25,

    textAlign: 'justify',

    color: COLORS.body,

    marginBottom: 4,

  },

})



function toAbsoluteURL(str: string): string {

  if (str.startsWith('http')) return str

  return 'https://' + str

}



function parseSkillLine(line: string): { category: string; items: string } {

  const colonIdx = line.indexOf(':')

  if (colonIdx === -1) return { category: '', items: line.trim() }

  return {

    category: line.slice(0, colonIdx + 1),

    items: line.slice(colonIdx + 1),

  }

}



function SectionTitle({ children }: { children: string }) {

  return (

    <View style={styles.sectionTitleWrap}>

      <Text style={styles.sectionTitle}>{children}</Text>

    </View>

  )

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

  const { phone, email, linkedin, github, website, headline } = resume.contact

  const headlineTrim = (headline || '').trim()



  function contactSegment(key: string, sep: boolean, inner: React.ReactNode) {

    return (

      <Text key={key} style={styles.headerContact}>

        {sep ? ' | ' : ''}

        {inner}

      </Text>

    )

  }



  function buildContactChunks(): React.ReactNode[] {

    const chunks: React.ReactNode[] = []

    if (resume.contact.location) chunks.push(contactSegment('loc', false, resume.contact.location))

    if (phone) chunks.push(contactSegment('phone', chunks.length > 0, phone))

    if (email) {

      chunks.push(

        contactSegment(

          'email',

          chunks.length > 0,

          <Link src={`mailto:${email}`} style={{ color: COLORS.link }}>{email}</Link>,

        ),

      )

    }

    if (linkedin) {

      const url = toAbsoluteURL(linkedin)

      chunks.push(contactSegment('linkedin', chunks.length > 0, <Link src={url} style={{ color: COLORS.link }}>LinkedIn</Link>))

    }

    if (github) {

      const url = toAbsoluteURL(github)

      chunks.push(contactSegment('github', chunks.length > 0, <Link src={url} style={{ color: COLORS.link }}>GitHub</Link>))

    }

    if (website) {

      const url = toAbsoluteURL(website)

      chunks.push(contactSegment('website', chunks.length > 0, <Link src={url} style={{ color: COLORS.link }}>Website</Link>))

    }

    return chunks

  }



  const summaryTrim = (resume.summary || '').trim()

  const hasSkills = resume.skills.length > 0

  const hasExp = resume.experiences.length > 0

  const projList = resume.projects || []

  const hasProj = projList.length > 0

  const hasEdu = resume.education.length > 0



  const bulletBase = { fontSize: 8.5, lineHeight: 1.25, textAlign: 'left' as const, color: COLORS.body }

  const bulletBold = { fontFamily: 'Times-Bold' }



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



        {summaryTrim ? (

          <>

            <SectionTitle>SUMMARY</SectionTitle>

            <RichParagraph

              text={summaryTrim.replace(/\u00A0/g, ' ')}

              paragraphStyle={styles.summaryBody}

              baseStyle={bulletBase}

              boldStyle={bulletBold}

            />

          </>

        ) : null}



        {hasSkills ? (

          <>

            <SectionTitle>SKILLS</SectionTitle>

            {resume.skills.filter(line => line.trim()).map((line, i) => {

              const trimmed = line.trim()

              const { category, items } = parseSkillLine(trimmed)

              return (

                <View key={i} style={styles.skillRow}>

                  <Text style={styles.skillDot}>•</Text>

                  <Text style={styles.skillText}>

                    {category ? <Text style={{ fontFamily: 'Times-Bold' }}>{category}</Text> : null}

                    <Text>{items}</Text>

                  </Text>

                </View>

              )

            })}

          </>

        ) : null}



        {hasExp ? (

          <>

            <SectionTitle>WORK EXPERIENCE</SectionTitle>

            {resume.experiences.map((exp, idx) => {

              const bullets = exp.bullets.filter(b => b.trim())

              const company = (exp.company || '').trim()

              const loc = (exp.location || '').trim()

              const companyLine = [company, loc].filter(Boolean).join(', ')

              const datePart = `${exp.startDate || ''}${exp.endDate ? ` – ${exp.endDate}` : ''}`.trim()

              return (

                <View key={`${exp.company}-${idx}`} style={styles.jobBlock}>

                  {companyLine ? (

                    <Text style={styles.jobCompanyLine}>{companyLine}</Text>

                  ) : null}

                  <View style={styles.jobTitleRow}>

                    <Text style={styles.jobTitle}>{exp.title || ''}</Text>

                    {datePart ? <Text style={styles.jobDates}>{datePart}</Text> : null}

                  </View>

                  {bullets.map((bullet, j) => (
                    <View key={j}>
                      {typeof exp.pdfPageBreakBeforeBulletIndex === 'number' && exp.pdfPageBreakBeforeBulletIndex === j ? (
                        <View break />
                      ) : null}
                      <View style={styles.bulletRow}>
                        <Text style={styles.bulletGlyph}>•</Text>
                        <RichParagraph
                          text={normalizeBulletText(bullet)}
                          paragraphStyle={styles.bulletText}
                          baseStyle={bulletBase}
                          boldStyle={bulletBold}
                        />
                      </View>
                    </View>
                  ))}

                  {(exp.pdfRoleSkillsLine || '').trim() ? (

                    <Text style={styles.roleSkillsLine}>

                      Skills: {(exp.pdfRoleSkillsLine || '').trim()}

                    </Text>

                  ) : null}

                </View>

              )

            })}

          </>

        ) : null}



        {hasProj ? (

          <>

            <SectionTitle>PROJECTS</SectionTitle>

            {projList.map((proj, i) => {

              const dates = [proj.startDate, proj.endDate].filter(Boolean).join(' – ')

              return (

                <View key={proj.id || i} style={styles.jobBlock}>

                  <View style={styles.projectNameRow}>

                    <Text style={styles.projectName}>{proj.name}</Text>

                    {dates ? <Text style={styles.jobDates}>{dates}</Text> : null}

                  </View>

                  {proj.bullets.filter(b => b.trim()).map((b, j) => (
                    <View key={j} style={styles.bulletRow}>
                      <Text style={styles.bulletGlyph}>•</Text>
                      <RichParagraph
                        text={normalizeBulletText(b)}
                        paragraphStyle={styles.bulletText}
                        baseStyle={bulletBase}
                        boldStyle={bulletBold}
                      />
                    </View>
                  ))}

                </View>

              )

            })}

          </>

        ) : null}



        {hasEdu ? (

          <>

            <SectionTitle>EDUCATION</SectionTitle>

            {resume.education.map(edu => {

              const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ')

              const loc = (edu.location || '').trim()

              return (

                <View key={edu.id} style={styles.eduBlock}>

                  <View style={styles.eduSchoolRow}>

                    <Text style={styles.eduSchool}>{edu.school || ''}</Text>

                    {loc ? <Text style={styles.eduSchool}>{loc}</Text> : null}

                  </View>

                  <View style={styles.eduDegreeRow}>

                    <Text style={{ flex: 1, paddingRight: 8 }}>

                      {edu.degree ? (

                        <Text style={{ fontFamily: 'Times-Italic' }}>{edu.degree}</Text>

                      ) : null}

                      {edu.field ? (

                        <Text>

                          {edu.degree ? ', ' : ''}

                          <Text style={{ fontFamily: 'Times-BoldItalic' }}>

                            {edu.field}

                          </Text>

                        </Text>

                      ) : null}

                    </Text>

                    {dates ? <Text style={styles.eduDates}>{dates}</Text> : null}

                  </View>

                  {edu.notes.filter(n => n.trim()).map((n, ni) => (

                    <View key={ni} style={[styles.bulletRow, { marginLeft: 10 }]}>

                      <Text style={styles.bulletGlyph}>•</Text>

                      <Text style={styles.bulletText}>{n}</Text>

                    </View>

                  ))}

                </View>

              )

            })}

          </>

        ) : null}

      </Page>

    </Document>

  )

}

