export interface EmailDetail {
  label: string
  value: string
  note?: string
}

interface EmailLayoutInput {
  preheader: string
  eyebrow: string
  title: string
  introduction: string
  content: string
  action?: { label: string; url: string }
  footnote: string
  overview?: EmailDetail[]
}

/**
 * Email clients have uneven CSS support, so this intentionally mirrors the
 * dashboard with tables and inline styles instead of relying on web CSS.
 */
export const emailLayout = (input: EmailLayoutInput): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fb;color:#101828;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f6f8fb">
      <tr>
        <td align="center" style="padding:32px 14px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e6eaf0;border-radius:16px">
            <tr>
              <td style="padding:21px 28px;border-bottom:1px solid #e6eaf0">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="24" height="24" align="center" valign="middle" style="width:24px;height:24px;background:#2563eb;border-radius:7px;color:#ffffff;font-size:13px;font-weight:800;line-height:24px">D</td>
                    <td style="padding-left:9px;color:#101828;font-size:17px;font-weight:800;letter-spacing:-0.4px">DANVIC</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 28px 30px">
                <p style="margin:0 0 8px;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:1.05px;line-height:16px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>
                <h1 style="margin:0;color:#101828;font-size:28px;font-weight:700;letter-spacing:-0.7px;line-height:34px">${escapeHtml(input.title)}</h1>
                <p style="margin:15px 0 0;color:#5b6470;font-size:15px;line-height:24px">${escapeHtml(input.introduction)}</p>
                ${input.overview?.length ? renderOverview(input.overview) : ''}
                <div style="margin:24px 0 0;color:#344054;font-size:14px;line-height:22px">${input.content}</div>
                ${
                  input.action
                    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0"><tr><td align="center" style="background:#2563eb;border-radius:12px"><a href="${escapeAttribute(input.action.url)}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:14px;font-weight:700;line-height:20px;text-decoration:none">${escapeHtml(input.action.label)}</a></td></tr></table>`
                    : ''
                }
                <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e6eaf0;color:#667085;font-size:12px;line-height:19px">${escapeHtml(input.footnote)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:17px 0 0;color:#98a2b3;font-size:11px;line-height:16px">DANVIC Energy Learning · Secure training operations</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

export const emailDetailRows = (details: EmailDetail[]): string => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;border-top:1px solid #e6eaf0">
    ${details
      .map(
        (detail) => `<tr>
          <td style="padding:13px 0;border-bottom:1px solid #e6eaf0;color:#667085;font-size:11px;font-weight:700;letter-spacing:0.6px;line-height:16px;text-transform:uppercase;vertical-align:top">${escapeHtml(detail.label)}</td>
          <td align="right" style="padding:13px 0 13px 18px;border-bottom:1px solid #e6eaf0;color:#101828;font-size:13px;font-weight:600;line-height:18px;text-align:right;vertical-align:top">${escapeHtml(detail.value)}${detail.note ? `<br><span style="color:#667085;font-size:11px;font-weight:400;line-height:16px">${escapeHtml(detail.note)}</span>` : ''}</td>
        </tr>`,
      )
      .join('')}
  </table>`

const renderOverview = (details: EmailDetail[]): string => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:25px 0 0;border-top:1px solid #e6eaf0">
    <tr>
      ${details
        .map(
          (
            detail,
          ) => `<td width="${Math.floor(100 / details.length)}%" style="padding:13px 10px 12px 0;border-bottom:1px solid #e6eaf0;vertical-align:top">
            <p style="margin:0;color:#667085;font-size:10px;font-weight:700;letter-spacing:0.55px;line-height:15px;text-transform:uppercase">${escapeHtml(detail.label)}</p>
            <p style="margin:4px 0 0;color:#101828;font-size:13px;font-weight:700;line-height:18px">${escapeHtml(detail.value)}</p>
            ${detail.note ? `<p style="margin:2px 0 0;color:#667085;font-size:11px;line-height:16px">${escapeHtml(detail.note)}</p>` : ''}
          </td>`,
        )
        .join('')}
    </tr>
  </table>`

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character)

export const escapeAttribute = escapeHtml

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
