import QRCode from 'qrcode'
import type {
  TwoFactorAuthenticator,
  TwoFactorSetup,
  TwoFactorVerification,
} from '../../entities/interfaces/auth'

export class TotpAuthenticator implements TwoFactorAuthenticator {
  constructor(private readonly issuer: string) {}

  async createSetup(email: string): Promise<TwoFactorSetup> {
    const { generateSecret, generateURI } = await import('otplib')
    const secret = generateSecret({ length: 20 })
    const otpauthUri = generateURI({ issuer: this.issuer, label: email, secret })

    return {
      secret,
      otpauthUri,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M' }),
    }
  }

  async verify(
    secret: string,
    code: string,
    afterTimeStep?: number,
  ): Promise<TwoFactorVerification> {
    const { verify } = await import('otplib')
    const result = await verify({
      secret,
      token: code,
      epochTolerance: 30,
      ...(afterTimeStep === undefined ? {} : { afterTimeStep }),
    })

    return result.valid && 'timeStep' in result
      ? { valid: true, timeStep: result.timeStep }
      : { valid: false }
  }
}
