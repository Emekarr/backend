export const PERMISSIONS = [
  'invite_admin',
  'manage_admins',
  'invite_author',
  'manage_authors',
  'invite_student',
  'view_content_assessment',
  'review_content',
  'publish_content',
  'archive_content',
  'manage_content_versions',
  'manage_question_bank',
  'view_tutor_content_analytics',
  'manage_security_settings',
] as const

export type Permission = (typeof PERMISSIONS)[number]
