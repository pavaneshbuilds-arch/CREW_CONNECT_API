import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';
import { encrypt, decrypt, maskTail } from '../utils/crypto.js';
import { activityLogService } from './index.js';

// --- small time/date helpers for @db.Time and @db.Date columns ---------------

function timeStringToDate(hhmm) {
  if (!hhmm) return null;
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

function dateToTimeString(date) {
  if (!date) return null;
  return date.toISOString().slice(11, 16); // HH:mm
}

function dateToIsoDate(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function getCrewOrThrow(crewId) {
  const crew = await prisma.crewMember.findUnique({ where: { id: crewId } });
  if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
  return crew;
}

/**
 * Onboarding step writes are only allowed before an admin approves the profile.
 * Once approved, edits must go through the "Request Changes" flow so they can be
 * re-reviewed (matches the Edit Profile screen).
 */
function ensureEditableDuringOnboarding(crew) {
  if (crew.verificationStatus === 'approved') {
    throw ApiError.conflict('Profile is approved; submit changes via an edit request instead', {
      code: 'PROFILE_LOCKED',
    });
  }
}

function serializeProfile(crew) {
  const doc = crew.identityDocuments?.[0];
  const bank = crew.bankDetails?.[0];
  return {
    id: crew.id,
    phoneNumber: crew.phoneNumber,
    email: crew.email,
    fullName: crew.fullName,
    profilePhotoUrl: crew.profilePhotoUrl,
    dateOfBirth: dateToIsoDate(crew.dateOfBirth),
    gender: crew.gender,
    city: crew.city,
    currentAddress: crew.currentAddress,
    primaryRole: crew.primaryRole,
    yearsOfExperience: crew.yearsOfExperience,
    verificationStatus: crew.verificationStatus,
    rejectionReason: crew.rejectionReason,
    ratingAvg: crew.ratingAvg,
    isActive: crew.isActive,
    isOnline: crew.isOnline,
    submittedAt: crew.submittedAt,
    languages: (crew.languages || []).map((l) => l.language),
    skills: (crew.skills || []).map((s) => s.skill),
    // Sensitive fields are never returned in the clear — only masked hints.
    identityDocuments: doc
      ? {
          hasAadhaar: Boolean(doc.aadhaarNumber),
          aadhaarFrontUrl: doc.aadhaarFrontUrl,
          aadhaarBackUrl: doc.aadhaarBackUrl,
          hasPan: Boolean(doc.panNumber),
          panCardUrl: doc.panCardUrl,
          verifiedAt: doc.verifiedAt,
        }
      : null,
    bankDetails: bank
      ? {
          accountHolderName: bank.accountHolderName,
          accountNumberMasked: bank.accountNumber ? maskTail(decrypt(bank.accountNumber), 4) : null,
          ifscCode: bank.ifscCode,
          upiId: bank.upiId,
        }
      : null,
    availability: (crew.weeklyAvailability || []).map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isAvailable: d.isAvailable,
      shiftStart: dateToTimeString(d.shiftStart),
      shiftEnd: dateToTimeString(d.shiftEnd),
    })),
    timeOff: (crew.timeOff || []).map((t) => ({
      id: t.id,
      startDate: dateToIsoDate(t.startDate),
      endDate: dateToIsoDate(t.endDate),
      reason: t.reason,
    })),
  };
}

const REQUIRED_FOR_SUBMISSION = [
  ['fullName', (c) => Boolean(c.fullName)],
  ['dateOfBirth', (c) => Boolean(c.dateOfBirth)],
  ['gender', (c) => Boolean(c.gender)],
  ['city', (c) => Boolean(c.city)],
  ['primaryRole', (c) => Boolean(c.primaryRole)],
  ['identityDocuments', (c) => Boolean(c.identityDocuments?.[0]?.aadhaarNumber)],
  ['bankDetails', (c) => Boolean(c.bankDetails?.[0]?.accountNumber)],
];

class CrewService {
  // --- profile read ----------------------------------------------------------

  async getProfile(crewId) {
    const crew = await prisma.crewMember.findUnique({
      where: { id: crewId },
      include: {
        languages: true,
        skills: true,
        identityDocuments: true,
        bankDetails: true,
        weeklyAvailability: { orderBy: { dayOfWeek: 'asc' } },
        timeOff: { orderBy: { startDate: 'asc' } },
      },
    });
    if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
    return serializeProfile(crew);
  }

  // --- Step 1: personal info -------------------------------------------------

  async updatePersonal(crewId, data) {
    const crew = await getCrewOrThrow(crewId);
    ensureEditableDuringOnboarding(crew);

    await prisma.crewMember.update({
      where: { id: crewId },
      data: {
        fullName: data.fullName,
        email: data.email || undefined,
        profilePhotoUrl: data.profilePhotoUrl,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        city: data.city,
        currentAddress: data.currentAddress,
      },
    });
    return this.getProfile(crewId);
  }

  // --- Step 2: work profile (role, experience, languages, skills) ------------

  async updateWorkProfile(crewId, data) {
    const crew = await getCrewOrThrow(crewId);
    ensureEditableDuringOnboarding(crew);

    await prisma.$transaction(async (tx) => {
      await tx.crewMember.update({
        where: { id: crewId },
        data: {
          primaryRole: data.primaryRole,
          yearsOfExperience: data.yearsOfExperience,
        },
      });

      if (data.languages) {
        await tx.crewLanguage.deleteMany({ where: { crewId } });
        if (data.languages.length) {
          await tx.crewLanguage.createMany({
            data: data.languages.map((language) => ({ crewId, language })),
          });
        }
      }

      if (data.skills) {
        await tx.crewSkill.deleteMany({ where: { crewId } });
        if (data.skills.length) {
          await tx.crewSkill.createMany({ data: data.skills.map((skill) => ({ crewId, skill })) });
        }
      }
    });

    return this.getProfile(crewId);
  }

  // --- Step 3: identity documents (encrypted at rest) ------------------------

  async upsertIdentityDocuments(crewId, data) {
    const crew = await getCrewOrThrow(crewId);
    ensureEditableDuringOnboarding(crew);

    const payload = {
      aadhaarNumber: data.aadhaarNumber ? encrypt(data.aadhaarNumber) : undefined,
      aadhaarFrontUrl: data.aadhaarFrontUrl,
      aadhaarBackUrl: data.aadhaarBackUrl,
      panNumber: data.panNumber ? encrypt(data.panNumber) : undefined,
      panCardUrl: data.panCardUrl,
    };

    const existing = await prisma.crewIdentityDocument.findFirst({ where: { crewId } });
    if (existing) {
      await prisma.crewIdentityDocument.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.crewIdentityDocument.create({ data: { crewId, ...payload } });
    }
    return this.getProfile(crewId);
  }

  // --- Bank details (account number encrypted at rest) -----------------------

  async upsertBankDetails(crewId, data) {
    const crew = await getCrewOrThrow(crewId);
    ensureEditableDuringOnboarding(crew);

    const payload = {
      accountHolderName: data.accountHolderName,
      accountNumber: encrypt(data.accountNumber),
      ifscCode: data.ifscCode,
      upiId: data.upiId || undefined,
    };

    const existing = await prisma.crewBankDetail.findFirst({ where: { crewId } });
    if (existing) {
      await prisma.crewBankDetail.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.crewBankDetail.create({ data: { crewId, ...payload } });
    }
    return this.getProfile(crewId);
  }

  // --- Availability ----------------------------------------------------------

  async getAvailability(crewId) {
    await getCrewOrThrow(crewId);
    const days = await prisma.crewWeeklyAvailability.findMany({
      where: { crewId },
      orderBy: { dayOfWeek: 'asc' },
    });
    return days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isAvailable: d.isAvailable,
      shiftStart: dateToTimeString(d.shiftStart),
      shiftEnd: dateToTimeString(d.shiftEnd),
    }));
  }

  async replaceAvailability(crewId, days) {
    await getCrewOrThrow(crewId);
    await prisma.$transaction(async (tx) => {
      await tx.crewWeeklyAvailability.deleteMany({ where: { crewId } });
      if (days.length) {
        await tx.crewWeeklyAvailability.createMany({
          data: days.map((d) => ({
            crewId,
            dayOfWeek: d.dayOfWeek,
            isAvailable: d.isAvailable ?? true,
            shiftStart: timeStringToDate(d.shiftStart),
            shiftEnd: timeStringToDate(d.shiftEnd),
          })),
        });
      }
    });
    return this.getAvailability(crewId);
  }

  async listTimeOff(crewId) {
    await getCrewOrThrow(crewId);
    const rows = await prisma.crewTimeOff.findMany({ where: { crewId }, orderBy: { startDate: 'asc' } });
    return rows.map((t) => ({
      id: t.id,
      startDate: dateToIsoDate(t.startDate),
      endDate: dateToIsoDate(t.endDate),
      reason: t.reason,
    }));
  }

  async addTimeOff(crewId, data) {
    await getCrewOrThrow(crewId);
    const row = await prisma.crewTimeOff.create({
      data: {
        crewId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        reason: data.reason || undefined,
      },
    });
    return { id: row.id, startDate: dateToIsoDate(row.startDate), endDate: dateToIsoDate(row.endDate), reason: row.reason };
  }

  async deleteTimeOff(crewId, id) {
    const row = await prisma.crewTimeOff.findUnique({ where: { id } });
    if (!row || row.crewId !== crewId) throw ApiError.notFound('Time-off entry not found', { code: 'TIMEOFF_NOT_FOUND' });
    await prisma.crewTimeOff.delete({ where: { id } });
  }

  // --- Online toggle ---------------------------------------------------------

  async setOnline(crewId, { isOnline, latitude, longitude }) {
    await getCrewOrThrow(crewId);
    const crew = await prisma.crewMember.update({
      where: { id: crewId },
      data: {
        isOnline,
        currentLatitude: latitude,
        currentLongitude: longitude,
      },
    });
    return { isOnline: crew.isOnline };
  }

  // --- Submit for verification -----------------------------------------------

  async submitForVerification(crewId) {
    const crew = await prisma.crewMember.findUnique({
      where: { id: crewId },
      include: { identityDocuments: true, bankDetails: true },
    });
    if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });

    if (crew.verificationStatus === 'approved') {
      throw ApiError.conflict('Profile is already approved', { code: 'ALREADY_APPROVED' });
    }

    const missing = REQUIRED_FOR_SUBMISSION.filter(([, ok]) => !ok(crew)).map(([field]) => field);
    if (missing.length) {
      throw ApiError.badRequest('Profile is incomplete', { code: 'PROFILE_INCOMPLETE', details: { missing } });
    }

    // A rejected profile that is resubmitted goes back to pending for re-review.
    const updated = await prisma.crewMember.update({
      where: { id: crewId },
      data: { verificationStatus: 'pending', rejectionReason: null, submittedAt: new Date() },
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'crew',
      actorId: crewId,
      action: 'crew_submitted_for_verification',
      referenceEntityType: 'crew_member',
      referenceEntityId: crewId,
    });

    return { verificationStatus: updated.verificationStatus, submitted: true };
  }

  // --- Post-approval edit requests -------------------------------------------

  async createEditRequest(crewId, changedFields) {
    const crew = await getCrewOrThrow(crewId);
    if (crew.verificationStatus !== 'approved') {
      throw ApiError.conflict('Edit requests apply only to approved profiles; edit directly during onboarding', {
        code: 'NOT_APPROVED',
      });
    }
    const request = await prisma.crewProfileEditRequest.create({
      data: { crewId, changedFields, status: 'pending' },
    });
    return { id: request.id, status: request.status, changedFields: request.changedFields, createdAt: request.createdAt };
  }

  async listEditRequests(crewId) {
    await getCrewOrThrow(crewId);
    const rows = await prisma.crewProfileEditRequest.findMany({
      where: { crewId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      changedFields: r.changedFields,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    }));
  }
}

export default new CrewService();
