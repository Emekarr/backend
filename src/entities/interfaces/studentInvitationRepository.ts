import type { Repository } from './database'
import type { CreateStudentInvitation, StudentInvitation } from '../models/StudentInvitation'

export interface StudentInvitationRepository
  extends Repository<StudentInvitation, CreateStudentInvitation> {
  findActive(email: string, courseId: string | null, now: Date): Promise<StudentInvitation | null>
  findAccepted(email: string, courseId: string | null): Promise<StudentInvitation | null>
  findManyForInviter(
    invitedByType: 'admin' | 'author',
    invitedById: string,
  ): Promise<StudentInvitation[]>
  markSent(id: string, sentAt: Date): Promise<void>
  markDeliveryFailed(id: string, error: string): Promise<void>
  claim(tokenHash: string, acceptedAt: Date): Promise<StudentInvitation | null>
  releaseClaim(id: string): Promise<void>
}
