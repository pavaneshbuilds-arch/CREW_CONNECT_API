import { prisma } from '../config/prisma.js';
import config from '../config/env.js';
import ApiError from '../utils/apiError.js';
import { activityLogService, authService, couponService, tokenService } from './index.js';

function decimal(value) {
  if (value == null) return null;
  return Number(value);
}

function blankToNull(value) {
  if (value === undefined) return undefined;
  if (value === '') return null;
  return value;
}

function isPlaceholderPhone(phoneNumber) {
  return typeof phoneNumber === 'string' && phoneNumber.startsWith('google:');
}

function serializeAddress(address) {
  return {
    id: address.id,
    houseFlatNumber: address.houseFlatNumber,
    pincode: address.pincode,
    apartmentBuilding: address.apartmentBuilding,
    contactNumber: address.contactNumber,
    floorNumber: address.floorNumber,
    landmark: address.landmark,
    addressType: address.addressType,
    latitude: decimal(address.latitude),
    longitude: decimal(address.longitude),
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}

async function getUserOrThrow(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] } },
  });
  if (!user || user.deletedAt) throw ApiError.notFound('User not found', { code: 'USER_NOT_FOUND' });
  if (!user.isActive) throw ApiError.forbidden('This account is suspended', { code: 'ACCOUNT_SUSPENDED' });
  return user;
}

function serializeUser(user) {
  const phoneVerified = !isPlaceholderPhone(user.phoneNumber);
  const defaultAddress = user.addresses?.find((a) => a.isDefault) || user.addresses?.[0] || null;
  return {
    id: user.id,
    type: 'user',
    fullName: user.fullName,
    email: user.email,
    phoneNumber: phoneVerified ? user.phoneNumber : null,
    phoneVerified,
    profilePhotoUrl: user.profilePhotoUrl,
    locationAccessEnabled: user.locationAccessEnabled,
    pushNotificationsEnabled: user.pushNotificationsEnabled,
    marketingOptIn: user.marketingOptIn,
    profileComplete: Boolean(user.fullName),
    defaultAddress: defaultAddress ? serializeAddress(defaultAddress) : null,
  };
}

class UserService {
  async getMe(userId) {
    const user = await getUserOrThrow(userId);
    return serializeUser(user);
  }

  async updateMe(userId, body) {
    await getUserOrThrow(userId);

    const email = blankToNull(body.email);
    if (email) {
      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id: userId }, deletedAt: null },
        select: { id: true },
      });
      if (taken) {
        throw ApiError.conflict('This email is already in use', { code: 'UNIQUE_CONSTRAINT' });
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.email !== undefined ? { email } : {}),
        ...(body.profilePhotoUrl !== undefined ? { profilePhotoUrl: blankToNull(body.profilePhotoUrl) } : {}),
        ...(body.locationAccessEnabled !== undefined ? { locationAccessEnabled: body.locationAccessEnabled } : {}),
        ...(body.pushNotificationsEnabled !== undefined
          ? { pushNotificationsEnabled: body.pushNotificationsEnabled }
          : {}),
        ...(body.marketingOptIn !== undefined ? { marketingOptIn: body.marketingOptIn } : {}),
      },
    });

    return this.getMe(userId);
  }

  /**
   * Attach a real phone to the signed-in user (Google accounts start with a
   * google:<id> placeholder). Reuses the same OTP records as /auth/otp/request.
   */
  async verifyPhone(userId, { phoneNumber, code }) {
    const user = await getUserOrThrow(userId);

    await authService.consumePhoneOtp({ phoneNumber, code, subjectType: 'user' });

    const taken = await prisma.user.findFirst({
      where: { phoneNumber, NOT: { id: userId }, deletedAt: null },
      select: { id: true },
    });
    if (taken) {
      throw ApiError.conflict('This phone number is already in use', { code: 'PHONE_IN_USE' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        phoneNumber,
        authProvider: user.googleId ? 'google' : 'phone_otp',
      },
    });

    await activityLogService.record({
      category: 'login',
      actorType: 'user',
      actorId: userId,
      action: 'phone_linked',
      metadata: { phoneNumber },
    });

    return this.getMe(userId);
  }

  async listAddresses(userId) {
    await getUserOrThrow(userId);
    const addresses = await prisma.userAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map(serializeAddress);
  }

  async createAddress(userId, body) {
    await getUserOrThrow(userId);

    const existingCount = await prisma.userAddress.count({ where: { userId } });
    const makeDefault = body.isDefault === true || existingCount === 0;

    const created = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.userAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.userAddress.create({
        data: {
          userId,
          houseFlatNumber: blankToNull(body.houseFlatNumber) ?? null,
          pincode: blankToNull(body.pincode) ?? null,
          apartmentBuilding: blankToNull(body.apartmentBuilding) ?? null,
          contactNumber: blankToNull(body.contactNumber) ?? null,
          floorNumber: blankToNull(body.floorNumber) ?? null,
          landmark: blankToNull(body.landmark) ?? null,
          addressType: body.addressType || 'home',
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          isDefault: makeDefault,
        },
      });
    });

    return serializeAddress(created);
  }

  async updateAddress(userId, addressId, body) {
    await getUserOrThrow(userId);
    const address = await prisma.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw ApiError.notFound('Address not found', { code: 'ADDRESS_NOT_FOUND' });

    const makeDefault = body.isDefault === true;

    const updated = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.userAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.userAddress.update({
        where: { id: addressId },
        data: {
          ...(body.houseFlatNumber !== undefined ? { houseFlatNumber: blankToNull(body.houseFlatNumber) } : {}),
          ...(body.pincode !== undefined ? { pincode: blankToNull(body.pincode) } : {}),
          ...(body.apartmentBuilding !== undefined ? { apartmentBuilding: blankToNull(body.apartmentBuilding) } : {}),
          ...(body.contactNumber !== undefined ? { contactNumber: blankToNull(body.contactNumber) } : {}),
          ...(body.floorNumber !== undefined ? { floorNumber: blankToNull(body.floorNumber) } : {}),
          ...(body.landmark !== undefined ? { landmark: blankToNull(body.landmark) } : {}),
          ...(body.addressType !== undefined ? { addressType: body.addressType } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
          ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
          ...(makeDefault ? { isDefault: true } : {}),
          ...(body.isDefault === false ? { isDefault: false } : {}),
        },
      });
    });

    return serializeAddress(updated);
  }

  async deleteAddress(userId, addressId) {
    await getUserOrThrow(userId);
    const address = await prisma.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw ApiError.notFound('Address not found', { code: 'ADDRESS_NOT_FOUND' });

    await prisma.userAddress.delete({ where: { id: addressId } });

    if (address.isDefault) {
      const next = await prisma.userAddress.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await prisma.userAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  }

  async deleteAccount(userId) {
    await getUserOrThrow(userId);

    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });
    await tokenService.revokeAllForSubject({ subjectType: 'user', subjectId: userId });

    await activityLogService.record({
      category: 'login',
      actorType: 'user',
      actorId: userId,
      action: 'account_deleted',
    });
  }

  async listCoupons(userId) {
    return couponService.listPublic(userId);
  }

  getSupport() {
    return {
      email: config.support.email,
      phone: config.support.phone,
      whatsapp: config.support.whatsapp,
    };
  }
}

export default new UserService();
