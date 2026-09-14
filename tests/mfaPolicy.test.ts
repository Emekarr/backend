import assert from 'node:assert/strict'
import test from 'node:test'
import { AdminAuthService } from '../src/application/auth/AdminAuthService'
import { AuthorAuthService } from '../src/application/author/AuthorAuthService'
import { StudentAuthService } from '../src/application/student/StudentAuthService'
import { CourseParticipationService } from '../src/application/student/CourseParticipationService'
import type { Admin } from '../src/entities/models/Admin'
import type { Author } from '../src/entities/models/Author'
import type { Student } from '../src/entities/models/Student'

const now = new Date()

const admin = (twoFactorEnabled: boolean): Admin => ({
  id: '01J00000000000000000000000',
  firstName: 'Ada',
  lastName: 'Admin',
  email: 'admin@example.com',
  password: 'hash',
  permissions: [],
  isSuperAdmin: false,
  twoFactorEnabled,
  twoFactorSecretEncrypted: twoFactorEnabled ? 'encrypted' : null,
  pendingTwoFactorSecretEncrypted: null,
  lastTwoFactorTimeStep: null,
  tokenVersion: 0,
  passwordChangedAt: now,
  disabledAt: null,
  disabledReason: null,
  createdAt: now,
  updatedAt: now,
})

const author = (twoFactorEnabled: boolean): Author => ({
  id: '01J00000000000000000000001',
  firstName: 'Tola',
  lastName: 'Tutor',
  email: 'author@example.com',
  bio: '',
  linkedInUrl: null,
  xUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  websiteUrl: null,
  password: 'hash',
  twoFactorEnabled,
  twoFactorSecretEncrypted: twoFactorEnabled ? 'encrypted' : null,
  pendingTwoFactorSecretEncrypted: null,
  lastTwoFactorTimeStep: null,
  tokenVersion: 0,
  passwordChangedAt: now,
  disabledAt: null,
  disabledReason: null,
  createdAt: now,
  updatedAt: now,
})

const student = (twoFactorEnabled: boolean): Student => ({
  id: '01J00000000000000000000002',
  firstName: 'Sade',
  lastName: 'Student',
  email: 'student@example.com',
  bio: '',
  linkedInUrl: null,
  xUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  youtubeUrl: null,
  websiteUrl: null,
  password: 'hash',
  twoFactorEnabled,
  twoFactorSecretEncrypted: twoFactorEnabled ? 'encrypted' : null,
  pendingTwoFactorSecretEncrypted: null,
  lastTwoFactorTimeStep: null,
  tokenVersion: 0,
  passwordChangedAt: now,
  disabledAt: null,
  disabledReason: null,
  createdAt: now,
  updatedAt: now,
})

const common = {
  passwordHasher: { hash: async () => 'hash', verify: async () => true },
  tokens: {
    issue: (claims: { purpose: string }) => `token:${claims.purpose}`,
    verify: () => {
      throw new Error('unused')
    },
  },
  twoFactor: {
    createSetup: async () => ({ secret: '', otpauthUri: '', qrCodeDataUrl: '' }),
    verify: async () => ({ valid: false }),
  },
  secretCipher: { encrypt: (value: string) => value, decrypt: (value: string) => value },
  refreshTokens: {
    create: async () => undefined,
    find: async () => undefined,
    rotate: async () => ({ status: 'missing' as const }),
    revoke: async () => undefined,
  },
  secureTokens: {
    numericCode: () => '123456',
    token: () => 'token',
    hash: (value: string) => value,
  },
}

test('every admin without MFA is routed to setup, including a standard admin', async () => {
  const current = admin(false)
  const service = new AdminAuthService({
    ...common,
    admins: { findByEmailForAuthentication: async () => current },
    oneTimeCodes: { store: async () => undefined, consume: async () => false },
    emailJobs: { enqueue: async () => undefined },
    logger: { info: () => undefined, error: () => undefined },
  } as ConstructorParameters<typeof AdminAuthService>[0])

  const result = await service.login(current.email, 'correct-password')
  assert.equal(result.status, 'two-factor-setup-required')
})

test('every author without MFA is routed to setup and cannot receive a session', async () => {
  const current = author(false)
  const service = new AuthorAuthService({
    ...common,
    authors: { findByEmailForAuthentication: async () => current },
  } as ConstructorParameters<typeof AuthorAuthService>[0])

  const result = await service.login(current.email, 'correct-password')
  assert.deepEqual(result, {
    status: 'two-factor-setup-required',
    setupToken: 'token:two-factor-setup',
  })
})

test('an MFA-enabled author is routed to verification', async () => {
  const current = author(true)
  const service = new AuthorAuthService({
    ...common,
    authors: { findByEmailForAuthentication: async () => current },
  } as ConstructorParameters<typeof AuthorAuthService>[0])

  const result = await service.login(current.email, 'correct-password')
  assert.deepEqual(result, {
    status: 'two-factor-required',
    challengeToken: 'token:login-challenge',
  })
})

test('a student without MFA receives a normal session at ordinary login', async () => {
  const current = student(false)
  const service = new StudentAuthService({
    ...common,
    students: { findByEmailForAuthentication: async () => current },
    tokens: {
      issue: common.tokens.issue,
      verify: () => ({
        userId: current.id,
        role: 'student',
        email: current.email,
        tokenVersion: current.tokenVersion,
      }),
    },
    oneTimeCodes: { store: async () => undefined, consume: async () => false },
    emailJobs: { enqueue: async () => undefined },
    logger: { info: () => undefined, error: () => undefined },
  } as ConstructorParameters<typeof StudentAuthService>[0])

  const result = await service.login(current.email, 'correct-password')
  assert.equal(result.status, 'authenticated')
  if (result.status === 'authenticated') {
    assert.equal(result.accessToken, 'token:access')
    assert.equal(result.refreshToken, 'token')
  }
  assert.equal((await service.authenticate('access-token')).id, current.id)
})

test('a student without MFA is blocked at enrollment rather than login', async () => {
  const service = new CourseParticipationService(
    {} as ConstructorParameters<typeof CourseParticipationService>[0],
  )
  await assert.rejects(
    service.enroll(student(false), '01J00000000000000000000003'),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'TWO_FACTOR_SETUP_REQUIRED',
  )
})
