import { emailLayout, escapeHtml } from './layout'

export const passwordResetEmail = (code: string): string =>
  emailLayout({
    preheader: `Your DANVIC password reset code is ${code}`,
    eyebrow: 'Account recovery',
    title: 'Reset your password',
    introduction: 'A password reset was requested for your DANVIC account.',
    overview: [
      { label: 'Request type', value: 'Password reset' },
      { label: 'Code validity', value: '10 minutes' },
    ],
    content: `<p style="margin:0 0 12px">Enter this one-time code in the secure reset screen:</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0"><tr><td style="padding:17px 20px;background:#eef4ff;border:1px solid #cfd6e1;border-radius:12px;color:#1d4ed8;font-size:27px;font-weight:800;letter-spacing:7px;line-height:30px">${escapeHtml(code)}</td></tr></table>`,
    footnote:
      'This code expires in 10 minutes and can only be used once. If you did not request it, you can safely ignore this email.',
  })
