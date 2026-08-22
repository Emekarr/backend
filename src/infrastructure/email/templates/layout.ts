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

/** Email clients have uneven CSS support, so the minimal author-workspace
 * treatment is expressed with tables and inline styles. */
export const emailLayout = (input: EmailLayoutInput): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;color:#243044;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f6f8">
      <tr>
        <td align="center" style="padding:36px 14px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:580px;background:#ffffff;border:1px solid #dde3eb;border-radius:12px">
            <tr>
              <td style="padding:20px 28px;border-top:3px solid #2563eb;border-bottom:1px solid #e5e9ef;border-radius:12px 12px 0 0">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:#2563eb;border-radius:7px;color:#ffffff;font-size:13px;font-weight:800;line-height:26px">D</td>
                    <td style="padding-left:9px;color:#243044;font-size:15px;font-weight:750;letter-spacing:-0.2px">DANVIC</td>
                    <td style="padding-left:9px;color:#98a2b3;font-size:11px;line-height:16px">Energy Learning</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 26px">
                <p style="margin:0 0 8px;color:#2563eb;font-size:10px;font-weight:700;letter-spacing:1px;line-height:15px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>
                <h1 style="margin:0;color:#243044;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:33px">${escapeHtml(input.title)}</h1>
                <p style="margin:12px 0 0;color:#667085;font-size:14px;line-height:22px">${escapeHtml(input.introduction)}</p>
                ${input.overview?.length ? renderOverview(input.overview) : ''}
                <div style="margin:22px 0 0;color:#475467;font-size:14px;line-height:22px">${input.content}</div>
                ${
                  input.action
                    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 0"><tr><td align="center" style="background:#2563eb;border-radius:8px"><a href="${escapeAttribute(input.action.url)}" style="display:inline-block;padding:11px 17px;color:#ffffff;font-size:13px;font-weight:700;line-height:20px;text-decoration:none">${escapeHtml(input.action.label)}</a></td></tr></table>`
                    : ''
                }
                <p style="margin:28px 0 0;padding-top:17px;border-top:1px solid #e5e9ef;color:#858f9f;font-size:11px;line-height:18px">${escapeHtml(input.footnote)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0;color:#98a2b3;font-size:10px;line-height:16px">A secure message from DANVIC Energy Learning</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

export const emailDetailRows = (details: EmailDetail[]): string => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;border-top:1px solid #dfe4eb">
    ${details
      .map(
        (detail) => `<tr>
          <td width="36%" style="padding:12px 10px 12px 0;border-bottom:1px solid #e5e9ef;color:#7b8494;font-size:10px;font-weight:700;letter-spacing:0.55px;line-height:16px;text-transform:uppercase;vertical-align:top">${escapeHtml(detail.label)}</td>
          <td style="padding:12px 0 12px 10px;border-bottom:1px solid #e5e9ef;color:#344054;font-size:13px;font-weight:600;line-height:18px;vertical-align:top">${escapeHtml(detail.value)}${detail.note ? `<br><span style="color:#858f9f;font-size:11px;font-weight:400;line-height:16px">${escapeHtml(detail.note)}</span>` : ''}</td>
        </tr>`,
      )
      .join('')}
  </table>`

const renderOverview = (details: EmailDetail[]): string => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:22px 0 0;border-top:1px solid #dfe4eb;border-bottom:1px solid #dfe4eb">
    <tr>
      ${details
        .map(
          (
            detail,
          ) => `<td width="${Math.floor(100 / details.length)}%" style="padding:13px 14px 13px 0;vertical-align:top">
            <p style="margin:0;color:#7b8494;font-size:9px;font-weight:700;letter-spacing:0.6px;line-height:15px;text-transform:uppercase">${escapeHtml(detail.label)}</p>
            <p style="margin:3px 0 0;color:#344054;font-size:13px;font-weight:650;line-height:18px">${escapeHtml(detail.value)}</p>
            ${detail.note ? `<p style="margin:2px 0 0;color:#858f9f;font-size:11px;line-height:16px">${escapeHtml(detail.note)}</p>` : ''}
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
