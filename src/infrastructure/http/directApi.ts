import { Router } from 'express'

type Frontend = 'admin' | 'author' | 'student'

/**
 * Provides a browser-facing compatibility API for the static frontends.
 *
 * The former Next.js BFF exposed `/api/*` for each frontend and translated
 * those calls to the domain API. Keeping that translation here lets the
 * frontends become static without duplicating route knowledge in every UI.
 */
export const createDirectApiRouter = (
  frontend: Frontend,
  upstreamRouters: readonly Router[],
): Router => {
  const router = Router()
  router.use((request, _response, next) => {
    request.url = destination(frontend, request.url)
    next()
  })
  for (const upstream of upstreamRouters) router.use(upstream)
  return router
}

const destination = (frontend: Frontend, url: string): string => {
  const pathname = url.split('?', 1)[0] ?? '/'
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  const suffix = query ? `?${query}` : ''

  if (frontend === 'student') {
    if (pathname === '/catalog') return `/courses${suffix}`
    if (pathname.startsWith('/certificate-verification/'))
      return `/certificates/${pathname.slice('/certificate-verification/'.length)}${suffix}`
    if (pathname.startsWith('/recorder/')) return `/live-recorder/${pathname.slice('/recorder/'.length)}${suffix}`
    if (pathname === '/auth/password') return `/student/auth/update-password${suffix}`
    if (pathname.startsWith('/certificates/')) return `/student${pathname}${suffix}`
    if (pathname.includes('/attachments/')) return `/student${pathname}/view${suffix}`
    if (pathname.startsWith('/live/')) return `/student${pathname}${suffix}`
    return `/student${pathname}${suffix}`
  }

  if (frontend === 'admin') {
    if (pathname === '/auth/password') return `/admin/auth/update-password${suffix}`
    if (pathname === '/invitations/author') return `/admin/author-invitations${suffix}`
    if (pathname === '/invitations/student') return `/admin/student-invitations${suffix}`
    if (pathname === '/invitations/admin') return `/admin/invitations${suffix}`
    if (pathname === '/invitations/accept') return `/admin/invitations/accept${suffix}`
    return `/admin${pathname}${suffix}`
  }

  return `/author${pathname}${suffix}`
}
