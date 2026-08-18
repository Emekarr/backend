import type { BaseEntity } from './base'

export type ActivityActorType = 'admin' | 'author' | 'student' | 'anonymous' | 'system'
export type ActivityOutcome = 'success' | 'failure'

export interface UserActivity extends BaseEntity {
  actorType: ActivityActorType
  actorId: string | null
  actorEmail: string | null
  action: string
  outcome: ActivityOutcome
  method: string | null
  path: string | null
  statusCode: number | null
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, string | number | boolean | null>
}

export type CreateUserActivity = Omit<UserActivity, keyof BaseEntity>
