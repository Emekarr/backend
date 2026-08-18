import { emailDetailRows, emailLayout } from './layout'

export const liveReminderEmail = (input: { courseName: string; scheduledAt: string }) =>
  emailLayout({
    title: 'Your live class is coming up',
    preheader: `${input.courseName} starts soon`,
    eyebrow: 'Live class reminder',
    introduction: 'Your scheduled class is coming up.',
    overview: [
      { label: 'Session type', value: 'Live class' },
      { label: 'Preparation', value: 'Open dashboard early' },
    ],
    content: `${emailDetailRows([
      { label: 'Course', value: input.courseName },
      {
        label: 'Starts',
        value: new Date(input.scheduledAt).toLocaleString('en-NG', {
          dateStyle: 'full',
          timeStyle: 'short',
        }),
      },
    ])}<p style="margin:18px 0 0">Open your author dashboard before the session to prepare the classroom.</p>`,
    footnote: 'You received this reminder because it is enabled for this live course.',
  })
