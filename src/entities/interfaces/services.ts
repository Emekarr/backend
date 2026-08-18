export interface LifecycleService {
  connect(): Promise<void>
  disconnect(): Promise<void>
}

export interface HttpServer {
  start(): Promise<void>
  stop(): Promise<void>
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, encodedHash: string): Promise<boolean>
}

export interface PasswordResetEmailJob {
  type: 'password-reset'
  email: string
  code: string
}

export interface AdminInvitationEmailJob {
  type: 'admin-invitation'
  invitationId: string
  email: string
  invitationToken: string
}

export interface AuthorInvitationEmailJob {
  type: 'author-invitation'
  invitationId: string
  email: string
  invitationToken: string
}

export interface StudentInvitationEmailJob {
  type: 'student-invitation'
  invitationId: string
  email: string
  invitationToken: string
  courseName?: string
}

export interface CertificateEmailJob {
  type: 'certificate'
  certificateId: string
  email: string
}

export interface LiveReminderEmailJob {
  type: 'live-reminder'
  authorId: string
  courseId: string
  email: string
  courseName: string
  scheduledAt: string
}

export type EmailJob =
  | PasswordResetEmailJob
  | AdminInvitationEmailJob
  | AuthorInvitationEmailJob
  | StudentInvitationEmailJob
  | CertificateEmailJob
  | LiveReminderEmailJob

export interface EmailJobQueue {
  enqueue(job: EmailJob): Promise<void>
  schedule(job: EmailJob, options: { jobId: string; delayMs: number }): Promise<void>
  cancel(jobId: string): Promise<void>
}

export interface EmailSender {
  send(input: {
    to: string
    subject: string
    html: string
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
  }): Promise<void>
}

export interface ActivityJobQueue {
  enqueue(activity: import('../models/UserActivity').CreateUserActivity): Promise<void>
}
