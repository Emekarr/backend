import { ApplicationError } from '../../entities/errors/applicationError'
import type { Admin } from '../../entities/models/Admin'
import type { Author } from '../../entities/models/Author'
import type { SecureTokenGenerator } from '../../entities/interfaces/auth'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { EmailJobQueue, PasswordHasher } from '../../entities/interfaces/services'
import type { StudentInvitationRepository } from '../../entities/interfaces/studentInvitationRepository'
import type { StudentRepository } from '../../entities/interfaces/studentRepository'
import type { Student } from '../../entities/models/Student'
import type { AdminNotificationService } from '../admin/AdminNotificationService'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1000
const INVITATION_RESEND_MAX = 3
const INVITATION_RESEND_WINDOW_MS = 24 * 60 * 60 * 1000

export class StudentInvitationService {
  constructor(
    private readonly dependencies: {
      invitations: StudentInvitationRepository
      students: StudentRepository
      courses: CourseCatalogRepository
      passwordHasher: PasswordHasher
      secureTokens: SecureTokenGenerator
      emailJobs: EmailJobQueue
      notifications: AdminNotificationService
    },
  ) {}

  async invite(
    inviter: Admin | Author,
    inviterType: 'admin' | 'author',
    emails: string[],
    courseId?: string,
  ): Promise<
    Array<{
      email: string
      status: 'queued' | 'already-invited' | 'already-accepted' | 'resend-limit-reached'
    }>
  > {
    const normalizedCourseId = courseId ?? null
    const aggregate = normalizedCourseId
      ? await this.dependencies.courses.findById(normalizedCourseId)
      : null
    if (inviterType === 'author') {
      if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
      if (aggregate.course.createdByAuthorId !== inviter.id)
        throw new ApplicationError(
          'Authors can only invite students to their own courses',
          'FORBIDDEN',
          403,
        )
    }
    if (
      inviterType === 'admin' &&
      !(
        'isSuperAdmin' in inviter &&
        (inviter.isSuperAdmin || inviter.permissions.includes('invite_student'))
      )
    )
      throw new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403)

    const values = [...new Set(emails.map((email) => email.trim().toLowerCase()))]
    if (!values.length || values.length > 50 || values.some((email) => !EMAIL_PATTERN.test(email)))
      throw new ApplicationError(
        'Provide 1 to 50 valid unique email addresses',
        'INVALID_EMAIL_LIST',
        400,
      )
    const results: Array<{
      email: string
      status: 'queued' | 'already-invited' | 'already-accepted' | 'resend-limit-reached'
    }> = []
    for (const email of values) {
      if (await this.dependencies.invitations.findAccepted(email, normalizedCourseId)) {
        results.push({ email, status: 'already-accepted' })
        continue
      }
      const existing = await this.dependencies.invitations.findActive(
        email,
        normalizedCourseId,
        new Date(),
      )
      if (existing) {
        const now = new Date()
        const resendCount = existing.resendCount ?? 0
        const withinWindow =
          existing.lastResentAt &&
          now.getTime() - existing.lastResentAt.getTime() < INVITATION_RESEND_WINDOW_MS
        if (resendCount >= INVITATION_RESEND_MAX && withinWindow) {
          results.push({ email, status: 'resend-limit-reached' })
          continue
        }
        const token = this.dependencies.secureTokens.token(32)
        await this.dependencies.invitations.updateById(existing.id, {
          tokenHash: this.dependencies.secureTokens.hash(token),
          expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
          sentAt: null,
          deliveryError: null,
          resendCount: withinWindow ? resendCount + 1 : 1,
          lastResentAt: now,
        })
        await this.dependencies.emailJobs.cancel(existing.id).catch(() => undefined)
        await this.enqueueInvitation(existing, email, token, aggregate?.course.name)
        results.push({ email, status: 'queued' })
        continue
      }
      const token = this.dependencies.secureTokens.token(32)
      const invitation = await this.dependencies.invitations.create({
        email,
        courseId: normalizedCourseId,
        invitedByType: inviterType,
        invitedById: inviter.id,
        tokenHash: this.dependencies.secureTokens.hash(token),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
        sentAt: null,
        acceptedAt: null,
        deliveryError: null,
        resendCount: 0,
        lastResentAt: null,
      })
      await this.enqueueInvitation(invitation, email, token, aggregate?.course.name)
      results.push({ email, status: 'queued' })
    }
    return results
  }

  private async enqueueInvitation(
    invitation: {
      id: string
      email: string
    },
    email: string,
    token: string,
    courseName?: string,
  ): Promise<void> {
    try {
      await this.dependencies.emailJobs.enqueue({
        type: 'student-invitation',
        invitationId: invitation.id,
        email,
        invitationToken: token,
        ...(courseName ? { courseName } : {}),
      })
      await this.dependencies.notifications.publish({
        title: 'Learner invitation queued',
        body: courseName
          ? `A learner invitation for ${email} to ${courseName} is queued for delivery.`
          : `A learner invitation for ${email} is queued for delivery.`,
        link: '/invitations',
      })
    } catch (error) {
      await this.dependencies.invitations.markDeliveryFailed(
        invitation.id,
        error instanceof Error ? error.message : 'Failed to enqueue email',
      )
      throw error
    }
  }

  async acceptNew(
    token: string,
    input: { firstName: string; lastName: string; password: string },
  ): Promise<{ courseId: string | null }> {
    if (input.password.length < 12 || input.password.length > 128)
      throw new ApplicationError(
        'Password must be between 12 and 128 characters',
        'WEAK_PASSWORD',
        400,
      )
    const invitation = await this.dependencies.invitations.claim(
      this.dependencies.secureTokens.hash(token),
      new Date(),
    )
    if (!invitation)
      throw new ApplicationError(
        'Invitation is invalid, expired, or already accepted',
        'INVALID_INVITATION',
        400,
      )
    try {
      if (await this.dependencies.students.findOne({ email: invitation.email }))
        throw new ApplicationError(
          'An account already exists for this email; sign in to accept the invitation',
          'STUDENT_ALREADY_EXISTS',
          409,
        )
      await this.dependencies.students.create({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: invitation.email,
        bio: '',
        linkedInUrl: null,
        xUrl: null,
        facebookUrl: null,
        instagramUrl: null,
        youtubeUrl: null,
        websiteUrl: null,
        password: await this.dependencies.passwordHasher.hash(input.password),
        twoFactorEnabled: false,
        twoFactorSecretEncrypted: null,
        pendingTwoFactorSecretEncrypted: null,
        lastTwoFactorTimeStep: null,
        tokenVersion: 0,
        passwordChangedAt: new Date(),
        disabledAt: null,
        disabledReason: null,
      })
      return { courseId: invitation.courseId }
    } catch (error) {
      await this.dependencies.invitations.releaseClaim(invitation.id)
      throw error
    }
  }

  async acceptExisting(student: Student, token: string): Promise<{ courseId: string | null }> {
    const invitation = await this.dependencies.invitations.claim(
      this.dependencies.secureTokens.hash(token),
      new Date(),
    )
    if (!invitation)
      throw new ApplicationError(
        'Invitation is invalid, expired, or already accepted',
        'INVALID_INVITATION',
        400,
      )
    if (invitation.email !== student.email) {
      await this.dependencies.invitations.releaseClaim(invitation.id)
      throw new ApplicationError(
        'This invitation belongs to another email address',
        'FORBIDDEN',
        403,
      )
    }
    return { courseId: invitation.courseId }
  }

  list(inviter: Admin | Author, inviterType: 'admin' | 'author') {
    if (
      inviterType === 'admin' &&
      !(
        'isSuperAdmin' in inviter &&
        (inviter.isSuperAdmin || inviter.permissions.includes('invite_student'))
      )
    )
      throw new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403)
    return this.dependencies.invitations.findManyForInviter(inviterType, inviter.id)
  }
}
