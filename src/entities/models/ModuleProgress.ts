import type { BaseEntity } from './base'

export interface ModuleProgress extends BaseEntity {
  enrollmentId: string
  courseId: string
  moduleId: string
  studentId: string
  completedAt: Date
}

export type CreateModuleProgress = Omit<ModuleProgress, keyof BaseEntity>
