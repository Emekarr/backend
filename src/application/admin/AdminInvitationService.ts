import type { AdminInvitationRepository } from '../../entities/interfaces/adminInvitationRepository'
import type { AdminRepository } from '../../entities/interfaces/adminRepository'
import type { SecureTokenGenerator } from '../../entities/interfaces/auth'
import type { EmailJobQueue, PasswordHasher } from '../../entities/interfaces/services'
import { ApplicationError } from '../../entities/errors/applicationError'
import type { Admin } from '../../entities/models/Admin'
import type { AdminInvitation } from '../../entities/models/AdminInvitation'
import type { Permission } from '../../entities/models/Permissions'
import type { AdminNotificationService } from './AdminNotificationService'

const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1_000
const INVITATION_RESEND_MAX = 3
const INVITATION_RESEND_WINDOW_MS = 24 * 60 * 60 * 1_000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AdminInvitationDependencies {
  invitations: AdminInvitationRepository
  admins: AdminRepository
  passwordHasher: PasswordHasher
  secureTokens: SecureTokenGenerator
  emailJobs: EmailJobQueue
  notifications: AdminNotificationService
}

export interface InvitationResult {
  email: string
  status: 'queued' | 'already-admin' | 'already-invited' | 'resend-limit-reached'
}

export class AdminInvitationService {
  constructor(private readonly dependencies: AdminInvitationDependencies) {}

  async invite(inviter: Admin, emails: string[]): Promise<InvitationResult[]> {
    this.assertPermission(inviter, 'invite_admin')

    const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()))]
    if (normalizedEmails.length === 0 || normalizedEmails.length > 50) {
      throw new ApplicationError(
        'Provide between 1 and 50 unique email addresses',
        'INVALID_EMAIL_LIST',
        400,
      )
    }

    if (normalizedEmails.some((email) => !EMAIL_PATTERN.test(email))) {
      throw new ApplicationError('One or more email addresses are invalid', 'INVALID_EMAIL', 400)
    }

    const results: InvitationResult[] = []

    for (const email of normalizedEmails) {
      if (await this.dependencies.admins.findOne({ email })) {
        results.push({ email, status: 'already-admin' })
        continue
      }

      const existing = await this.dependencies.invitations.findActiveByEmail(email, new Date())
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
        const invitationToken = this.dependencies.secureTokens.token(32)
        await this.dependencies.invitations.updateById(existing.id, {
          tokenHash: this.dependencies.secureTokens.hash(invitationToken),
          expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
          sentAt: null,
          deliveryError: null,
          resendCount: withinWindow ? resendCount + 1 : 1,
          lastResentAt: now,
        })
        await this.dependencies.emailJobs.cancel(existing.id).catch(() => undefined)
        await this.enqueueInvitation(existing, email, invitationToken)
        results.push({ email, status: 'queued' })
        continue
      }

      const invitationToken = this.dependencies.secureTokens.token(32)
      const invitation = await this.dependencies.invitations.create({
        email,
        invitedByAdminId: inviter.id,
        permissions: [],
        tokenHash: this.dependencies.secureTokens.hash(invitationToken),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
        sentAt: null,
        acceptedAt: null,
        deliveryError: null,
        resendCount: 0,
        lastResentAt: null,
      })

      await this.enqueueInvitation(invitation, email, invitationToken)
      results.push({ email, status: 'queued' })
    }

    return results
  }

  private async enqueueInvitation(
    invitation: AdminInvitation,
    email: string,
    invitationToken: string,
  ): Promise<void> {
    try {
      await this.dependencies.emailJobs.enqueue({
        type: 'admin-invitation',
        invitationId: invitation.id,
        email,
        invitationToken,
      })
      await this.dependencies.notifications.publish({
        title: 'Admin invitation queued',
        body: `An administrator invitation for ${email} is queued for delivery.`,
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

  async accept(
    invitationToken: string,
    input: { firstName: string; lastName: string; password: string },
  ): Promise<void> {
    if (input.password.length < 12 || input.password.length > 128) {
      throw new ApplicationError(
        'Password must be between 12 and 128 characters',
        'WEAK_PASSWORD',
        400,
      )
    }

    const tokenHash = this.dependencies.secureTokens.hash(invitationToken)
    const invitation = await this.dependencies.invitations.claim(tokenHash, new Date())

    if (!invitation) {
      throw new ApplicationError(
        'Invitation is invalid, expired, or already accepted',
        'INVALID_INVITATION',
        400,
      )
    }

    try {
      if (await this.dependencies.admins.findOne({ email: invitation.email })) {
        throw new ApplicationError(
          'An admin account already exists for this email',
          'ADMIN_EXISTS',
          409,
        )
      }

      await this.dependencies.admins.create({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: invitation.email,
        password: await this.dependencies.passwordHasher.hash(input.password),
        permissions: invitation.permissions,
        isSuperAdmin: false,
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

  async list(requester: Admin): Promise<AdminInvitation[]> {
    this.assertPermission(requester, 'invite_admin')
    return this.dependencies.invitations.findMany()
  }

  private assertPermission(admin: Admin, permission: Permission): void {
    if (!admin.isSuperAdmin && !admin.permissions.includes(permission)) {
      throw new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403)
    }
  }
}
