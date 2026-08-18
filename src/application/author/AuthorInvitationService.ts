import { ApplicationError } from '../../entities/errors/applicationError'
import type { Admin } from '../../entities/models/Admin'
import type { AuthorInvitationRepository } from '../../entities/interfaces/authorInvitationRepository'
import type { AuthorRepository } from '../../entities/interfaces/authorRepository'
import type { SecureTokenGenerator } from '../../entities/interfaces/auth'
import type { EmailJobQueue, PasswordHasher } from '../../entities/interfaces/services'
import type { AdminNotificationService } from '../admin/AdminNotificationService'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class AuthorInvitationService {
  constructor(
    private readonly dependencies: {
      invitations: AuthorInvitationRepository
      authors: AuthorRepository
      passwordHasher: PasswordHasher
      secureTokens: SecureTokenGenerator
      emailJobs: EmailJobQueue
      notifications: AdminNotificationService
    },
  ) {}

  async invite(
    inviter: Admin,
    emails: string[],
  ): Promise<Array<{ email: string; status: 'queued' | 'already-author' | 'already-invited' }>> {
    if (!inviter.isSuperAdmin && !inviter.permissions.includes('invite_author'))
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
      status: 'queued' | 'already-author' | 'already-invited'
    }> = []
    for (const email of values) {
      if (await this.dependencies.authors.findOne({ email })) {
        results.push({ email, status: 'already-author' })
        continue
      }
      if (await this.dependencies.invitations.findActiveByEmail(email, new Date())) {
        results.push({ email, status: 'already-invited' })
        continue
      }
      const token = this.dependencies.secureTokens.token(32)
      const invitation = await this.dependencies.invitations.create({
        email,
        invitedByAdminId: inviter.id,
        tokenHash: this.dependencies.secureTokens.hash(token),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        sentAt: null,
        acceptedAt: null,
        deliveryError: null,
      })
      try {
        await this.dependencies.emailJobs.enqueue({
          type: 'author-invitation',
          invitationId: invitation.id,
          email,
          invitationToken: token,
        })
        await this.dependencies.notifications.publish({
          title: 'Author invitation queued',
          body: `An author invitation for ${email} is queued for delivery.`,
          link: '/invitations',
        })
      } catch (error) {
        await this.dependencies.invitations.markDeliveryFailed(
          invitation.id,
          error instanceof Error ? error.message : 'Failed to enqueue email',
        )
        throw error
      }
      results.push({ email, status: 'queued' })
    }
    return results
  }

  async accept(
    token: string,
    input: { firstName: string; lastName: string; password: string },
  ): Promise<void> {
    if (input.password.length < 12)
      throw new ApplicationError('Password must be at least 12 characters', 'WEAK_PASSWORD', 400)
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
      await this.dependencies.authors.create({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: invitation.email,
        bio: '',
        linkedInUrl: null,
        xUrl: null,
        instagramUrl: null,
        facebookUrl: null,
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
    } catch (error) {
      await this.dependencies.invitations.releaseClaim(invitation.id)
      throw error
    }
  }

  async list(inviter: Admin) {
    if (!inviter.isSuperAdmin && !inviter.permissions.includes('invite_author'))
      throw new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403)
    return this.dependencies.invitations.findMany()
  }
}
