import type { Repository } from './database'
import type { CreateStudent, Student } from '../models/Student'

export interface StudentRepository extends Repository<Student, CreateStudent> {
  findByEmailForAuthentication(email: string): Promise<Student | null>
  consumeTwoFactorTimeStep(
    studentId: string,
    timeStep: number,
    changes?: Partial<Student>,
  ): Promise<Student | null>
}
