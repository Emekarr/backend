import { emailDetailRows, emailLayout } from './layout'

export const studentLiveReminderEmail = (input: {
  courseName: string
  scheduledAt: string
  leadMinutes: 30 | 10
}) =>
  emailLayout({
    title: `${input.courseName} starts in ${input.leadMinutes} minutes`,
    preheader: `Your bookmarked live course starts in ${input.leadMinutes} minutes`,
    eyebrow: 'Bookmarked course reminder',
    introduction: 'The scheduled live course you bookmarked is about to begin.',
    overview: [
      { label: 'Session type', value: 'Live course' },
      { label: 'Reminder', value: `${input.leadMinutes} minutes before` },
    ],
    content: emailDetailRows([
      { label: 'Course', value: input.courseName },
      {
        label: 'Starts',
        value: new Date(input.scheduledAt).toLocaleString('en-NG', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'Africa/Lagos',
        }),
      },
    ]),
    footnote: 'You received this email because you bookmarked this scheduled live course.',
  })
