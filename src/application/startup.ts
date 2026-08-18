import type { AdminRepository } from '../entities/interfaces/adminRepository'
import type { Logger } from '../entities/interfaces/logger'
import type { PasswordHasher } from '../entities/interfaces/services'
import { PERMISSIONS } from '../entities/models/Permissions'

export interface SuperAdminInput {
  firstName: string
  lastName: string
  email: string
  password: string
}

export interface StartupDependencies {
  adminRepository: AdminRepository
  passwordHasher: PasswordHasher
  logger: Logger
}

export class StartupService {
  constructor(private readonly dependencies: StartupDependencies) {}

  async createSuperAdmin(input: SuperAdminInput): Promise<void> {
    const existingAdmin = await this.dependencies.adminRepository.findOne({ isSuperAdmin: true })

    if (existingAdmin) {
      const securityAdmin =
        (await this.dependencies.adminRepository.findByEmailForAuthentication(
          existingAdmin.email,
        )) ?? existingAdmin
      if (
        securityAdmin.twoFactorEnabled === undefined ||
        securityAdmin.tokenVersion === undefined ||
        securityAdmin.passwordChangedAt === undefined
      ) {
        await this.dependencies.adminRepository.updateById(existingAdmin.id, {
          twoFactorEnabled: securityAdmin.twoFactorEnabled ?? false,
          twoFactorSecretEncrypted: securityAdmin.twoFactorSecretEncrypted ?? null,
          pendingTwoFactorSecretEncrypted: securityAdmin.pendingTwoFactorSecretEncrypted ?? null,
          lastTwoFactorTimeStep: securityAdmin.lastTwoFactorTimeStep ?? null,
          tokenVersion: securityAdmin.tokenVersion ?? 0,
          passwordChangedAt: securityAdmin.passwordChangedAt ?? null,
        })
        this.dependencies.logger.info('Existing super admin security fields initialized')
      }
      this.dependencies.logger.info('Super admin already exists; bootstrap skipped')
      return
    }

    const password = await this.dependencies.passwordHasher.hash(input.password)

    await this.dependencies.adminRepository.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      password,
      permissions: [...PERMISSIONS],
      isSuperAdmin: true,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      pendingTwoFactorSecretEncrypted: null,
      lastTwoFactorTimeStep: null,
      tokenVersion: 0,
      passwordChangedAt: new Date(),
      disabledAt: null,
      disabledReason: null,
    })

    this.dependencies.logger.info({ email: input.email }, 'Super admin created')
  }
}

export const createSuperAdmin = (
  dependencies: StartupDependencies,
  input: SuperAdminInput,
): Promise<void> => new StartupService(dependencies).createSuperAdmin(input)
