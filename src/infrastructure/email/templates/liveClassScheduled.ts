import { emailDetailRows, emailLayout } from './layout'

export const liveClassScheduledEmail = (input: {
  courseName: string
  scheduledAt: string | null
  durationMinutes: number
  joinUrl: string
}) => {
  const starts =
    input.scheduledAt !== null && input.scheduledAt !== undefined
      ? new Date(input.scheduledAt).toLocaleString('en-NG', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'Africa/Lagos',
        })
      : 'To be announced by the course author'
  return emailLayout({
    title: `Live class scheduled for ${input.courseName}`,
    preheader: `A live class has been scheduled for ${input.courseName}`,
    eyebrow: 'Live class',
    introduction: `You are enrolled in ${input.courseName}, and a new live class has been scheduled. Open the course page to join when the class is live.`,
    overview: [
      { label: 'Session type', value: 'Live class' },
      { label: 'Length', value: `${input.durationMinutes} minutes` },
    ],
    content: emailDetailRows([
      { label: 'Course', value: input.courseName },
      { label: 'Starts', value: starts },
    ]),
    action: { label: 'Open the course', url: input.joinUrl },
    footnote:
      'You received this email because you are enrolled in this course. You can only join the class while it is live.',
  })
}
