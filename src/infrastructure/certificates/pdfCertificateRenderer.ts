import QRCode from 'qrcode'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { CertificateDocumentRenderer } from '../../entities/interfaces/certificateRepository'
import type { Certificate } from '../../entities/models/Certificate'
import type { EnvironmentConfig } from '../config/environment'

export class PdfCertificateRenderer implements CertificateDocumentRenderer {
  constructor(private readonly config: EnvironmentConfig) {}

  verificationUrl(certificateNumber: string): string {
    return `${this.config.STUDENT_APP_BASE_URL}/certificates/${encodeURIComponent(certificateNumber)}`
  }

  async render(certificate: Certificate): Promise<Buffer> {
    const document = await PDFDocument.create()
    document.setTitle(`DANVIC Certificate - ${certificate.studentName}`)
    document.setAuthor('DANVIC Energy Learning')
    document.setSubject(`Course completion certificate for ${certificate.courseName}`)
    document.setCreationDate(certificate.issuedAt)

    const page = document.addPage([841.89, 595.28])
    const { width, height } = page.getSize()
    const regular = await document.embedFont(StandardFonts.Helvetica)
    const bold = await document.embedFont(StandardFonts.HelveticaBold)
    const navy = rgb(0.043, 0.118, 0.235)
    const cobalt = rgb(0.117, 0.318, 0.745)
    const ink = rgb(0.055, 0.071, 0.102)
    const muted = rgb(0.36, 0.388, 0.435)
    const line = rgb(0.82, 0.835, 0.855)
    const paper = rgb(0.992, 0.988, 0.976)

    page.drawRectangle({ x: 0, y: 0, width, height, color: paper })
    page.drawRectangle({
      x: 24,
      y: 24,
      width: width - 48,
      height: height - 48,
      borderColor: navy,
      borderWidth: 1,
    })
    page.drawRectangle({ x: 54, y: height - 92, width: 28, height: 28, color: navy })
    drawCentered(page, 'D', 68, height - 83, bold, 15, rgb(1, 1, 1))
    page.drawText('DANVIC', { x: 94, y: height - 73, font: bold, size: 15, color: navy })
    page.drawText('ENERGY LEARNING', {
      x: 94,
      y: height - 87,
      font: regular,
      size: 6.8,
      color: muted,
    })
    page.drawText('CERTIFICATE', {
      x: width - 166,
      y: height - 72,
      font: bold,
      size: 8.5,
      color: navy,
    })
    page.drawText('OF COMPLETION', {
      x: width - 166,
      y: height - 86,
      font: regular,
      size: 7,
      color: muted,
    })
    page.drawLine({
      start: { x: 54, y: height - 116 },
      end: { x: width - 54, y: height - 116 },
      thickness: 0.65,
      color: line,
    })
    page.drawLine({
      start: { x: 54, y: height - 116 },
      end: { x: 118, y: height - 116 },
      thickness: 2.4,
      color: cobalt,
    })

    drawCentered(page, 'Certificate of Completion', width / 2, height - 169, regular, 25, navy)
    drawCentered(page, 'PRESENTED TO', width / 2, height - 210, bold, 7.5, cobalt)
    drawCentered(
      page,
      certificate.studentName,
      width / 2,
      height - 260,
      bold,
      fitText(bold, certificate.studentName, 36, width - 180),
      ink,
    )
    page.drawLine({
      start: { x: 196, y: height - 274 },
      end: { x: width - 196, y: height - 274 },
      thickness: 0.6,
      color: line,
    })
    drawCentered(
      page,
      'has successfully completed the course',
      width / 2,
      height - 308,
      regular,
      11,
      muted,
    )
    drawCentered(
      page,
      certificate.courseName,
      width / 2,
      height - 352,
      bold,
      fitText(bold, certificate.courseName, 20, width - 210),
      navy,
    )

    const completion = formatDate(certificate.completedAt)
    const issued = formatDate(certificate.issuedAt)
    page.drawLine({
      start: { x: 54, y: 151 },
      end: { x: width - 54, y: 151 },
      thickness: 0.65,
      color: line,
    })
    page.drawText('COMPLETED', {
      x: 54,
      y: 121,
      font: bold,
      size: 6.5,
      color: muted,
    })
    page.drawText(completion, { x: 54, y: 102, font: regular, size: 10, color: ink })
    page.drawText('ISSUED', {
      x: 220,
      y: 121,
      font: bold,
      size: 6.5,
      color: muted,
    })
    page.drawText(issued, { x: 220, y: 102, font: regular, size: 10, color: ink })
    page.drawText('CERTIFICATE NUMBER', {
      x: 386,
      y: 121,
      font: bold,
      size: 6.5,
      color: muted,
    })
    page.drawText(certificate.certificateNumber, {
      x: 386,
      y: 102,
      font: regular,
      size: 10,
      color: ink,
    })

    const qrDataUrl = await QRCode.toDataURL(this.verificationUrl(certificate.certificateNumber), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#0B1E3C', light: '#FFFFFF' },
    })
    const qrImage = await document.embedPng(Buffer.from(qrDataUrl.split(',')[1] ?? '', 'base64'))
    page.drawImage(qrImage, { x: width - 139, y: 65, width: 70, height: 70 })
    page.drawText('SCAN TO VERIFY', {
      x: width - 136,
      y: 53,
      font: regular,
      size: 6,
      color: muted,
    })
    page.drawLine({ start: { x: 54, y: 67 }, end: { x: 286, y: 67 }, thickness: 0.8, color: navy })
    page.drawText('DANVIC Energy Learning', { x: 54, y: 51, font: bold, size: 8.5, color: navy })
    page.drawText('Authorized digital learning credential', {
      x: 54,
      y: 39,
      font: regular,
      size: 6.5,
      color: muted,
    })

    return Buffer.from(await document.save())
  }
}

const drawCentered = (
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  centerX: number,
  y: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  color: ReturnType<typeof rgb>,
) => {
  const textWidth = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: centerX - textWidth / 2, y, font, size, color })
}

const fitText = (
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  text: string,
  preferred: number,
  maximumWidth: number,
) => Math.min(preferred, preferred * (maximumWidth / font.widthOfTextAtSize(text, preferred)))

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value)
