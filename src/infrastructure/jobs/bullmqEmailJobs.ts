import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import type { AdminInvitationRepository } from '../../entities/interfaces/adminInvitationRepository'
import type { AuthorInvitationRepository } from '../../entities/interfaces/authorInvitationRepository'
import type { StudentInvitationRepository } from '../../entities/interfaces/studentInvitationRepository'
import type { LiveReminderPreferenceRepository } from '../../entities/interfaces/liveReminderPreferenceRepository'
import type {
  CertificateDocumentRenderer,
  CertificateRepository,
} from '../../entities/interfaces/certificateRepository'
import type { Logger } from '../../entities/interfaces/logger'
import type {
  EmailJob,
  EmailJobQueue,
  EmailSender,
  LifecycleService,
} from '../../entities/interfaces/services'
import type { EnvironmentConfig } from '../config/environment'
import { invitationEmail } from '../email/templates/invitation'
import { passwordResetEmail } from '../email/templates/passwordReset'
import { certificateEmail } from '../email/templates/certificate'
import { liveReminderEmail } from '../email/templates/liveReminder'

export class BullMQEmailJobs implements EmailJobQueue, LifecycleService {
  private queue?: Queue<EmailJob>
  private worker?: Worker<EmailJob>
  private producerConnection?: IORedis
  private workerConnection?: IORedis
  private readonly queueName: string

  constructor(
    private readonly config: EnvironmentConfig,
    private readonly emailSender: EmailSender,
    private readonly invitations: AdminInvitationRepository,
    private readonly authorInvitations: AuthorInvitationRepository,
    private readonly studentInvitations: StudentInvitationRepository,
    private readonly reminders: LiveReminderPreferenceRepository,
    private readonly certificates: CertificateRepository,
    private readonly certificateRenderer: CertificateDocumentRenderer,
    private readonly logger: Logger,
  ) {
    this.queueName = `${config.SERVICE_NAME.replace(/[^a-zA-Z0-9_-]/g, '-')}-emails`
  }

  async connect(): Promise<void> {
    if (this.queue || this.worker) {
      return
    }

    this.producerConnection = new IORedis(this.config.REDIS_URI, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    this.workerConnection = new IORedis(this.config.REDIS_URI, {
      maxRetriesPerRequest: null,
    })

    this.queue = new Queue<EmailJob>(this.queueName, {
      connection: this.producerConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    })
    this.worker = new Worker<EmailJob>(this.queueName, (job) => this.process(job), {
      connection: this.workerConnection,
      concurrency: 5,
    })

    this.queue.on('error', (error) => {
      this.logger.error({ err: error, queue: this.queueName }, 'BullMQ email queue error')
    })
    this.worker.on('error', (error) => {
      this.logger.error({ err: error, queue: this.queueName }, 'BullMQ email worker error')
    })
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { err: error, queue: this.queueName, jobId: job?.id, jobName: job?.name },
        'BullMQ email job failed',
      )
    })
    this.worker.on('completed', (job) => {
      this.logger.info(
        { queue: this.queueName, jobId: job.id, ...emailJobContext(job.data) },
        'Email job completed',
      )
    })

    await Promise.all([this.queue.waitUntilReady(), this.worker.waitUntilReady()])
    this.logger.info({ queue: this.queueName }, 'BullMQ email queue and worker started')
  }

  async disconnect(): Promise<void> {
    await this.worker?.close()
    await this.queue?.close()
    await this.workerConnection?.quit()
    await this.producerConnection?.quit()

    this.worker = undefined
    this.queue = undefined
    this.workerConnection = undefined
    this.producerConnection = undefined
    this.logger.info({ queue: this.queueName }, 'BullMQ email queue and worker stopped')
  }

  async enqueue(job: EmailJob): Promise<void> {
    if (!this.queue) {
      throw new Error('BullMQ email queue is not started')
    }

    const queued = await this.queue.add(job.type, job, {
      ...(job.type === 'admin-invitation' ||
      job.type === 'author-invitation' ||
      job.type === 'student-invitation'
        ? { jobId: job.invitationId }
        : {}),
    })
    this.logger.info(
      { queue: this.queueName, jobId: queued.id, ...emailJobContext(job) },
      'Email job queued',
    )
  }

  async schedule(job: EmailJob, options: { jobId: string; delayMs: number }): Promise<void> {
    if (!this.queue) throw new Error('BullMQ email queue is not started')
    const queued = await this.queue.add(job.type, job, {
      jobId: options.jobId,
      delay: Math.max(0, options.delayMs),
    })
    this.logger.info(
      {
        queue: this.queueName,
        jobId: queued.id,
        delayMs: Math.max(0, options.delayMs),
        ...emailJobContext(job),
      },
      'Email job scheduled',
    )
  }

  async cancel(jobId: string): Promise<void> {
    if (!this.queue) throw new Error('BullMQ email queue is not started')
    const job = await this.queue.getJob(jobId)
    await job?.remove()
    this.logger.info(
      { queue: this.queueName, jobId, cancelled: Boolean(job) },
      'Scheduled email job cancellation requested',
    )
  }

  private async process(job: Job<EmailJob>): Promise<void> {
    this.logger.info(
      { queue: this.queueName, jobId: job.id, ...emailJobContext(job.data) },
      'Email job processing started',
    )
    if (job.data.type === 'live-reminder') {
      try {
        await this.emailSender.send({
          to: job.data.email,
          subject: `Reminder: ${job.data.courseName} starts soon`,
          html: liveReminderEmail(job.data),
        })
        await this.reminders.markDelivered(job.data.authorId, job.data.courseId, new Date())
      } catch (error) {
        await this.reminders.markDeliveryFailed(
          job.data.authorId,
          job.data.courseId,
          error instanceof Error ? error.message : 'Unknown delivery error',
        )
        throw error
      }
      return
    }

    if (job.data.type === 'password-reset') {
      await this.emailSender.send({
        to: job.data.email,
        subject: 'Your DANVIC password reset code',
        html: passwordResetEmail(job.data.code),
      })
      return
    }

    if (job.data.type === 'certificate') {
      const certificate = await this.certificates.findById(job.data.certificateId)
      if (!certificate) throw new Error('Certificate email job references a missing certificate')
      const pdf = await this.certificateRenderer.render(certificate)
      const verificationUrl = this.certificateRenderer.verificationUrl(
        certificate.certificateNumber,
      )
      await this.emailSender.send({
        to: job.data.email,
        subject: `Your certificate for ${certificate.courseName}`,
        html: certificateEmail(certificate, verificationUrl),
        attachments: [
          {
            filename: `${certificate.certificateNumber}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      })
      return
    }

    try {
      const isAuthorInvitation = job.data.type === 'author-invitation'
      const isStudentInvitation = job.data.type === 'student-invitation'
      const rawCourseName = job.data.type === 'student-invitation' ? job.data.courseName : undefined
      const courseName =
        typeof rawCourseName === 'string' && rawCourseName.trim() && rawCourseName !== 'undefined'
          ? rawCourseName.trim()
          : undefined
      const acceptanceUrl = isStudentInvitation
        ? `${this.config.STUDENT_APP_BASE_URL}/invitations/accept?token=${encodeURIComponent(job.data.invitationToken)}`
        : isAuthorInvitation
          ? `${this.config.AUTHOR_APP_BASE_URL}/invitations/accept?token=${encodeURIComponent(job.data.invitationToken)}`
          : `${this.config.ADMIN_APP_BASE_URL}/invitations/accept?token=${encodeURIComponent(job.data.invitationToken)}`
      await this.emailSender.send({
        to: job.data.email,
        subject: isStudentInvitation
          ? courseName
            ? `You have been invited to ${courseName}`
            : 'You have been invited to DANVIC learning'
          : isAuthorInvitation
            ? 'You have been invited to author DANVIC courses'
            : 'You have been invited to administer DANVIC',
        html: invitationEmail({
          acceptanceUrl,
          role: isStudentInvitation ? 'student' : isAuthorInvitation ? 'author' : 'administrator',
          ...(courseName ? { courseName } : {}),
        }),
      })
      const repository = isStudentInvitation
        ? this.studentInvitations
        : isAuthorInvitation
          ? this.authorInvitations
          : this.invitations
      await repository.markSent(job.data.invitationId, new Date())
    } catch (error) {
      const repository =
        job.data.type === 'student-invitation'
          ? this.studentInvitations
          : job.data.type === 'author-invitation'
            ? this.authorInvitations
            : this.invitations
      await repository.markDeliveryFailed(
        job.data.invitationId,
        error instanceof Error ? error.message : 'Unknown delivery error',
      )
      throw error
    }
  }
}

const emailJobContext = (job: EmailJob) => {
  if (job.type === 'live-reminder')
    return { jobType: job.type, authorId: job.authorId, courseId: job.courseId }
  if (job.type === 'certificate') return { jobType: job.type, certificateId: job.certificateId }
  if (job.type === 'password-reset') return { jobType: job.type }
  return { jobType: job.type, invitationId: job.invitationId }
}
