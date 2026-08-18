import { ApplicationError } from '../../entities/errors/applicationError'
import type { AdminRepository } from '../../entities/interfaces/adminRepository'
import type { AuthorRepository } from '../../entities/interfaces/authorRepository'
import type { AssessmentRepository } from '../../entities/interfaces/assessmentRepository'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { CertificateRepository } from '../../entities/interfaces/certificateRepository'
import type { StudentRepository } from '../../entities/interfaces/studentRepository'
import type { Admin } from '../../entities/models/Admin'
import type { Author } from '../../entities/models/Author'
import type { Student } from '../../entities/models/Student'

export interface AdminDirectoryDependencies {
  admins: AdminRepository
  authors: AuthorRepository
  students: StudentRepository
  courses: CourseCatalogRepository
  assessments: AssessmentRepository
  participation: CourseParticipationRepository
  certificates: CertificateRepository
}

export class AdminDirectoryService {
  constructor(private readonly dependencies: AdminDirectoryDependencies) {}

  async listAdmins() {
    const admins = await this.dependencies.admins.findMany()
    return admins.map(publicAdmin).sort(byName)
  }

  async listAuthors() {
    const [authors, courses] = await Promise.all([
      this.dependencies.authors.findMany(),
      this.dependencies.courses.findAll(),
    ])
    const counts = new Map<string, number>()
    for (const course of courses) {
      counts.set(course.createdByAuthorId, (counts.get(course.createdByAuthorId) ?? 0) + 1)
    }
    return authors
      .map((author) => ({ ...publicAuthor(author), courseCount: counts.get(author.id) ?? 0 }))
      .sort(byName)
  }

  async getAuthor(authorId: string) {
    const author = await this.dependencies.authors.findById(authorId)
    if (!author) throw new ApplicationError('Author not found', 'AUTHOR_NOT_FOUND', 404)
    const courses = await this.dependencies.courses.findByAuthor(authorId)
    const coursesWithStats = await Promise.all(
      courses.map(async (course) => {
        const participants = await this.dependencies.participation.listParticipants(course.id)
        return {
          course,
          enrolledCount: participants.length,
          completedCount: participants.filter(
            (participant) => participant.enrollment.completedAt,
          ).length,
        }
      }),
    )
    return { author: publicAuthor(author), courses: coursesWithStats }
  }

  async listStudents() {
    const students = await this.dependencies.students.findMany()
    return students.map(publicStudent).sort(byName)
  }

  async getStudent(studentId: string) {
    const student = await this.dependencies.students.findById(studentId)
    if (!student) throw new ApplicationError('Student not found', 'STUDENT_NOT_FOUND', 404)
    const records = await this.dependencies.participation.listForStudent(studentId)
    const courses = await Promise.all(
      records.map(async (record) => {
        const aggregate = await this.dependencies.courses.findById(record.enrollment.courseId)
        const assessment = aggregate
          ? await this.dependencies.assessments.findByCourseId(aggregate.course.id)
          : null
        const attempts = assessment
          ? (await this.dependencies.assessments.listAttempts(assessment.id))
              .filter((attempt) => attempt.studentId === studentId)
              .sort((left, right) => right.attemptNumber - left.attemptNumber)
          : []
        return {
          course: aggregate?.course ?? null,
          enrollment: record.enrollment,
          completedCount: record.completedModules.length,
          moduleCount: aggregate?.modules.length ?? 0,
          assessment: assessment
            ? { title: assessment.title, attempt: attempts[0] ?? null, attempts }
            : null,
          certificate: aggregate
            ? await this.dependencies.certificates.findForStudentCourse(
                studentId,
                aggregate.course.id,
              )
            : null,
        }
      }),
    )
    return { student: publicStudent(student), courses }
  }

  async listCourses() {
    const [courses, authors] = await Promise.all([
      this.dependencies.courses.findAll(),
      this.dependencies.authors.findMany(),
    ])
    const authorsById = new Map(authors.map((author) => [author.id, publicAuthorReference(author)]))
    return courses.map((course) => ({
      course,
      author: authorsById.get(course.createdByAuthorId) ?? null,
    }))
  }

  async getCourse(courseId: string) {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    const [author, assessment, participantRecords] = await Promise.all([
      this.dependencies.authors.findById(aggregate.course.createdByAuthorId),
      this.dependencies.assessments.findByCourseId(courseId),
      this.dependencies.participation.listParticipants(courseId),
    ])
    const assessmentAttempts = assessment
      ? await this.dependencies.assessments.listAttempts(assessment.id)
      : []
    const participants = await Promise.all(
      participantRecords.map(async (participant) => {
        const attempts = assessmentAttempts
          .filter((attempt) => attempt.studentId === participant.student.id)
          .sort((left, right) => right.attemptNumber - left.attemptNumber)
        return {
          ...participant,
          moduleCount: aggregate.modules.length,
          completedCount: participant.completedModules.length,
          assessmentAttempt: attempts[0] ?? null,
          assessmentAttempts: attempts,
          certificate: await this.dependencies.certificates.findForStudentCourse(
            participant.student.id,
            courseId,
          ),
        }
      }),
    )
    return {
      ...aggregate,
      author: author ? publicAuthorReference(author) : null,
      assessment,
      participants,
    }
  }
}

const publicAdmin = (admin: Admin) => ({
  id: admin.id,
  firstName: admin.firstName,
  lastName: admin.lastName,
  email: admin.email,
  permissions: admin.permissions,
  isSuperAdmin: admin.isSuperAdmin,
  twoFactorEnabled: admin.twoFactorEnabled,
  disabledAt: admin.disabledAt,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
})

const publicPerson = (person: Author | Student) => ({
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  email: person.email,
  twoFactorEnabled: person.twoFactorEnabled,
  disabledAt: person.disabledAt,
  createdAt: person.createdAt,
  updatedAt: person.updatedAt,
})

const publicStudent = (student: Student) => ({
  ...publicPerson(student),
  bio: student.bio,
  linkedInUrl: student.linkedInUrl,
  xUrl: student.xUrl,
  facebookUrl: student.facebookUrl,
  instagramUrl: student.instagramUrl,
  youtubeUrl: student.youtubeUrl,
  websiteUrl: student.websiteUrl,
})

const publicAuthor = (author: Author) => ({
  ...publicPerson(author),
  bio: author.bio,
  linkedInUrl: author.linkedInUrl,
  xUrl: author.xUrl,
  instagramUrl: author.instagramUrl,
  facebookUrl: author.facebookUrl,
  websiteUrl: author.websiteUrl,
})

const publicAuthorReference = (author: Author) => ({
  id: author.id,
  firstName: author.firstName,
  lastName: author.lastName,
  email: author.email,
})

const byName = (left: { firstName: string; lastName: string }, right: typeof left) =>
  `${left.firstName} ${left.lastName}`.localeCompare(`${right.firstName} ${right.lastName}`)
