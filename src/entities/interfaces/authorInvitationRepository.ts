import type { Repository } from './database'
import type { AuthorInvitation, CreateAuthorInvitation } from '../models/AuthorInvitation'

export interface AuthorInvitationRepository
  extends Repository<AuthorInvitation, CreateAuthorInvitation> {
  findActiveByEmail(email: string, now: Date): Promise<AuthorInvitation | null>
  markSent(id: string, sentAt: Date): Promise<void>
  markDeliveryFailed(id: string, error: string): Promise<void>
  claim(tokenHash: string, acceptedAt: Date): Promise<AuthorInvitation | null>
  releaseClaim(id: string): Promise<void>
}
