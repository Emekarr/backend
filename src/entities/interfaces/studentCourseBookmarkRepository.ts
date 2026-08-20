import type {
  CreateStudentCourseBookmark,
  StudentCourseBookmark,
} from '../models/StudentCourseBookmark'

export interface StudentCourseBookmarkRepository {
  find(studentId: string, courseId: string): Promise<StudentCourseBookmark | null>
  listForStudent(studentId: string): Promise<StudentCourseBookmark[]>
  save(input: CreateStudentCourseBookmark): Promise<StudentCourseBookmark>
  markDelivered(
    studentId: string,
    courseId: string,
    leadMinutes: 30 | 10,
    deliveredAt: Date,
  ): Promise<void>
  markDeliveryFailed(
    studentId: string,
    courseId: string,
    leadMinutes: 30 | 10,
    message: string,
  ): Promise<void>
}
