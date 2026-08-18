import type { Repository } from './database'
import type { Admin, CreateAdmin } from '../models/Admin'

export interface AdminRepository extends Repository<Admin, CreateAdmin> {
  findByEmailForAuthentication(email: string): Promise<Admin | null>
  consumeTwoFactorTimeStep(
    adminId: string,
    timeStep: number,
    changes?: Partial<Admin>,
  ): Promise<Admin | null>
}
