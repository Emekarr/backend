import mongoose, { type Model } from 'mongoose'
import { randomInt } from 'node:crypto'
import type { CertificateRepository } from '../../../../entities/interfaces/certificateRepository'
import type { Certificate } from '../../../../entities/models/Certificate'
import { generateID } from '../../../identifiers/generators'
import { CertificateSchema } from '../models/Certificate'

export class CertificateRepo implements CertificateRepository {
  private readonly certificates: Model<Certificate> =
    (mongoose.models.Certificate as Model<Certificate> | undefined) ??
    mongoose.model('Certificate', CertificateSchema)

  async issue(input: Parameters<CertificateRepository['issue']>[0]): Promise<Certificate> {
    const document = await this.certificates
      .findOneAndUpdate(
        { studentId: input.studentId, courseId: input.courseId },
        {
          $setOnInsert: {
            id: generateID(),
            certificateNumber: generateCertificateNumber(),
            ...input,
            revokedAt: null,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean<Certificate>(document)
  }

  async findById(id: string): Promise<Certificate | null> {
    const document = await this.certificates.findOne({ id }).lean().exec()
    return document ? clean<Certificate>(document) : null
  }

  async findByNumber(certificateNumber: string): Promise<Certificate | null> {
    const document = await this.certificates
      .findOne({ certificateNumber: certificateNumber.toUpperCase() })
      .lean()
      .exec()
    return document ? clean<Certificate>(document) : null
  }

  async findForStudentCourse(studentId: string, courseId: string): Promise<Certificate | null> {
    const document = await this.certificates.findOne({ studentId, courseId }).lean().exec()
    return document ? clean<Certificate>(document) : null
  }
}

const generateCertificateNumber = (): string =>
  Array.from({ length: 4 }, () => randomInt(0, 10_000).toString().padStart(4, '0')).join('-')

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}
