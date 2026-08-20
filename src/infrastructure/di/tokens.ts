import { Token } from 'typedi'
import type { AdminInvitationService } from '../../application/admin/AdminInvitationService'
import type { AdminDirectoryService } from '../../application/admin/AdminDirectoryService'
import type { AdminNotificationService } from '../../application/admin/AdminNotificationService'
import type { AdminAuthService } from '../../application/auth/AdminAuthService'
import type { AuthorAuthService } from '../../application/author/AuthorAuthService'
import type { AuthorInvitationService } from '../../application/author/AuthorInvitationService'
import type { CourseService } from '../../application/course/CourseService'
import type { LiveReminderService } from '../../application/course/LiveReminderService'
import type { LiveClassService } from '../../application/live/LiveClassService'
import type { CourseParticipationService } from '../../application/student/CourseParticipationService'
import type { CoursePaymentService } from '../../application/payment/CoursePaymentService'
import type { StudentAuthService } from '../../application/student/StudentAuthService'
import type { StudentInvitationService } from '../../application/student/StudentInvitationService'
import type { StudentCourseBookmarkService } from '../../application/student/StudentCourseBookmarkService'
import type { StartupService } from '../../application/startup'
import type { AdminInvitationRepository } from '../../entities/interfaces/adminInvitationRepository'
import type { AdminRepository } from '../../entities/interfaces/adminRepository'
import type { AdminNotificationRepository } from '../../entities/interfaces/adminNotificationRepository'
import type { ActivityRepository } from '../../entities/interfaces/activityRepository'
import type { AuthorInvitationRepository } from '../../entities/interfaces/authorInvitationRepository'
import type { AuthorRepository } from '../../entities/interfaces/authorRepository'
import type {
  AuthTokenService,
  OneTimeCodeStore,
  RateLimiter,
  RefreshTokenStore,
  SecretCipher,
  SecureTokenGenerator,
  TwoFactorAuthenticator,
} from '../../entities/interfaces/auth'
import type { Cache, Repository } from '../../entities/interfaces/database'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { AssessmentRepository } from '../../entities/interfaces/assessmentRepository'
import type { AssessmentService } from '../../application/assessment/AssessmentService'
import type { CertificateService } from '../../application/certificate/CertificateService'
import type {
  CertificateDocumentRenderer,
  CertificateRepository,
} from '../../entities/interfaces/certificateRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { CoursePaymentRepository } from '../../entities/interfaces/coursePaymentRepository'
import type { PaymentGateway } from '../../entities/interfaces/payment'
import type { PaymentAuthorizationRepository } from '../../entities/interfaces/paymentAuthorizationRepository'
import type {
  LiveClassProvider,
  LiveClassRepository,
} from '../../entities/interfaces/liveClassRepository'
import type { LiveReminderPreferenceRepository } from '../../entities/interfaces/liveReminderPreferenceRepository'
import type { StudentCourseBookmarkRepository } from '../../entities/interfaces/studentCourseBookmarkRepository'
import type { StudentInvitationRepository } from '../../entities/interfaces/studentInvitationRepository'
import type { StudentRepository } from '../../entities/interfaces/studentRepository'
import type { Logger } from '../../entities/interfaces/logger'
import type {
  HttpServer,
  LifecycleService,
  PasswordHasher,
  EmailJobQueue,
  EmailSender,
  ActivityJobQueue,
} from '../../entities/interfaces/services'
import type { ObjectStorage } from '../../entities/interfaces/storage'
import type { ServiceManager } from '../../services'
import type { EnvironmentConfig } from '../config/environment'
import type { RedisDBConnection } from '../database/connections/redis'

export const DI_TOKENS = Object.freeze({
  config: new Token<EnvironmentConfig>('config'),
  logger: new Token<Logger>('logger'),
  mongoConnection: new Token<LifecycleService>('mongo.connection'),
  redisConnection: new Token<RedisDBConnection>('redis.connection'),
  services: new Token<readonly LifecycleService[]>('lifecycle.services'),
  serviceManager: new Token<ServiceManager>('lifecycle.manager'),
  httpServer: new Token<HttpServer>('http.server'),
  adminRepository: new Token<AdminRepository>('repository.admin'),
  adminNotificationRepository: new Token<AdminNotificationRepository>(
    'repository.admin-notification',
  ),
  adminInvitationRepository: new Token<AdminInvitationRepository>('repository.admin-invitation'),
  authorRepository: new Token<AuthorRepository>('repository.author'),
  authorInvitationRepository: new Token<AuthorInvitationRepository>('repository.author-invitation'),
  activityRepository: new Token<ActivityRepository>('repository.activity'),
  courseCatalogRepository: new Token<CourseCatalogRepository>('repository.course-catalog'),
  assessmentRepository: new Token<AssessmentRepository>('repository.assessment'),
  certificateRepository: new Token<CertificateRepository>('repository.certificate'),
  certificateRenderer: new Token<CertificateDocumentRenderer>('renderer.certificate'),
  courseParticipationRepository: new Token<CourseParticipationRepository>(
    'repository.course-participation',
  ),
  coursePaymentRepository: new Token<CoursePaymentRepository>('repository.course-payment'),
  paymentAuthorizationRepository: new Token<PaymentAuthorizationRepository>(
    'repository.payment-authorization',
  ),
  paymentGateway: new Token<PaymentGateway>('gateway.payment'),
  paymentAuthorizationCipher: new Token<SecretCipher>('cipher.payment-authorization'),
  liveClassRepository: new Token<LiveClassRepository>('repository.live-class'),
  liveClassProvider: new Token<LiveClassProvider>('provider.live-class'),
  liveReminderPreferenceRepository: new Token<LiveReminderPreferenceRepository>(
    'repository.live-reminder-preference',
  ),
  studentCourseBookmarkRepository: new Token<StudentCourseBookmarkRepository>(
    'repository.student-course-bookmark',
  ),
  studentRepository: new Token<StudentRepository>('repository.student'),
  studentInvitationRepository: new Token<StudentInvitationRepository>(
    'repository.student-invitation',
  ),
  cache: new Token<Cache>('cache'),
  passwordHasher: new Token<PasswordHasher>('password.hasher'),
  authTokens: new Token<AuthTokenService>('auth.tokens'),
  twoFactor: new Token<TwoFactorAuthenticator>('auth.two-factor'),
  secretCipher: new Token<SecretCipher>('auth.secret-cipher'),
  oneTimeCodes: new Token<OneTimeCodeStore>('auth.one-time-codes'),
  refreshTokens: new Token<RefreshTokenStore>('auth.refresh-tokens'),
  secureTokens: new Token<SecureTokenGenerator>('auth.secure-tokens'),
  rateLimiter: new Token<RateLimiter>('auth.rate-limiter'),
  emailSender: new Token<EmailSender>('email.sender'),
  emailJobs: new Token<EmailJobQueue & LifecycleService>('email.jobs'),
  activityJobs: new Token<ActivityJobQueue & LifecycleService>('activity.jobs'),
  objectStorage: new Token<ObjectStorage>('object-storage'),
  adminAuthService: new Token<AdminAuthService>('application.admin-auth'),
  adminDirectoryService: new Token<AdminDirectoryService>('application.admin-directory'),
  adminNotificationService: new Token<AdminNotificationService>('application.admin-notifications'),
  adminInvitationService: new Token<AdminInvitationService>('application.admin-invitations'),
  authorAuthService: new Token<AuthorAuthService>('application.author-auth'),
  authorInvitationService: new Token<AuthorInvitationService>('application.author-invitations'),
  courseService: new Token<CourseService>('application.course'),
  liveReminderService: new Token<LiveReminderService>('application.live-reminder'),
  studentCourseBookmarkService: new Token<StudentCourseBookmarkService>(
    'application.student-course-bookmark',
  ),
  assessmentService: new Token<AssessmentService>('application.assessment'),
  certificateService: new Token<CertificateService>('application.certificate'),
  liveClassService: new Token<LiveClassService>('application.live-class'),
  courseParticipationService: new Token<CourseParticipationService>(
    'application.course-participation',
  ),
  coursePaymentService: new Token<CoursePaymentService>('application.course-payment'),
  studentAuthService: new Token<StudentAuthService>('application.student-auth'),
  studentInvitationService: new Token<StudentInvitationService>('application.student-invitations'),
  startupService: new Token<StartupService>('application.startup'),
})
