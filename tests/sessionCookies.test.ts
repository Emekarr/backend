import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import { ApplicationError } from '../src/entities/errors/applicationError'
import { authenticateSession, setSession } from '../src/infrastructure/http/sessionCookies'

type CookieCall = {
  name: string
  value: string
  options: Record<string, unknown>
}

const responseRecorder = (): {
  response: Response
  cookies: CookieCall[]
  cleared: string[]
} => {
  const cookies: CookieCall[] = []
  const cleared: string[] = []
  const response = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options })
      return response
    },
    clearCookie(name: string) {
      cleared.push(name)
      return response
    },
  }
  return { response: response as unknown as Response, cookies, cleared }
}

test('renews an expired access cookie from the current refresh session', async () => {
  const { response, cookies } = responseRecorder()
  const request = {
    headers: {
      cookie: 'danvic_author_access=expired-access; danvic_author_refresh=current-refresh',
    },
  } as Request
  const authenticatedTokens: string[] = []

  const user = await authenticateSession(request, response, 'author', {
    async authenticate(accessToken) {
      authenticatedTokens.push(accessToken)
      if (accessToken === 'expired-access')
        throw new ApplicationError('Expired', 'INVALID_TOKEN', 401)
      return { id: 'author-1' }
    },
    async renewAccess(refreshToken) {
      assert.equal(refreshToken, 'current-refresh')
      return 'renewed-access'
    },
  })

  assert.deepEqual(user, { id: 'author-1' })
  assert.deepEqual(authenticatedTokens, ['expired-access', 'renewed-access'])
  assert.equal(cookies.length, 1)
  assert.equal(cookies[0]?.name, 'danvic_author_access')
  assert.equal(cookies[0]?.value, 'renewed-access')
  assert.equal(cookies[0]?.options.maxAge, 2 * 60 * 60 * 1000)
})

test('does not hide an invalid access-token error when no refresh cookie exists', async () => {
  const { response, cookies } = responseRecorder()
  const request = {
    headers: { cookie: 'danvic_admin_access=invalid-access' },
  } as Request
  let renewed = false

  await assert.rejects(
    authenticateSession(request, response, 'admin', {
      async authenticate() {
        throw new ApplicationError('Invalid', 'INVALID_TOKEN', 401)
      },
      async renewAccess() {
        renewed = true
        return 'should-not-be-issued'
      },
    }),
    (error: unknown) => error instanceof ApplicationError && error.code === 'INVALID_TOKEN',
  )
  assert.equal(renewed, false)
  assert.equal(cookies.length, 0)
})

test('uses browser-compatible cookie attributes in development and production', () => {
  const originalNodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'development'
    const development = responseRecorder()
    setSession(development.response, 'student', {
      accessToken: 'access',
      refreshToken: 'refresh',
    })
    assert.deepEqual(
      {
        secure: development.cookies[0]?.options.secure,
        sameSite: development.cookies[0]?.options.sameSite,
        partitioned: development.cookies[0]?.options.partitioned,
      },
      { secure: false, sameSite: 'lax', partitioned: false },
    )

    process.env.NODE_ENV = 'production'
    const production = responseRecorder()
    setSession(production.response, 'student', {
      accessToken: 'access',
      refreshToken: 'refresh',
    })
    assert.deepEqual(
      {
        secure: production.cookies[0]?.options.secure,
        sameSite: production.cookies[0]?.options.sameSite,
        partitioned: production.cookies[0]?.options.partitioned,
      },
      { secure: true, sameSite: 'none', partitioned: true },
    )
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  }
})
