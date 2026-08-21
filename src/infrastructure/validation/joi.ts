import Joi, { type ObjectSchema } from 'joi'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ApplicationError } from '../../entities/errors/applicationError'

const plainText = (maximum: number) =>
  Joi.string()
    .trim()
    .min(1)
    .max(maximum)
    .custom((value, helpers) => {
      if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value))
        return helpers.error('string.plainText')
      return value
    })
    .messages({ 'string.plainText': '{{#label}} must contain plain text only' })

const MAX_LEGACY_MODULE_CONTENT_LENGTH = 100_000
const MAX_RICH_MODULE_CONTENT_LENGTH = 2_000_000
const MAX_RICH_MODULE_NODES = 50_000
const MAX_RICH_MODULE_DEPTH = 32

const tiptapNodeTypes = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'image',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
])
const tiptapMarkTypes = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link'])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function validTiptapDocument(value: unknown): boolean {
  if (!isObject(value) || value.type !== 'doc' || !Array.isArray(value.content)) return false
  let nodeCount = 0
  let meaningful = false
  const visit = (node: unknown, depth: number): boolean => {
    if (!isObject(node) || depth > MAX_RICH_MODULE_DEPTH || nodeCount++ > MAX_RICH_MODULE_NODES)
      return false
    if (typeof node.type !== 'string' || !tiptapNodeTypes.has(node.type)) return false
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || node.text.length > MAX_RICH_MODULE_CONTENT_LENGTH)
        return false
      meaningful ||= node.text.trim().length > 0
    } else if ('text' in node) {
      return false
    }
    if (node.type === 'image') meaningful = true
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) return false
      for (const mark of node.marks) {
        if (!isObject(mark) || typeof mark.type !== 'string' || !tiptapMarkTypes.has(mark.type))
          return false
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) return false
      for (const child of node.content) if (!visit(child, depth + 1)) return false
    }
    return true
  }
  return visit(value, 0) && meaningful
}

const moduleContent = Joi.string()
  .trim()
  .min(1)
  .max(MAX_RICH_MODULE_CONTENT_LENGTH)
  .custom((value: string, helpers) => {
    if (value.startsWith('{"type":"doc"')) {
      try {
        if (validTiptapDocument(JSON.parse(value))) return value
      } catch {
        // The validation error below intentionally covers malformed editor documents.
      }
      return helpers.error('string.moduleContent')
    }
    if (
      value.length > MAX_LEGACY_MODULE_CONTENT_LENGTH ||
      /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)
    )
      return helpers.error('string.moduleContent')
    return value
  })
  .messages({
    'string.moduleContent': '{{#label}} must be valid course-module content',
  })

const MAX_COURSE_UPLOAD_BYTES = 1024 * 1024 * 1024

const email = Joi.string()
  .email({ tlds: { allow: false } })
  .max(320)
  .required()
const password = Joi.string().min(12).max(128).required()
const code = Joi.string()
  .pattern(/^\d{6}$/)
  .required()
const token = Joi.string()
  .pattern(/^[A-Za-z0-9_-]{32,256}$/)
  .required()
const id = Joi.string()
  .pattern(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  .required()
const empty = Joi.object({}).unknown(false)
const profileText = (maximum: number) =>
  Joi.string()
    .trim()
    .allow('')
    .max(maximum)
    .custom((value, helpers) => {
      if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value))
        return helpers.error('string.plainText')
      return value
    })
    .messages({ 'string.plainText': '{{#label}} must contain plain text only' })
const profileUrl = Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .max(500)
  .allow(null)
const callbackUrl = Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .max(500)

export const schemas = {
  empty,
  paystackReference: Joi.object({
    reference: Joi.string()
      .pattern(/^DANVIC-[0-9A-HJKMNP-TV-Z]{26}$/)
      .required(),
  }).unknown(false),
  paymentInitialization: Joi.object({
    paymentMethodId: id.allow(null).optional(),
    savePaymentMethod: Joi.boolean().required(),
    callbackUrl: callbackUrl.required(),
  }).unknown(false),
  cardSetup: Joi.object({ callbackUrl: callbackUrl.required() }).unknown(false),
  paymentMethodParams: Joi.object({ paymentMethodId: id }).unknown(false),
  idParams: Joi.object({ courseId: id }).unknown(false),
  notificationParams: Joi.object({ notificationId: id }).unknown(false),
  authorParams: Joi.object({ authorId: id }).unknown(false),
  studentParams: Joi.object({ studentId: id }).unknown(false),
  courseModuleParams: Joi.object({ courseId: id, moduleId: id }).unknown(false),
  courseAttachmentParams: Joi.object({ courseId: id, attachmentId: id }).unknown(false),
  sessionParams: Joi.object({ sessionId: id }).unknown(false),
  sessionRecordingParams: Joi.object({ sessionId: id, recordingId: id }).unknown(false),
  courseRecordingParams: Joi.object({ courseId: id, recordingId: id }).unknown(false),
  assessmentParams: Joi.object({ assessmentId: id }).unknown(false),
  assessmentAttemptParams: Joi.object({ assessmentId: id, attemptId: id }).unknown(false),
  attemptParams: Joi.object({ attemptId: id }).unknown(false),
  certificateNumberParams: Joi.object({
    certificateNumber: Joi.string()
      .pattern(/^\d{4}-\d{4}-\d{4}-\d{4}$/)
      .required(),
  }).unknown(false),
  certificateParams: Joi.object({ certificateId: id }).unknown(false),
  certificatePdfQuery: Joi.object({ download: Joi.string().valid('1').optional() }).unknown(false),
  login: Joi.object({ email, password: Joi.string().min(1).max(128).required() }).unknown(false),
  email: Joi.object({ email }).unknown(false),
  resetPassword: Joi.object({ email, code, newPassword: password }).unknown(false),
  updatePassword: Joi.object({
    currentPassword: Joi.string().min(1).max(128).required(),
    newPassword: password,
  }).unknown(false),
  twoFactorCode: Joi.object({ code }).unknown(false),
  invitationList: Joi.object({
    emails: Joi.array().items(email).min(1).max(50).unique().required(),
  }).unknown(false),
  courseInvitationList: Joi.object({
    courseId: id,
    emails: Joi.array().items(email).min(1).max(50).unique().required(),
  }).unknown(false),
  invitationToken: Joi.object({ token }).unknown(false),
  acceptInvitation: Joi.object({
    token,
    firstName: plainText(100).required(),
    lastName: plainText(100).required(),
    password,
  }).unknown(false),
  authorProfile: Joi.object({
    bio: profileText(2000).required(),
    linkedInUrl: profileUrl.required(),
    xUrl: profileUrl.required(),
    instagramUrl: profileUrl.required(),
    facebookUrl: profileUrl.required(),
    websiteUrl: profileUrl.required(),
  }).unknown(false),
  studentProfile: Joi.object({
    bio: profileText(2000).required(),
    linkedInUrl: profileUrl.required(),
    xUrl: profileUrl.required(),
    facebookUrl: profileUrl.required(),
    instagramUrl: profileUrl.required(),
    youtubeUrl: profileUrl.required(),
    websiteUrl: profileUrl.required(),
  }).unknown(false),
  course: Joi.object({
    name: plainText(160).required(),
    durationMinutes: Joi.number().integer().min(1).max(100000).required(),
    type: Joi.string().valid('live', 'premade').required(),
    liveCallDurationMinutes: Joi.when('type', {
      is: 'live',
      then: Joi.number().integer().min(10).max(300).multiple(10).required(),
      otherwise: Joi.valid(null).required(),
    }),
    certificateOnCompletion: Joi.boolean().required(),
    accessType: Joi.string().valid('free', 'paid').required(),
    priceNaira: Joi.when('accessType', {
      is: 'paid',
      then: Joi.number().min(0.01).max(10_000_000).precision(2).strict().required(),
      otherwise: Joi.number().valid(0).required(),
    }),
    scheduledAt: Joi.string().isoDate().allow(null).optional(),
    modules: Joi.array()
      .items(
        Joi.object({
          title: plainText(200).required(),
          content: moduleContent.required(),
        }).unknown(false),
      )
      .max(100)
      .required(),
    attachments: Joi.array()
      .items(
        Joi.object({
          attachmentPath: Joi.string()
            .pattern(
              /^courses\/[0-9A-HJKMNP-TV-Z]{26}\/[0-9A-HJKMNP-TV-Z]{26}\.(pdf|jpg|png|svg|gif|webp|mp4|mov|webm|mp3|wav|m4a|ogg|txt|csv|doc|docx|ppt|pptx|xls|xlsx|zip)$/,
            )
            .required(),
          moduleId: id.allow(null).optional(),
          moduleIndex: Joi.number().integer().min(0).max(99).allow(null).optional(),
          fileName: plainText(200).allow(null).optional(),
        }).unknown(false),
      )
      .max(10)
      .required(),
  }).unknown(false),
  courseUpdate: Joi.object({
    name: plainText(160).required(),
    durationMinutes: Joi.number().integer().min(1).max(100000).required(),
    type: Joi.string().valid('live', 'premade').required(),
    liveCallDurationMinutes: Joi.when('type', {
      is: 'live',
      then: Joi.number().integer().min(10).max(300).multiple(10).required(),
      otherwise: Joi.valid(null).required(),
    }),
    certificateOnCompletion: Joi.boolean().required(),
    accessType: Joi.string().valid('free', 'paid').required(),
    priceNaira: Joi.when('accessType', {
      is: 'paid',
      then: Joi.number().min(0.01).max(10_000_000).precision(2).strict().required(),
      otherwise: Joi.number().valid(0).required(),
    }),
    scheduledAt: Joi.string().isoDate().allow(null).required(),
  }).unknown(false),
  liveSessionCreate: Joi.object({
    courseId: id.allow(null).required(),
    scheduledAt: Joi.string().isoDate().allow(null).optional(),
    durationMinutes: Joi.number().integer().min(10).max(300).multiple(10).required(),
  }).unknown(false),
  reminderPreference: Joi.object({
    enabled: Joi.boolean().required(),
  }).unknown(false),
  authorRating: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
  }).unknown(false),
  catalog: Joi.object({
    query: Joi.string().trim().max(100).allow('').optional(),
  }).unknown(false),
  module: Joi.object({
    title: plainText(200).required(),
    content: moduleContent.required(),
  }).unknown(false),
  attachment: Joi.object({
    attachmentPath: Joi.string()
      .pattern(
        /^courses\/[0-9A-HJKMNP-TV-Z]{26}\/[0-9A-HJKMNP-TV-Z]{26}\.(pdf|jpg|png|svg|gif|webp|mp4|mov|webm|mp3|wav|m4a|ogg|txt|csv|doc|docx|ppt|pptx|xls|xlsx|zip)$/,
      )
      .required(),
    fileName: plainText(200).allow(null).optional(),
  }).unknown(false),
  upload: Joi.object({
    fileName: plainText(200).required(),
    contentType: Joi.string()
      .valid(
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/svg+xml',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'audio/mpeg',
        'audio/wav',
        'audio/mp4',
        'audio/ogg',
        'text/plain',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
      )
      .required(),
    sizeBytes: Joi.number()
      .integer()
      .min(1)
      .max(MAX_COURSE_UPLOAD_BYTES)
      .messages({ 'number.max': 'Each file must be 1 GiB or smaller' })
      .required(),
  }).unknown(false),
  assessment: Joi.object({
    title: plainText(200).required(),
    description: plainText(5000).required(),
    courseId: id.allow(null).optional(),
    durationMinutes: Joi.number().integer().min(1).max(1440).required(),
    opensAt: Joi.string().isoDate().required(),
    closesAt: Joi.string().isoDate().required(),
    manualReview: Joi.boolean().required(),
    retrySupported: Joi.boolean().required(),
    maxAttempts: Joi.when('retrySupported', {
      is: true,
      then: Joi.number().integer().min(2).max(100).required(),
      otherwise: Joi.number().integer().valid(1).required(),
    }),
    passingScorePercent: Joi.number().min(0).max(100).required(),
    questions: Joi.array()
      .items(
        Joi.object({
          prompt: plainText(5000).required(),
          type: Joi.string().valid('multiple_choice', 'free_text').required(),
          options: Joi.when('type', {
            is: 'multiple_choice',
            then: Joi.array()
              .items(
                Joi.object({
                  id: Joi.string()
                    .pattern(/^[A-Za-z0-9_-]{1,100}$/)
                    .required(),
                  label: plainText(500).required(),
                }).unknown(false),
              )
              .min(2)
              .max(6)
              .unique('id')
              .required(),
            otherwise: Joi.array().max(0).required(),
          }),
          correctOptionIds: Joi.when('type', {
            is: 'multiple_choice',
            then: Joi.array()
              .items(Joi.string().pattern(/^[A-Za-z0-9_-]{1,100}$/))
              .length(1)
              .unique()
              .required(),
            otherwise: Joi.array().max(0).required(),
          }),
          mediaType: Joi.string().valid('image', 'video', 'audio').allow(null).optional(),
          mediaUrl: Joi.alternatives()
            .try(
              Joi.string()
                .uri({ scheme: ['http', 'https'] })
                .max(2048),
              Joi.string().pattern(
                /^courses\/[0-9A-HJKMNP-TV-Z]{26}\/[0-9A-HJKMNP-TV-Z]{26}\.(jpg|png|mp4|mp3)$/,
              ),
              Joi.valid(null),
            )
            .optional(),
          points: Joi.number().integer().min(1).max(1000).required(),
        }).unknown(false),
      )
      .min(1)
      .required(),
  }).unknown(false),
  assessmentSubmission: Joi.object({
    answers: Joi.array()
      .items(
        Joi.object({
          questionId: Joi.string().uuid().required(),
          selectedOptionIds: Joi.array()
            .items(Joi.string().pattern(/^[A-Za-z0-9_-]{1,100}$/))
            .max(6)
            .unique()
            .optional(),
          text: plainText(50000).allow(null).optional(),
        }).unknown(false),
      )
      .unique('questionId')
      .required(),
  }).unknown(false),
  assessmentReview: Joi.object({
    grades: Joi.array()
      .items(
        Joi.object({
          questionId: Joi.string().uuid().required(),
          awardedPoints: Joi.number().min(0).max(1000).required(),
          feedback: plainText(5000).allow(null).optional(),
        }).unknown(false),
      )
      .min(1)
      .unique('questionId')
      .required(),
  }).unknown(false),
  certificateEmail: Joi.object({ email }).unknown(false),
  liveParticipantState: Joi.object({
    microphoneOn: Joi.boolean(),
    cameraOn: Joi.boolean(),
    screenSharing: Joi.boolean(),
    handRaised: Joi.boolean(),
  })
    .min(1)
    .unknown(false),
  liveWhiteboardState: Joi.object({ active: Joi.boolean().required() }).unknown(false),
  liveMessage: Joi.object({
    kind: Joi.string().valid('chat', 'reaction').required(),
    body: plainText(2000).required(),
  }).unknown(false),
  liveModeration: Joi.object({
    action: Joi.string()
      .valid(
        'mute-all',
        'camera-off-all',
        'mute',
        'camera-off',
        'kick',
        'ban',
        'allow-publish',
        'block-publish',
      )
      .required(),
    participantId: id.optional(),
  }).unknown(false),
  liveRecording: Joi.object({ type: Joi.string().valid('web', 'audio').required() }).unknown(false),
} as const

export const validateBody = (schema: ObjectSchema): RequestHandler => validate('body', schema)

export const validateParams = (schema: ObjectSchema): RequestHandler => validate('params', schema)

export const validateQuery = (schema: ObjectSchema = empty): RequestHandler =>
  validate('query', schema)

const validate =
  (source: 'body' | 'params' | 'query', schema: ObjectSchema): RequestHandler =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(request[source] ?? {}, {
      abortEarly: false,
      allowUnknown: false,
      convert: false,
      errors: { escapeHtml: true },
    })
    if (error) {
      next(
        new ApplicationError(
          error.details.map((item) => item.message).join('; '),
          'VALIDATION_ERROR',
          400,
        ),
      )
      return
    }
    if (source === 'body') request.body = value
    next()
  }
