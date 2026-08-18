export const PERMISSIONS = [
  'invite_admin',
  'manage_admins',
  'invite_author',
  'manage_authors',
  'invite_student',
] as const

export type Permission = (typeof PERMISSIONS)[number]
