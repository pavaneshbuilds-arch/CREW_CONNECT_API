import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

import { prisma } from '../config/prisma.js';
import config from '../config/env.js';
import ApiError from '../utils/apiError.js';
import { generateOtp, hashOtp, verifyOtp, otpExpiry } from '../utils/otp.js';
import { smsService, activityLogService, tokenService } from './index.js';

// Which Prisma model backs each phone-OTP subject type.
const SUBJECTS = {
  user: { subjectType: 'user' },
  crew: { subjectType: 'crew' },
};

class AuthService {
  constructor() {
    this.googleClient = config.google.clientId ? new OAuth2Client(config.google.clientId) : null;
  }

  /**
   * Step 1 of phone auth: generate + "send" an OTP for a user or crew phone.
   * Stores only a hash of the code with an expiry. Existing unconsumed codes for
   * the same phone/type are invalidated first so only the latest is valid.
   */
  async requestPhoneOtp({ phoneNumber, subjectType }) {
    if (!SUBJECTS[subjectType]) {
      throw ApiError.badRequest('subjectType must be "user" or "crew"', { code: 'BAD_SUBJECT' });
    }

    await prisma.otpVerification.updateMany({
      where: { phoneNumber, subjectType, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = generateOtp();
    await prisma.otpVerification.create({
      data: {
        phoneNumber,
        subjectType,
        codeHash: await hashOtp(code),
        expiresAt: otpExpiry(),
      },
    });

    await smsService.sendOtp(phoneNumber, code);

    const response = { phoneNumber, expiresInSeconds: config.otp.ttlSeconds };
    // Development-only convenience so the flow is testable without a live SMS gateway.
    if (config.otp.devExpose && !config.isProduction) response.devOtp = code;
    return response;
  }

  /**
   * Validate and consume the latest unused OTP for a phone + subject.
   * Used by login and by authenticated Google users attaching a real phone.
   */
  async consumePhoneOtp({ phoneNumber, code, subjectType }) {
    if (!SUBJECTS[subjectType]) {
      throw ApiError.badRequest('subjectType must be "user" or "crew"', { code: 'BAD_SUBJECT' });
    }

    const record = await prisma.otpVerification.findFirst({
      where: { phoneNumber, subjectType, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw ApiError.badRequest('No active OTP. Please request a new one.', { code: 'OTP_NOT_FOUND' });
    if (record.expiresAt < new Date()) throw ApiError.badRequest('OTP has expired', { code: 'OTP_EXPIRED' });
    if (record.attempts >= config.otp.maxAttempts) {
      throw ApiError.tooManyRequests('Too many incorrect attempts. Request a new OTP.', { code: 'OTP_LOCKED' });
    }

    // Development-only: crew testers can enter any 4-digit code. Production
    // always verifies the hashed OTP, even if OTP_DEV_ACCEPT_ANY is set.
    const acceptAnyCrewOtp =
      !config.isProduction && config.otp.devAcceptAny && subjectType === 'crew';
    const matches = acceptAnyCrewOtp || (await verifyOtp(code, record.codeHash));
    if (!matches) {
      await prisma.otpVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw ApiError.badRequest('Incorrect OTP', { code: 'OTP_INVALID' });
    }

    await prisma.otpVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return record;
  }

  /**
   * Step 2 of phone auth: verify the OTP, find-or-create the user/crew record,
   * and issue tokens. Crew login is additionally gated on verification_status.
   */
  async verifyPhoneOtp({ phoneNumber, code, subjectType }) {
    await this.consumePhoneOtp({ phoneNumber, code, subjectType });

    const principal =
      subjectType === 'user'
        ? await this.#findOrCreateUserByPhone(phoneNumber)
        : await this.#findOrCreateCrewByPhone(phoneNumber);

    const tokens = await tokenService.issueTokens(principal);

    await activityLogService.record({
      category: 'login',
      actorType: subjectType,
      actorId: principal.id,
      action: 'login_success',
      metadata: { method: 'phone_otp' },
    });

    return { ...principal.publicProfile, tokens };
  }

  async #findOrCreateUserByPhone(phoneNumber) {
    let user = await prisma.user.findUnique({ where: { phoneNumber } });
    let isNew = false;
    if (!user) {
      user = await prisma.user.create({ data: { phoneNumber, authProvider: 'phone_otp' } });
      isNew = true;
    }
    if (user.deletedAt) throw ApiError.forbidden('This account has been deactivated', { code: 'ACCOUNT_DELETED' });
    if (!user.isActive) throw ApiError.forbidden('This account is suspended', { code: 'ACCOUNT_SUSPENDED' });
    return {
      id: user.id,
      type: 'user',
      publicProfile: { id: user.id, phoneNumber: user.phoneNumber, fullName: user.fullName, isNew },
    };
  }

  async #findOrCreateCrewByPhone(phoneNumber) {
    let crew = await prisma.crewMember.findUnique({ where: { phoneNumber } });
    let isNew = false;
    if (!crew) {
      // A minimal record is created at first login; the crew completes onboarding
      // (role, documents) afterward and an admin verifies before full access.
      crew = await prisma.crewMember.create({ data: { phoneNumber, primaryRole: 'waiter' } });
      isNew = true;
    }
    if (crew.deletedAt) throw ApiError.forbidden('This account has been deactivated', { code: 'ACCOUNT_DELETED' });
    if (!crew.isActive) throw ApiError.forbidden('This account is suspended', { code: 'ACCOUNT_SUSPENDED' });
    return {
      id: crew.id,
      type: 'crew',
      publicProfile: {
        id: crew.id,
        phoneNumber: crew.phoneNumber,
        fullName: crew.fullName,
        verificationStatus: crew.verificationStatus,
        isNew,
      },
    };
  }

  /**
   * Google Sign-In for users. Verifies the Google ID token, then links/creates
   * the account by google_id (falling back to email match).
   */
  async loginWithGoogle({ idToken }) {
    if (!this.googleClient) {
      throw ApiError.internal('Google Sign-In is not configured', { code: 'GOOGLE_NOT_CONFIGURED' });
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: config.google.clientId });
      payload = ticket.getPayload();
    } catch (err) {
      throw ApiError.unauthorized('Invalid Google token', { code: 'GOOGLE_INVALID' });
    }

    const googleId = payload.sub;
    const email = payload.email;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, ...(email ? [{ email }] : [])] },
    });

    let isNew = false;
    if (!user) {
      user = await prisma.user.create({
        data: {
          // Google accounts have no phone yet; store a placeholder unique value.
          phoneNumber: `google:${googleId}`,
          email,
          fullName: payload.name,
          profilePhotoUrl: payload.picture,
          authProvider: 'google',
          googleId,
        },
      });
      isNew = true;
    } else if (!user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId, authProvider: 'google' } });
    }

    if (user.deletedAt || !user.isActive) {
      throw ApiError.forbidden('This account is not active', { code: 'ACCOUNT_INACTIVE' });
    }

    const tokens = await tokenService.issueTokens({ id: user.id, type: 'user' });
    const phoneVerified = typeof user.phoneNumber === 'string' && !user.phoneNumber.startsWith('google:');

    await activityLogService.record({
      category: 'login',
      actorType: 'user',
      actorId: user.id,
      action: 'login_success',
      metadata: { method: 'google' },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      profilePhotoUrl: user.profilePhotoUrl,
      phoneNumber: phoneVerified ? user.phoneNumber : null,
      phoneVerified,
      isNew,
      tokens,
    };
  }

  /**
   * Admin email + password login.
   */
  async loginAdmin({ email, password }) {
    const admin = await prisma.admin.findUnique({ where: { email } });
    const invalid = ApiError.unauthorized('Invalid email or password', { code: 'BAD_CREDENTIALS' });

    if (!admin || !admin.isActive) throw invalid;
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw invalid;

    const tokens = await tokenService.issueTokens({ id: admin.id, type: 'admin', role: admin.role });

    await activityLogService.record({
      category: 'login',
      actorType: 'admin',
      actorId: admin.id,
      action: 'login_success',
      metadata: { method: 'password' },
    });

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      tokens,
    };
  }

  async refresh(refreshToken) {
    return tokenService.rotateTokens(refreshToken);
  }

  async logout(refreshToken) {
    return tokenService.revokeToken(refreshToken);
  }

  /**
   * Resolve the authenticated principal from the access token into a profile
   * the client can render (admin console, mobile splash).
   */
  async getMe({ sub, type }) {
    if (type === 'admin') {
      const admin = await prisma.admin.findUnique({
        where: { id: sub },
        select: { id: true, email: true, fullName: true, role: true, isActive: true },
      });
      if (!admin || !admin.isActive) {
        throw ApiError.unauthorized('Admin account is not active', { code: 'ACCOUNT_INACTIVE' });
      }
      return { ...admin, type: 'admin' };
    }

    if (type === 'user') {
      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          fullName: true,
          profilePhotoUrl: true,
          isActive: true,
          deletedAt: true,
        },
      });
      if (!user || user.deletedAt || !user.isActive) {
        throw ApiError.unauthorized('Account is not active', { code: 'ACCOUNT_INACTIVE' });
      }
      const { deletedAt: _deletedAt, ...publicUser } = user;
      return { ...publicUser, type: 'user' };
    }

    if (type === 'crew') {
      const crew = await prisma.crewMember.findUnique({
        where: { id: sub },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          fullName: true,
          profilePhotoUrl: true,
          verificationStatus: true,
          isActive: true,
          deletedAt: true,
        },
      });
      if (!crew || crew.deletedAt || !crew.isActive) {
        throw ApiError.unauthorized('Account is not active', { code: 'ACCOUNT_INACTIVE' });
      }
      const { deletedAt: _deletedAt, ...publicCrew } = crew;
      return { ...publicCrew, type: 'crew' };
    }

    throw ApiError.unauthorized('Unknown account type', { code: 'INVALID_TOKEN' });
  }
}

export default new AuthService();
