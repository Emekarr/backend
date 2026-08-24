import 'reflect-metadata'
import { Router } from 'express'
import { Container, type ContainerInstance } from 'typedi'
import { AdminInvitationService } from '../application/admin/AdminInvitationService'
import { AdminDirectoryService } from '../application/admin/AdminDirectoryService'
import { AdminNotificationService } from '../application/admin/AdminNotificationService'
import { AdminAuthService } from '../application/auth/AdminAuthService'
import { AuthorAuthService } from '../application/author/AuthorAuthService'
import { AuthorInvitationService } from '../application/author/AuthorInvitationService'
import { CourseService } from '../application/course/CourseService'
import { LiveReminderService } from '../application/course/LiveReminderService'
import { AssessmentService } from '../application/assessment/AssessmentService'
import { CertificateService } from '../application/certificate/CertificateService'
import { LiveClassService } from '../application/live/LiveClassService'
import { CourseParticipationService } from '../application/student/CourseParticipationService'
import { StudentCourseBookmarkService } from '../application/student/StudentCourseBookmarkService'
import { CoursePaymentService } from '../application/payment/CoursePaymentService'
import { StudentAuthService } from '../application/student/StudentAuthService'
import { StudentInvitationService } from '../application/student/StudentInvitationService'
import { StartupService } from '../application/startup'
import type { AdminInvitationRepository } from '../entities/interfaces/adminInvitationRepository'
import type { AdminRepository } from '../entities/interfaces/adminRepository'
import type { AdminNotificationRepository } from '../entities/interfaces/adminNotificationRepository'
import type { ActivityRepository } from '../entities/interfaces/activityRepository'
import type { AuthorInvitationRepository } from '../entities/interfaces/authorInvitationRepository'
import type { AuthorRepository } from '../entities/interfaces/authorRepository'
import type {
  AuthTokenService,
  OneTimeCodeStore,
  RateLimiter,
  RefreshTokenStore,
  SecretCipher,
  SecureTokenGenerator,
  TwoFactorAuthenticator,
} from '../entities/interfaces/auth'
import type { Cache } from '../entities/interfaces/database'
import type { CourseCatalogRepository } from '../entities/interfaces/courseRepository'
import type { AssessmentRepository } from '../entities/interfaces/assessmentRepository'
import type {
  CertificateDocumentRenderer,
  CertificateRepository,
} from '../entities/interfaces/certificateRepository'
import type { CourseParticipationRepository } from '../entities/interfaces/courseParticipationRepository'
import type { CoursePaymentRepository } from '../entities/interfaces/coursePaymentRepository'
import type { PaymentGateway } from '../entities/interfaces/payment'
import type { PaymentAuthorizationRepository } from '../entities/interfaces/paymentAuthorizationRepository'
import type {
  LiveClassProvider,
  LiveClassRepository,
} from '../entities/interfaces/liveClassRepository'
import type { LiveReminderPreferenceRepository } from '../entities/interfaces/liveReminderPreferenceRepository'
import type { StudentCourseBookmarkRepository } from '../entities/interfaces/studentCourseBookmarkRepository'
import type { StudentInvitationRepository } from '../entities/interfaces/studentInvitationRepository'
import type { StudentRepository } from '../entities/interfaces/studentRepository'
import type { Logger } from '../entities/interfaces/logger'
import type {
  EmailJobQueue,
  EmailSender,
  ActivityJobQueue,
  HttpServer,
  LifecycleService,
  PasswordHasher,
} from '../entities/interfaces/services'
import type { ObjectStorage } from '../entities/interfaces/storage'
import { createServiceManager, type ServiceManager } from '../services'
import { AesSecretCipher } from './auth/aesSecretCipher'
import { JwtAuthTokenService } from './auth/jwtTokenService'
import { NodeSecureTokenGenerator } from './auth/secureTokenGenerator'
import { TotpAuthenticator } from './auth/totpAuthenticator'
import { config } from './config/environment'
import { RedisCache } from './database/cache/redis'
import { MongoDBConnection } from './database/connections/mongo'
import { RedisDBConnection } from './database/connections/redis'
import { DI_TOKENS } from './di/tokens'
import { ResendEmailSender } from './email/resendEmailSender'
import { ExpressServer } from './http/express'
import { activityAudit } from './http/activityAudit'
import { createAdminRouter } from './http/routes/adminRoutes'
import { createAuthorRouter } from './http/routes/authorRoutes'
import { createCourseRouter } from './http/routes/courseRoutes'
import { createStudentRouter } from './http/routes/studentRoutes'
import { createLiveClassRouter } from './http/routes/liveClassRoutes'
import { createAssessmentRouter } from './http/routes/assessmentRoutes'
import { createCertificateRouter } from './http/routes/certificateRoutes'
import { createDirectApiRouter } from './http/directApi'
import { createPaymentRouter } from './http/routes/paymentRoutes'
import { BullMQActivityJobs } from './jobs/bullmqActivityJobs'
import { BullMQEmailJobs } from './jobs/bullmqEmailJobs'
import { PinoLogger } from './logging/pino'
import { AdminInvitationRepo } from './repository/mongodb/modelRepos/adminInvitationRepo'
import { AdminRepo } from './repository/mongodb/modelRepos/adminRepo'
import { AdminNotificationRepo } from './repository/mongodb/modelRepos/adminNotificationRepo'
import { ActivityRepo } from './repository/mongodb/modelRepos/activityRepo'
import { AuthorInvitationRepo } from './repository/mongodb/modelRepos/authorInvitationRepo'
import { AuthorRepo } from './repository/mongodb/modelRepos/authorRepo'
import { CourseCatalogRepo } from './repository/mongodb/modelRepos/courseCatalogRepo'
import { AssessmentRepo } from './repository/mongodb/modelRepos/assessmentRepo'
import { CertificateRepo } from './repository/mongodb/modelRepos/certificateRepo'
import { PdfCertificateRenderer } from './certificates/pdfCertificateRenderer'
import { CourseParticipationRepo } from './repository/mongodb/modelRepos/courseParticipationRepo'
import { CoursePaymentRepo } from './repository/mongodb/modelRepos/coursePaymentRepo'
import { PaymentAuthorizationRepo } from './repository/mongodb/modelRepos/paymentAuthorizationRepo'
import { LiveClassRepo } from './repository/mongodb/modelRepos/liveClassRepo'
import { LiveReminderPreferenceRepo } from './repository/mongodb/modelRepos/liveReminderPreferenceRepo'
import { StudentCourseBookmarkRepo } from './repository/mongodb/modelRepos/studentCourseBookmarkRepo'
import { StudentInvitationRepo } from './repository/mongodb/modelRepos/studentInvitationRepo'
import { StudentRepo } from './repository/mongodb/modelRepos/studentRepo'
import { ScryptPasswordHasher } from './security/passwordHasher'
import { RedisOneTimeCodeStore } from './stores/redisOneTimeCodeStore'
import { RedisRefreshTokenStore } from './stores/redisRefreshTokenStore'
import { RedisRateLimiter } from './stores/redisRateLimiter'
import { R2ObjectStorage } from './storage/r2ObjectStorage'
import { AgoraLiveClassProvider } from './live/agoraLiveClassProvider'
import { PaystackGateway } from './payments/paystackGateway'

export interface Infrastructure {
  logger: Logger
  services: readonly LifecycleService[]
  serviceManager: ServiceManager
  httpServer: HttpServer
  adminRepository: AdminRepository
  adminInvitationRepository: AdminInvitationRepository
  authorRepository: AuthorRepository
  authorInvitationRepository: AuthorInvitationRepository
  activityRepository: ActivityRepository
  studentRepository: StudentRepository
  studentInvitationRepository: StudentInvitationRepository
  courseParticipationRepository: CourseParticipationRepository
  coursePaymentRepository: CoursePaymentRepository
  paymentAuthorizationRepository: PaymentAuthorizationRepository
  assessmentRepository: AssessmentRepository
  certificateRepository: CertificateRepository
  liveClassRepository: LiveClassRepository
  liveReminderPreferenceRepository: LiveReminderPreferenceRepository
  studentCourseBookmarkRepository: StudentCourseBookmarkRepository
  cache: Cache
  passwordHasher: PasswordHasher
  emailJobs: EmailJobQueue
  activityJobs: ActivityJobQueue
  adminAuthService: AdminAuthService
  adminInvitationService: AdminInvitationService
  adminDirectoryService: AdminDirectoryService
  authorAuthService: AuthorAuthService
  authorInvitationService: AuthorInvitationService
  courseService: CourseService
  liveReminderService: LiveReminderService
  studentCourseBookmarkService: StudentCourseBookmarkService
  assessmentService: AssessmentService
  certificateService: CertificateService
  courseParticipationService: CourseParticipationService
  coursePaymentService: CoursePaymentService
  liveClassService: LiveClassService
  studentAuthService: StudentAuthService
  studentInvitationService: StudentInvitationService
  startupService: StartupService
}

Container.set(DI_TOKENS.config, config)
Container.set<Logger>({
  id: DI_TOKENS.logger,
  factory: (container: ContainerInstance) => new PinoLogger(container.get(DI_TOKENS.config)),
})
Container.set<LifecycleService>({
  id: DI_TOKENS.mongoConnection,
  factory: (container: ContainerInstance) =>
    new MongoDBConnection(container.get(DI_TOKENS.config), container.get(DI_TOKENS.logger)),
})
Container.set<RedisDBConnection>({
  id: DI_TOKENS.redisConnection,
  factory: (container: ContainerInstance) =>
    new RedisDBConnection(container.get(DI_TOKENS.config), container.get(DI_TOKENS.logger)),
})
Container.set<AdminRepository>({
  id: DI_TOKENS.adminRepository,
  factory: () => new AdminRepo(),
})
Container.set<AdminNotificationRepository>({
  id: DI_TOKENS.adminNotificationRepository,
  factory: () => new AdminNotificationRepo(),
})
Container.set<AdminInvitationRepository>({
  id: DI_TOKENS.adminInvitationRepository,
  factory: () => new AdminInvitationRepo(),
})
Container.set<AuthorRepository>({
  id: DI_TOKENS.authorRepository,
  factory: () => new AuthorRepo(),
})
Container.set<AuthorInvitationRepository>({
  id: DI_TOKENS.authorInvitationRepository,
  factory: () => new AuthorInvitationRepo(),
})
Container.set<ActivityRepository>({
  id: DI_TOKENS.activityRepository,
  factory: () => new ActivityRepo(),
})
Container.set<CourseCatalogRepository>({
  id: DI_TOKENS.courseCatalogRepository,
  factory: () => new CourseCatalogRepo(),
})
Container.set<AssessmentRepository>({
  id: DI_TOKENS.assessmentRepository,
  factory: () => new AssessmentRepo(),
})
Container.set<CertificateRepository>({
  id: DI_TOKENS.certificateRepository,
  factory: () => new CertificateRepo(),
})
Container.set<CertificateDocumentRenderer>({
  id: DI_TOKENS.certificateRenderer,
  factory: (container: ContainerInstance) =>
    new PdfCertificateRenderer(container.get(DI_TOKENS.config)),
})
Container.set<CourseParticipationRepository>({
  id: DI_TOKENS.courseParticipationRepository,
  factory: () => new CourseParticipationRepo(),
})
Container.set<CoursePaymentRepository>({
  id: DI_TOKENS.coursePaymentRepository,
  factory: () => new CoursePaymentRepo(),
})
Container.set<PaymentAuthorizationRepository>({
  id: DI_TOKENS.paymentAuthorizationRepository,
  factory: () => new PaymentAuthorizationRepo(),
})
Container.set<PaymentGateway>({
  id: DI_TOKENS.paymentGateway,
  factory: (container: ContainerInstance) => new PaystackGateway(container.get(DI_TOKENS.config)),
})
Container.set<LiveClassRepository>({
  id: DI_TOKENS.liveClassRepository,
  factory: () => new LiveClassRepo(),
})
Container.set<LiveReminderPreferenceRepository>({
  id: DI_TOKENS.liveReminderPreferenceRepository,
  factory: () => new LiveReminderPreferenceRepo(),
})
Container.set<StudentCourseBookmarkRepository>({
  id: DI_TOKENS.studentCourseBookmarkRepository,
  factory: () => new StudentCourseBookmarkRepo(),
})
Container.set<LiveClassProvider>({
  id: DI_TOKENS.liveClassProvider,
  factory: (container: ContainerInstance) =>
    new AgoraLiveClassProvider(container.get(DI_TOKENS.config)),
})
Container.set<StudentRepository>({
  id: DI_TOKENS.studentRepository,
  factory: () => new StudentRepo(),
})
Container.set<StudentInvitationRepository>({
  id: DI_TOKENS.studentInvitationRepository,
  factory: () => new StudentInvitationRepo(),
})
Container.set<Cache>({
  id: DI_TOKENS.cache,
  factory: (container: ContainerInstance) =>
    new RedisCache(container.get(DI_TOKENS.redisConnection)),
})
Container.set<PasswordHasher>({
  id: DI_TOKENS.passwordHasher,
  factory: () => new ScryptPasswordHasher(),
})
Container.set<AuthTokenService>({
  id: DI_TOKENS.authTokens,
  factory: (container: ContainerInstance) =>
    new JwtAuthTokenService(container.get(DI_TOKENS.config)),
})
Container.set<TwoFactorAuthenticator>({
  id: DI_TOKENS.twoFactor,
  factory: (container: ContainerInstance) =>
    new TotpAuthenticator(container.get(DI_TOKENS.config).SERVICE_NAME),
})
Container.set<SecretCipher>({
  id: DI_TOKENS.secretCipher,
  factory: (container: ContainerInstance) =>
    new AesSecretCipher(container.get(DI_TOKENS.config).TOTP_ENCRYPTION_KEY),
})
Container.set<SecretCipher>({
  id: DI_TOKENS.paymentAuthorizationCipher,
  factory: (container: ContainerInstance) =>
    new AesSecretCipher(container.get(DI_TOKENS.config).PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY),
})
Container.set<SecureTokenGenerator>({
  id: DI_TOKENS.secureTokens,
  factory: (container: ContainerInstance) =>
    new NodeSecureTokenGenerator(container.get(DI_TOKENS.config).JWT_SECRET),
})
Container.set<OneTimeCodeStore>({
  id: DI_TOKENS.oneTimeCodes,
  factory: (container: ContainerInstance) =>
    new RedisOneTimeCodeStore(container.get(DI_TOKENS.redisConnection)),
})
Container.set<RefreshTokenStore>({
  id: DI_TOKENS.refreshTokens,
  factory: (container: ContainerInstance) =>
    new RedisRefreshTokenStore(container.get(DI_TOKENS.redisConnection)),
})
Container.set<RateLimiter>({
  id: DI_TOKENS.rateLimiter,
  factory: (container: ContainerInstance) =>
    new RedisRateLimiter(container.get(DI_TOKENS.redisConnection)),
})
Container.set<EmailSender>({
  id: DI_TOKENS.emailSender,
  factory: (container: ContainerInstance) => {
    const environment = container.get(DI_TOKENS.config)
    return new ResendEmailSender(environment.RESEND_API_KEY, environment.EMAIL_FROM)
  },
})
Container.set<EmailJobQueue & LifecycleService>({
  id: DI_TOKENS.emailJobs,
  factory: (container: ContainerInstance) =>
    new BullMQEmailJobs(
      container.get(DI_TOKENS.config),
      container.get(DI_TOKENS.emailSender),
      container.get(DI_TOKENS.adminInvitationRepository),
      container.get(DI_TOKENS.authorInvitationRepository),
      container.get(DI_TOKENS.studentInvitationRepository),
      container.get(DI_TOKENS.liveReminderPreferenceRepository),
      container.get(DI_TOKENS.studentCourseBookmarkRepository),
      container.get(DI_TOKENS.certificateRepository),
      container.get(DI_TOKENS.certificateRenderer),
      container.get(DI_TOKENS.logger),
    ),
})
Container.set<ActivityJobQueue & LifecycleService>({
  id: DI_TOKENS.activityJobs,
  factory: (container: ContainerInstance) =>
    new BullMQActivityJobs(
      container.get(DI_TOKENS.config),
      container.get(DI_TOKENS.activityRepository),
      container.get(DI_TOKENS.logger),
    ),
})
Container.set<ObjectStorage>({
  id: DI_TOKENS.objectStorage,
  factory: (container: ContainerInstance) => new R2ObjectStorage(container.get(DI_TOKENS.config)),
})
Container.set<AdminAuthService>({
  id: DI_TOKENS.adminAuthService,
  factory: (container: ContainerInstance) =>
    new AdminAuthService({
      admins: container.get(DI_TOKENS.adminRepository),
      passwordHasher: container.get(DI_TOKENS.passwordHasher),
      tokens: container.get(DI_TOKENS.authTokens),
      twoFactor: container.get(DI_TOKENS.twoFactor),
      secretCipher: container.get(DI_TOKENS.secretCipher),
      oneTimeCodes: container.get(DI_TOKENS.oneTimeCodes),
      refreshTokens: container.get(DI_TOKENS.refreshTokens),
      secureTokens: container.get(DI_TOKENS.secureTokens),
      emailJobs: container.get(DI_TOKENS.emailJobs),
      logger: container.get(DI_TOKENS.logger),
    }),
})
Container.set<AdminInvitationService>({
  id: DI_TOKENS.adminInvitationService,
  factory: (container: ContainerInstance) =>
    new AdminInvitationService({
      invitations: container.get(DI_TOKENS.adminInvitationRepository),
      admins: container.get(DI_TOKENS.adminRepository),
      passwordHasher: container.get(DI_TOKENS.passwordHasher),
      secureTokens: container.get(DI_TOKENS.secureTokens),
      emailJobs: container.get(DI_TOKENS.emailJobs),
      notifications: container.get(DI_TOKENS.adminNotificationService),
    }),
})
Container.set<AdminDirectoryService>({
  id: DI_TOKENS.adminDirectoryService,
  factory: (container: ContainerInstance) =>
    new AdminDirectoryService({
      admins: container.get(DI_TOKENS.adminRepository),
      authors: container.get(DI_TOKENS.authorRepository),
      students: container.get(DI_TOKENS.studentRepository),
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      assessments: container.get(DI_TOKENS.assessmentRepository),
      participation: container.get(DI_TOKENS.courseParticipationRepository),
      certificates: container.get(DI_TOKENS.certificateRepository),
    }),
})
Container.set<AdminNotificationService>({
  id: DI_TOKENS.adminNotificationService,
  factory: (container: ContainerInstance) =>
    new AdminNotificationService({
      notifications: container.get(DI_TOKENS.adminNotificationRepository),
      admins: container.get(DI_TOKENS.adminRepository),
    }),
})
Container.set<AuthorAuthService>({
  id: DI_TOKENS.authorAuthService,
  factory: (container: ContainerInstance) =>
    new AuthorAuthService({
      authors: container.get(DI_TOKENS.authorRepository),
      passwordHasher: container.get(DI_TOKENS.passwordHasher),
      tokens: container.get(DI_TOKENS.authTokens),
      twoFactor: container.get(DI_TOKENS.twoFactor),
      secretCipher: container.get(DI_TOKENS.secretCipher),
      refreshTokens: container.get(DI_TOKENS.refreshTokens),
      secureTokens: container.get(DI_TOKENS.secureTokens),
    }),
})
Container.set<AuthorInvitationService>({
  id: DI_TOKENS.authorInvitationService,
  factory: (container: ContainerInstance) =>
    new AuthorInvitationService({
      invitations: container.get(DI_TOKENS.authorInvitationRepository),
      authors: container.get(DI_TOKENS.authorRepository),
      passwordHasher: container.get(DI_TOKENS.passwordHasher),
      secureTokens: container.get(DI_TOKENS.secureTokens),
      emailJobs: container.get(DI_TOKENS.emailJobs),
      notifications: container.get(DI_TOKENS.adminNotificationService),
    }),
})
Container.set<CourseService>({
  id: DI_TOKENS.courseService,
  factory: (container: ContainerInstance) =>
    new CourseService({
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      authors: container.get(DI_TOKENS.authorRepository),
      storage: container.get(DI_TOKENS.objectStorage),
      participation: container.get(DI_TOKENS.courseParticipationRepository),
      notifications: container.get(DI_TOKENS.adminNotificationService),
    }),
})
Container.set<LiveReminderService>({
  id: DI_TOKENS.liveReminderService,
  factory: (container: ContainerInstance) =>
    new LiveReminderService({
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      preferences: container.get(DI_TOKENS.liveReminderPreferenceRepository),
      emailJobs: container.get(DI_TOKENS.emailJobs),
    }),
})
Container.set<StudentCourseBookmarkService>({
  id: DI_TOKENS.studentCourseBookmarkService,
  factory: (container: ContainerInstance) =>
    new StudentCourseBookmarkService({
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      bookmarks: container.get(DI_TOKENS.studentCourseBookmarkRepository),
      emailJobs: container.get(DI_TOKENS.emailJobs),
    }),
})
Container.set<AssessmentService>({
  id: DI_TOKENS.assessmentService,
  factory: (container: ContainerInstance) =>
    new AssessmentService({
      assessments: container.get(DI_TOKENS.assessmentRepository),
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      participation: container.get(DI_TOKENS.courseParticipationRepository),
      students: container.get(DI_TOKENS.studentRepository),
      certificates: container.get(DI_TOKENS.certificateService),
      storage: container.get(DI_TOKENS.objectStorage),
    }),
})
Container.set<CertificateService>({
  id: DI_TOKENS.certificateService,
  factory: (container: ContainerInstance) =>
    new CertificateService({
      certificates: container.get(DI_TOKENS.certificateRepository),
      renderer: container.get(DI_TOKENS.certificateRenderer),
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      participation: container.get(DI_TOKENS.courseParticipationRepository),
      emailJobs: container.get(DI_TOKENS.emailJobs),
    }),
})
Container.set<StudentAuthService>({
  id: DI_TOKENS.studentAuthService,
  factory: (container: ContainerInstance) =>
    new StudentAuthService({
      students: container.get(DI_TOKENS.studentRepository),
      passwordHasher: container.get(DI_TOKENS.passwordHasher),
      tokens: container.get(DI_TOKENS.authTokens),
      twoFactor: container.get(DI_TOKENS.twoFactor),
      secretCipher: container.get(DI_TOKENS.secretCipher),
      oneTimeCodes: container.get(DI_TOKENS.oneTimeCodes),
      refreshTokens: container.get(DI_TOKENS.refreshTokens),
      secureTokens: container.get(DI_TOKENS.secureTokens),
      emailJobs: container.get(DI_TOKENS.emailJobs),
      logger: container.get(DI_TOKENS.logger),
    }),
})
Container.set<StudentInvitationService>({
  id: DI_TOKENS.studentInvitationService,
  factory: (container: ContainerInstance) =>
    new StudentInvitationService({
      invitations: container.get(DI_TOKENS.studentInvitationRepository),
      students: container.get(DI_TOKENS.studentRepository),
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      passwordHasher: container.get(DI_TOKENS.passwordHasher),
      secureTokens: container.get(DI_TOKENS.secureTokens),
      emailJobs: container.get(DI_TOKENS.emailJobs),
      notifications: container.get(DI_TOKENS.adminNotificationService),
    }),
})
Container.set<CourseParticipationService>({
  id: DI_TOKENS.courseParticipationService,
  factory: (container: ContainerInstance) =>
    new CourseParticipationService({
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      authors: container.get(DI_TOKENS.authorRepository),
      participation: container.get(DI_TOKENS.courseParticipationRepository),
      assessments: container.get(DI_TOKENS.assessmentRepository),
      certificates: container.get(DI_TOKENS.certificateService),
    }),
})
Container.set<CoursePaymentService>({
  id: DI_TOKENS.coursePaymentService,
  factory: (container: ContainerInstance) =>
    new CoursePaymentService({
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      payments: container.get(DI_TOKENS.coursePaymentRepository),
      authorizations: container.get(DI_TOKENS.paymentAuthorizationRepository),
      participation: container.get(DI_TOKENS.courseParticipationRepository),
      gateway: container.get(DI_TOKENS.paymentGateway),
      authorizationCipher: container.get(DI_TOKENS.paymentAuthorizationCipher),
      notifications: container.get(DI_TOKENS.adminNotificationService),
    }),
})
Container.set<LiveClassService>({
  id: DI_TOKENS.liveClassService,
  factory: (container: ContainerInstance) =>
    new LiveClassService({
      live: container.get(DI_TOKENS.liveClassRepository),
      courses: container.get(DI_TOKENS.courseCatalogRepository),
      participation: container.get(DI_TOKENS.courseParticipationRepository),
      provider: container.get(DI_TOKENS.liveClassProvider),
      storage: container.get(DI_TOKENS.objectStorage),
      emailJobs: container.get(DI_TOKENS.emailJobs),
      config: container.get(DI_TOKENS.config),
    }),
})
Container.set<StartupService>({
  id: DI_TOKENS.startupService,
  factory: (container: ContainerInstance) =>
    new StartupService({
      adminRepository: container.get(DI_TOKENS.adminRepository),
      passwordHasher: container.get(DI_TOKENS.passwordHasher),
      logger: container.get(DI_TOKENS.logger),
    }),
})
Container.set<readonly LifecycleService[]>({
  id: DI_TOKENS.services,
  factory: (container: ContainerInstance) =>
    Object.freeze([
      container.get(DI_TOKENS.mongoConnection),
      container.get(DI_TOKENS.redisConnection),
      container.get(DI_TOKENS.emailJobs),
      container.get(DI_TOKENS.activityJobs),
    ]),
})
Container.set<ServiceManager>({
  id: DI_TOKENS.serviceManager,
  factory: (container: ContainerInstance) =>
    createServiceManager(container.get(DI_TOKENS.services), container.get(DI_TOKENS.logger)),
})
Container.set<HttpServer>({
  id: DI_TOKENS.httpServer,
  factory: (container: ContainerInstance) =>
    (() => {
      const adminRouter = createAdminRouter({
        auth: container.get(DI_TOKENS.adminAuthService),
        invitations: container.get(DI_TOKENS.adminInvitationService),
        directory: container.get(DI_TOKENS.adminDirectoryService),
        notifications: container.get(DI_TOKENS.adminNotificationService),
        rateLimiter: container.get(DI_TOKENS.rateLimiter),
      })
      const authorRouter = createAuthorRouter({
        adminAuth: container.get(DI_TOKENS.adminAuthService),
        authorAuth: container.get(DI_TOKENS.authorAuthService),
        invitations: container.get(DI_TOKENS.authorInvitationService),
        rateLimiter: container.get(DI_TOKENS.rateLimiter),
      })
      const courseRouter = createCourseRouter({
        authorAuth: container.get(DI_TOKENS.authorAuthService),
        courses: container.get(DI_TOKENS.courseService),
        reminders: container.get(DI_TOKENS.liveReminderService),
        participation: container.get(DI_TOKENS.courseParticipationService),
      })
      const assessmentRouter = createAssessmentRouter({
        authorAuth: container.get(DI_TOKENS.authorAuthService),
        studentAuth: container.get(DI_TOKENS.studentAuthService),
        assessments: container.get(DI_TOKENS.assessmentService),
      })
      const certificateRouter = createCertificateRouter({
        studentAuth: container.get(DI_TOKENS.studentAuthService),
        certificates: container.get(DI_TOKENS.certificateService),
      })
      const paymentRouter = createPaymentRouter({
        payments: container.get(DI_TOKENS.coursePaymentService),
        studentAuth: container.get(DI_TOKENS.studentAuthService),
        authorAuth: container.get(DI_TOKENS.authorAuthService),
        rateLimiter: container.get(DI_TOKENS.rateLimiter),
      })
      const studentRouter = createStudentRouter({
        studentAuth: container.get(DI_TOKENS.studentAuthService),
        adminAuth: container.get(DI_TOKENS.adminAuthService),
        authorAuth: container.get(DI_TOKENS.authorAuthService),
        invitations: container.get(DI_TOKENS.studentInvitationService),
        participation: container.get(DI_TOKENS.courseParticipationService),
        courses: container.get(DI_TOKENS.courseService),
        bookmarks: container.get(DI_TOKENS.studentCourseBookmarkService),
        rateLimiter: container.get(DI_TOKENS.rateLimiter),
      })
      const liveRouter = createLiveClassRouter({
        authorAuth: container.get(DI_TOKENS.authorAuthService),
        studentAuth: container.get(DI_TOKENS.studentAuthService),
        live: container.get(DI_TOKENS.liveClassService),
      })
      const routers = [
        adminRouter,
        authorRouter,
        courseRouter,
        assessmentRouter,
        certificateRouter,
        paymentRouter,
        studentRouter,
        liveRouter,
      ]
      return new ExpressServer(
        container.get(DI_TOKENS.config),
        container.get(DI_TOKENS.logger),
        [activityAudit(container.get(DI_TOKENS.activityJobs), container.get(DI_TOKENS.logger))],
        [
          ...routers,
          Router().use('/api/admin', createDirectApiRouter('admin', routers)),
          Router().use('/api/author', createDirectApiRouter('author', routers)),
          Router().use('/api/student', createDirectApiRouter('student', routers)),
        ],
      )
    })(),
})

export const diContainer = Container

export const infrastructure: Infrastructure = Object.freeze({
  logger: Container.get(DI_TOKENS.logger),
  services: Container.get(DI_TOKENS.services),
  serviceManager: Container.get(DI_TOKENS.serviceManager),
  httpServer: Container.get(DI_TOKENS.httpServer),
  adminRepository: Container.get(DI_TOKENS.adminRepository),
  adminNotificationRepository: Container.get(DI_TOKENS.adminNotificationRepository),
  adminInvitationRepository: Container.get(DI_TOKENS.adminInvitationRepository),
  authorRepository: Container.get(DI_TOKENS.authorRepository),
  authorInvitationRepository: Container.get(DI_TOKENS.authorInvitationRepository),
  activityRepository: Container.get(DI_TOKENS.activityRepository),
  studentRepository: Container.get(DI_TOKENS.studentRepository),
  studentInvitationRepository: Container.get(DI_TOKENS.studentInvitationRepository),
  courseParticipationRepository: Container.get(DI_TOKENS.courseParticipationRepository),
  coursePaymentRepository: Container.get(DI_TOKENS.coursePaymentRepository),
  paymentAuthorizationRepository: Container.get(DI_TOKENS.paymentAuthorizationRepository),
  assessmentRepository: Container.get(DI_TOKENS.assessmentRepository),
  certificateRepository: Container.get(DI_TOKENS.certificateRepository),
  liveClassRepository: Container.get(DI_TOKENS.liveClassRepository),
  liveReminderPreferenceRepository: Container.get(DI_TOKENS.liveReminderPreferenceRepository),
  studentCourseBookmarkRepository: Container.get(DI_TOKENS.studentCourseBookmarkRepository),
  cache: Container.get(DI_TOKENS.cache),
  passwordHasher: Container.get(DI_TOKENS.passwordHasher),
  emailJobs: Container.get(DI_TOKENS.emailJobs),
  activityJobs: Container.get(DI_TOKENS.activityJobs),
  adminAuthService: Container.get(DI_TOKENS.adminAuthService),
  adminInvitationService: Container.get(DI_TOKENS.adminInvitationService),
  adminDirectoryService: Container.get(DI_TOKENS.adminDirectoryService),
  adminNotificationService: Container.get(DI_TOKENS.adminNotificationService),
  authorAuthService: Container.get(DI_TOKENS.authorAuthService),
  authorInvitationService: Container.get(DI_TOKENS.authorInvitationService),
  courseService: Container.get(DI_TOKENS.courseService),
  liveReminderService: Container.get(DI_TOKENS.liveReminderService),
  studentCourseBookmarkService: Container.get(DI_TOKENS.studentCourseBookmarkService),
  assessmentService: Container.get(DI_TOKENS.assessmentService),
  certificateService: Container.get(DI_TOKENS.certificateService),
  courseParticipationService: Container.get(DI_TOKENS.courseParticipationService),
  coursePaymentService: Container.get(DI_TOKENS.coursePaymentService),
  liveClassService: Container.get(DI_TOKENS.liveClassService),
  studentAuthService: Container.get(DI_TOKENS.studentAuthService),
  studentInvitationService: Container.get(DI_TOKENS.studentInvitationService),
  startupService: Container.get(DI_TOKENS.startupService),
})

export const logger = Container.get(DI_TOKENS.logger)
export const mongoConnection = Container.get(DI_TOKENS.mongoConnection)
export const redisConnection = Container.get(DI_TOKENS.redisConnection)
