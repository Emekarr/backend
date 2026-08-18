import type { Repository } from './database'
import type { AdminInvitation, CreateAdminInvitation } from '../models/AdminInvitation'

export interface AdminInvitationRepository
  extends Repository<AdminInvitation, CreateAdminInvitation> {
  findActiveByEmail(email: string, now: Date): Promise<AdminInvitation | null>
  findByTokenHash(tokenHash: string): Promise<AdminInvitation | null>
  markSent(id: string, sentAt: Date): Promise<void>
  markDeliveryFailed(id: string, error: string): Promise<void>
  claim(tokenHash: string, acceptedAt: Date): Promise<AdminInvitation | null>
  releaseClaim(id: string): Promise<void>
}
