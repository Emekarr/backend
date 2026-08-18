import { Resend } from 'resend'
import type { EmailSender } from '../../entities/interfaces/services'

export class ResendEmailSender implements EmailSender {
  private readonly resend: Resend

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey)
  }

  async send(input: {
    to: string
    subject: string
    html: string
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
  }): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    })

    if (error) {
      throw new Error(`Resend email failed: ${error.message}`)
    }
  }
}
