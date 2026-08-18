import type { Certificate } from '../../../entities/models/Certificate'
import { emailDetailRows, emailLayout } from './layout'

export const certificateEmail = (certificate: Certificate, verificationUrl: string): string =>
  emailLayout({
    preheader: `Your certificate for ${certificate.courseName}`,
    eyebrow: 'Course completed',
    title: 'Your DANVIC certificate',
    introduction: `Congratulations, ${certificate.studentName}. Your certificate of completion is attached to this email.`,
    overview: [
      { label: 'Course', value: certificate.courseName },
      { label: 'Status', value: 'Completed' },
    ],
    content: `${emailDetailRows([
      { label: 'Certificate ID', value: certificate.certificateNumber },
      { label: 'Completed', value: formatDate(certificate.completedAt) },
    ])}<p style="margin:18px 0 0">Your certificate PDF is attached. Use the verification record whenever you need to share a trusted copy.</p>`,
    action: { label: 'Verify certificate', url: verificationUrl },
    footnote:
      'The attached PDF includes a QR code linking to its public DANVIC verification record.',
  })

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value)
