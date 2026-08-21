import type { Attachment, CreateAttachment } from '../models/Attachment'
import type { Course, CreateCourse } from '../models/Course'
import type { CourseModule, CreateCourseModule } from '../models/CourseModule'

export interface CourseAggregate {
  course: Course
  modules: CourseModule[]
  attachments: Attachment[]
}

export type CreateCourseAttachment = Omit<CreateAttachment, 'courseId' | 'courseName'> & {
  moduleIndex?: number | null
}

export interface CourseCatalogRepository {
  create(input: {
    course: CreateCourse
    modules: Array<Omit<CreateCourseModule, 'courseId' | 'order'>>
    attachments: CreateCourseAttachment[]
  }): Promise<CourseAggregate>
  findById(id: string): Promise<CourseAggregate | null>
  findAll(): Promise<Course[]>
  findByAuthor(authorId: string): Promise<Course[]>
  findAvailable(now: Date): Promise<Course[]>
  updateCourse(
    id: string,
    input: Pick<
      Course,
      | 'name'
      | 'durationMinutes'
      | 'type'
      | 'liveCallDurationMinutes'
      | 'certificateOnCompletion'
      | 'scheduledAt'
      | 'accessType'
      | 'priceKobo'
    >,
  ): Promise<Course | null>
  addModule(
    course: Course,
    input: Omit<CreateCourseModule, 'courseId' | 'order'>,
  ): Promise<CourseModule>
  updateModule(
    course: Course,
    moduleId: string,
    input: { title: string; content: string },
  ): Promise<CourseModule | null>
  deleteModule(course: Course, moduleId: string): Promise<boolean>
  addAttachment(
    course: Course,
    input: Omit<CreateAttachment, 'courseId' | 'courseName'>,
  ): Promise<Attachment>
  deleteAttachment(course: Course, attachmentId: string): Promise<boolean>
}
