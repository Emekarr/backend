import { emailLayout, escapeHtml } from './layout'

export const contentReviewEmail = (input: {
  contentTitle: string
  decision: 'approved' | 'rejected' | 'needs_revision'
  summary: string
  reviewUrl: string
}) => {
  const label =
    input.decision === 'approved'
      ? 'approved'
      : input.decision === 'needs_revision'
        ? 'returned for revision'
        : 'rejected'
  return emailLayout({
    preheader: `${input.contentTitle} was ${label}`,
    eyebrow: 'Content assessment',
    title: `Your content was ${label}`,
    introduction: `The Content Assessment team reviewed ${input.contentTitle}.`,
    content: input.summary
      ? `<p style="margin:0"><strong>Feedback</strong><br>${escapeHtml(input.summary)}</p>`
      : '<p style="margin:0">Open your author workspace to view the review record.</p>',
    action: { label: 'View review', url: input.reviewUrl },
    footnote: 'Review decisions and version history remain available in your DANVIC workspace.',
  })
}
