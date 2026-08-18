import { emailDetailRows, emailLayout } from './layout'

export const invitationEmail = (input: {
  acceptanceUrl: string
  role: 'administrator' | 'author' | 'student'
  courseName?: string
}): string =>
  emailLayout({
    preheader: `You have been invited to join DANVIC as ${input.role === 'administrator' || input.role === 'author' ? 'an' : 'a'} ${input.role}`,
    eyebrow: 'Secure invitation',
    title:
      input.role === 'author'
        ? 'Create courses with DANVIC'
        : input.role === 'student'
          ? input.courseName
            ? `Join ${input.courseName}`
            : 'Join DANVIC learning'
          : 'Join DANVIC operations',
    introduction:
      input.role === 'author'
        ? 'You have been invited to the DANVIC author workspace, where you can build and publish focused learning experiences.'
        : input.role === 'student'
          ? input.courseName
            ? `You have been invited to participate in ${input.courseName}. Accept the invitation, secure your account with two-factor authentication, and enroll to begin.`
            : 'You have been invited to create a DANVIC learning account. Accept the invitation and secure your account with two-factor authentication.'
          : 'You have been invited to the DANVIC administration workspace to help manage secure learning operations.',
    overview: [
      { label: 'Workspace', value: input.role === 'student' ? 'Learning' : 'Operations' },
      { label: 'Access window', value: '72 hours' },
    ],
    content: `${emailDetailRows([
      { label: 'Account type', value: input.role },
      ...(input.courseName ? [{ label: 'Course', value: input.courseName }] : []),
      { label: 'Sign-in security', value: 'Two-factor authentication' },
    ])}<p style="margin:18px 0 0">Use the button below to create your account. This invitation is tied to this email address.</p>`,
    action: { label: 'Accept invitation', url: input.acceptanceUrl },
    footnote:
      'This invitation expires after 72 hours and can only be accepted once. If you were not expecting it, ignore this email.',
  })
