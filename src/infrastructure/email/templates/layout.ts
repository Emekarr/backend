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
 * Email clients have uneven CSS support, so this uses tables and inline styles
 * for the same quiet, structured treatment as the course attachment viewer.
 */
export const emailLayout = (input: EmailLayoutInput): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;color:#172033;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f8fafc">
      <tr>
        <td align="center" style="padding:28px 14px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe6ef;border-radius:14px">
            <tr>
              <td style="padding:18px 24px;border-bottom:1px solid #e5eaf1">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background:#2563eb;border-radius:8px;color:#ffffff;font-size:14px;font-weight:800;line-height:28px">D</td>
                    <td style="padding-left:10px;color:#172033;font-size:16px;font-weight:800;letter-spacing:-0.3px">DANVIC</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 24px">
                <p style="margin:0 0 7px;color:#2563eb;font-size:10px;font-weight:700;letter-spacing:0.9px;line-height:15px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>
                <h1 style="margin:0;color:#172033;font-size:24px;font-weight:700;letter-spacing:-0.45px;line-height:31px">${escapeHtml(input.title)}</h1>
                <p style="margin:12px 0 0;color:#64748b;font-size:14px;line-height:22px">${escapeHtml(input.introduction)}</p>
                ${input.overview?.length ? renderOverview(input.overview) : ''}
                <div style="margin:20px 0 0;color:#475569;font-size:14px;line-height:22px">${input.content}</div>
                ${
                  input.action
                    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0"><tr><td align="center" style="background:#2563eb;border-radius:9px"><a href="${escapeAttribute(input.action.url)}" style="display:inline-block;padding:12px 18px;color:#ffffff;font-size:14px;font-weight:700;line-height:20px;text-decoration:none">${escapeHtml(input.action.label)}</a></td></tr></table>`
                    : ''
                }
                <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #e5eaf1;color:#7b8797;font-size:12px;line-height:18px">${escapeHtml(input.footnote)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0;color:#94a3b8;font-size:11px;line-height:16px">DANVIC Energy Learning</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

export const emailDetailRows = (details: EmailDetail[]): string => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;border:1px solid #e5eaf1;border-radius:10px;background:#ffffff">
    ${details
      .map(
        (detail) => `<tr>
          <td style="padding:12px 14px;border-bottom:1px solid #e5eaf1;color:#7b8797;font-size:10px;font-weight:700;letter-spacing:0.55px;line-height:15px;text-transform:uppercase;vertical-align:top">${escapeHtml(detail.label)}</td>
          <td align="right" style="padding:12px 14px 12px 8px;border-bottom:1px solid #e5eaf1;color:#172033;font-size:13px;font-weight:600;line-height:18px;text-align:right;vertical-align:top">${escapeHtml(detail.value)}${detail.note ? `<br><span style="color:#7b8797;font-size:11px;font-weight:400;line-height:16px">${escapeHtml(detail.note)}</span>` : ''}</td>
        </tr>`,
      )
      .join('')}
  </table>`

const renderOverview = (details: EmailDetail[]): string => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:20px 0 0;border:1px solid #dbe7fb;border-radius:10px;background:#f7faff">
    <tr>
      ${details
        .map(
          (
            detail,
          ) => `<td width="${Math.floor(100 / details.length)}%" style="padding:12px 14px;vertical-align:top">
            <p style="margin:0;color:#64748b;font-size:10px;font-weight:700;letter-spacing:0.55px;line-height:15px;text-transform:uppercase">${escapeHtml(detail.label)}</p>
            <p style="margin:4px 0 0;color:#1e3a8a;font-size:13px;font-weight:700;line-height:18px">${escapeHtml(detail.value)}</p>
            ${detail.note ? `<p style="margin:2px 0 0;color:#64748b;font-size:11px;line-height:16px">${escapeHtml(detail.note)}</p>` : ''}
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
