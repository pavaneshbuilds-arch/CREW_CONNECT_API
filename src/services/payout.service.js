import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';
import { decrypt } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import { activityLogService, razorpayService } from './index.js';

const IMPS_LIMIT_RUPEES = 500000;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function decimal(value) {
  if (value == null) return null;
  return Number(value);
}

function toPaise(amount) {
  return Math.round(roundMoney(amount) * 100);
}

function payoutMode(amount) {
  return amount > IMPS_LIMIT_RUPEES ? 'NEFT' : 'IMPS';
}

function publicFailureReason(message) {
  if (!message) return null;
  return String(message).replace(/\d{6,}/g, '******').slice(0, 300);
}

function contactPhone(phone) {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D/g, '');
  return digits ? digits.slice(0, 15) : undefined;
}

function assignmentPayoutAmount(assignment) {
  if (assignment.earningsAmount == null) return 0;
  return roundMoney(Number(assignment.earningsAmount) + Number(assignment.performanceBonus || 0));
}

/**
 * Assignment-facing status. Razorpay rows use queued/processed; the admin and
 * crew payloads use processing/paid.
 */
function assignmentStatusFor(payoutStatus) {
  if (payoutStatus === 'processed') return 'paid';
  if (payoutStatus === 'queued' || payoutStatus === 'processing') return 'processing';
  return payoutStatus;
}

function mapGatewayStatus(status) {
  switch (status) {
    case 'queued':
    case 'pending':
      return { payoutStatus: 'queued', assignmentStatus: 'processing' };
    case 'processing':
      return { payoutStatus: 'processing', assignmentStatus: 'processing' };
    case 'processed':
      return { payoutStatus: 'processed', assignmentStatus: 'paid' };
    case 'reversed':
      return { payoutStatus: 'reversed', assignmentStatus: 'reversed' };
    case 'failed':
    case 'rejected':
    case 'cancelled':
      return { payoutStatus: 'failed', assignmentStatus: 'failed' };
    default:
      return null;
  }
}

function bankAccount(bank) {
  if (!bank) return null;
  let accountNumber = null;
  try {
    accountNumber = bank.accountNumber ? decrypt(bank.accountNumber) : null;
  } catch {
    accountNumber = null;
  }
  const ifscCode = bank.ifscCode?.trim().toUpperCase() || null;
  const accountHolderName = bank.accountHolderName?.trim() || null;
  if (!accountNumber || !ifscCode || !accountHolderName) return null;
  return { accountNumber, ifscCode, accountHolderName };
}

function resultRow({ assignment, amount, payoutStatus, payout, error, failureReason }) {
  return {
    assignmentId: assignment.id,
    crewId: assignment.crewId,
    crewName: assignment.crew?.fullName || null,
    amount,
    payoutStatus,
    payoutId: payout?.id ?? null,
    razorpayPayoutId: payout?.razorpayPayoutId ?? null,
    error: error || null,
    failureReason: failureReason || null,
  };
}

async function creditThenRedeem(tx, payout) {
  const amount = new Prisma.Decimal(payout.amount);
  let wallet = await tx.crewWallet.upsert({
    where: { crewId: payout.crewId },
    create: { crewId: payout.crewId },
    update: {},
  });
  await tx.$queryRaw`SELECT id FROM crew_wallets WHERE id = ${wallet.id} FOR UPDATE`;
  wallet = await tx.crewWallet.findUnique({ where: { id: wallet.id } });

  const existingCredit = await tx.walletTransaction.findFirst({
    where: { eventAssignmentId: payout.assignmentId, type: 'credit_earning' },
  });
  if (!existingCredit) {
    const balance = new Prisma.Decimal(wallet.balance).plus(amount);
    const pendingPayout = new Prisma.Decimal(wallet.pendingPayout).plus(amount);
    wallet = await tx.crewWallet.update({
      where: { id: wallet.id },
      data: { balance, pendingPayout },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        eventAssignmentId: payout.assignmentId,
        type: 'credit_earning',
        amount,
        balanceAfter: balance,
        description: `Earnings for assignment ${payout.assignmentId}`,
      },
    });
  }

  const balance = new Prisma.Decimal(wallet.balance).minus(amount);
  const pendingPayout = new Prisma.Decimal(wallet.pendingPayout).minus(amount);
  const redeemed = await tx.crewWallet.update({
    where: { id: wallet.id },
    data: { balance, pendingPayout },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: redeemed.id,
      eventAssignmentId: payout.assignmentId,
      type: 'debit_redemption',
      amount,
      balanceAfter: balance,
      description: `Payout ${payout.id}`,
    },
  });
}

async function restoreReversedPayout(tx, payout) {
  const wallet = await tx.crewWallet.findUnique({ where: { crewId: payout.crewId } });
  if (!wallet) return;
  await tx.$queryRaw`SELECT id FROM crew_wallets WHERE id = ${wallet.id} FOR UPDATE`;
  const current = await tx.crewWallet.findUnique({ where: { id: wallet.id } });
  const amount = new Prisma.Decimal(payout.amount);
  const balance = new Prisma.Decimal(current.balance).plus(amount);
  const pendingPayout = new Prisma.Decimal(current.pendingPayout).plus(amount);
  await tx.crewWallet.update({
    where: { id: wallet.id },
    data: { balance, pendingPayout },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      eventAssignmentId: payout.assignmentId,
      type: 'credit_bonus',
      amount,
      balanceAfter: balance,
      description: `Payout reversed ${payout.id}`,
    },
  });
}

class PayoutService {
  async applyGatewayStatus(payoutId, { razorpayPayoutId, gatewayStatus, failureReason, amountPaise }) {
    const mapped = mapGatewayStatus(gatewayStatus);
    if (!mapped) {
      if (!razorpayPayoutId) return prisma.crewPayout.findUnique({ where: { id: payoutId } });
      return prisma.crewPayout.update({
        where: { id: payoutId },
        data: { razorpayPayoutId },
      });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM crew_payouts WHERE id = ${payoutId} FOR UPDATE`;
      const current = await tx.crewPayout.findUnique({ where: { id: payoutId } });
      if (!current) return null;

      const next = mapped.payoutStatus;
      const same = current.status === next;
      const blocked = current.status === 'failed'
        || current.status === 'reversed'
        || (current.status === 'processed' && next !== 'reversed');

      if (blocked || (same && current.razorpayPayoutId)) {
        if (!current.razorpayPayoutId && razorpayPayoutId) {
          const updated = await tx.crewPayout.update({
            where: { id: payoutId },
            data: { razorpayPayoutId },
          });
          return { payout: updated, settled: false };
        }
        return { payout: current, settled: false };
      }

      if (next === 'processed' && amountPaise != null && amountPaise !== toPaise(current.amount)) {
        logger.error('Razorpay payout amount does not match the stored earnings', {
          payoutId,
          amountPaise,
          expectedPaise: toPaise(current.amount),
        });
        const updated = await tx.crewPayout.update({
          where: { id: payoutId },
          data: { razorpayPayoutId: razorpayPayoutId || current.razorpayPayoutId },
        });
        return { payout: updated, settled: false };
      }

      if (next === 'processed' && current.status !== 'processed') {
        await creditThenRedeem(tx, current);
      }
      if (next === 'reversed' && current.status === 'processed') {
        await restoreReversedPayout(tx, current);
      }

      const terminal = next === 'failed' || next === 'reversed';
      const updated = await tx.crewPayout.update({
        where: { id: payoutId },
        data: {
          razorpayPayoutId: razorpayPayoutId || current.razorpayPayoutId,
          status: next,
          failureReason: publicFailureReason(failureReason),
          processedAt: next === 'processed' ? current.processedAt || new Date() : current.processedAt,
          activeAssignmentId: terminal ? null : current.assignmentId,
        },
      });
      await tx.eventCrewAssignment.update({
        where: { id: current.assignmentId },
        data: { payoutStatus: mapped.assignmentStatus },
      });
      return {
        payout: updated,
        settled: next === 'processed' && current.status !== 'processed',
        bookingId: current.bookingId,
        assignmentId: current.assignmentId,
        amount: decimal(current.amount),
      };
    });

    if (outcome?.settled) {
      await activityLogService.record({
        category: 'crew_redemption',
        actorType: 'system',
        action: 'crew_payout_processed',
        referenceEntityType: 'booking',
        referenceEntityId: outcome.bookingId,
        metadata: {
          assignmentId: outcome.assignmentId,
          payoutId,
          amount: outcome.amount,
        },
      });
    }
    return outcome?.payout || null;
  }

  async handleWebhook(event) {
    const entity = event?.payload?.payout?.entity;
    const razorpayPayoutId = entity?.id;
    if (!razorpayPayoutId) return { received: true, ignored: true };

    const payout = await prisma.crewPayout.findUnique({ where: { razorpayPayoutId } });
    if (!payout) {
      logger.info('Razorpay payout webhook for an unknown payout', {
        event: event?.event,
        razorpayPayoutId,
      });
      return { received: true, ignored: true };
    }

    const mapped = mapGatewayStatus(entity.status);
    if (!mapped) return { received: true, ignored: true };

    await this.applyGatewayStatus(payout.id, {
      razorpayPayoutId,
      gatewayStatus: entity.status,
      failureReason: entity.failure_reason || entity.status_details?.description || null,
      amountPaise: entity.amount != null ? Number(entity.amount) : null,
    });
    return { received: true, payoutStatus: mapped.payoutStatus };
  }

  async checkout(bookingId, adminId) {
    razorpayService.payoutCredentials();

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        assignments: {
          where: { status: 'completed' },
          orderBy: { id: 'asc' },
          include: {
            crew: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
                bankDetails: { orderBy: { id: 'asc' }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!booking) throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });
    if (booking.status !== 'completed') {
      throw ApiError.conflict('Only a completed booking can be checked out', { code: 'BOOKING_NOT_COMPLETED' });
    }

    const payable = booking.assignments.filter((assignment) => assignmentPayoutAmount(assignment) > 0);
    if (!payable.length) {
      throw ApiError.conflict('This booking has no crew earnings to pay', { code: 'NO_CREW_EARNINGS' });
    }

    const results = [];
    for (const assignment of payable) {
      results.push(await this.#payoutAssignment(booking.id, assignment, adminId));
    }

    await prisma.adminAuditLog.create({
      data: {
        adminId,
        actionType: 'crew_payout',
        targetEntityType: 'booking',
        targetEntityId: bookingId,
        details: {
          results: results.map((row) => ({
            assignmentId: row.assignmentId,
            crewId: row.crewId,
            amount: row.amount,
            payoutStatus: row.payoutStatus,
            error: row.error,
            payoutId: row.payoutId,
          })),
        },
      },
    });
    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'crew_payout_checkout',
      referenceEntityType: 'booking',
      referenceEntityId: bookingId,
      metadata: { resultCount: results.length },
    });

    return { bookingId: booking.id, results };
  }

  async #payoutAssignment(bookingId, assignment, adminId) {
    const amount = assignmentPayoutAmount(assignment);
    const account = bankAccount(assignment.crew?.bankDetails?.[0]);
    if (!account) {
      return resultRow({
        assignment,
        amount,
        payoutStatus: assignment.payoutStatus,
        error: 'BANK_DETAILS_MISSING',
      });
    }

    const claim = await this.#claimOrResume(assignment, adminId, bookingId, amount);
    if (claim.kind === 'settled') {
      return resultRow({
        assignment,
        amount,
        payoutStatus: claim.payoutStatus,
        payout: claim.payout,
        error: 'PAYOUT_ALREADY_SETTLED',
      });
    }

    return this.#send(assignment, claim.payout, assignment.crew, account);
  }

  async #claimOrResume(assignment, adminId, bookingId, amount) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT payout_status AS "payoutStatus"
        FROM event_crew_assignments
        WHERE id = ${assignment.id}
        FOR UPDATE
      `;
      const payoutStatus = locked[0]?.payoutStatus;
      const active = await tx.crewPayout.findFirst({
        where: { activeAssignmentId: assignment.id },
      });

      if (payoutStatus === 'paid' || (payoutStatus === 'processing' && active?.razorpayPayoutId)) {
        return { kind: 'settled', payout: active, payoutStatus };
      }
      if (payoutStatus === 'processing' && active && !active.razorpayPayoutId) {
        return { kind: 'resume', payout: active };
      }
      if (active) {
        await tx.crewPayout.update({
          where: { id: active.id },
          data: { activeAssignmentId: null },
        });
      }

      const payout = await tx.crewPayout.create({
        data: {
          bookingId,
          assignmentId: assignment.id,
          crewId: assignment.crewId,
          amount: roundMoney(amount).toFixed(2),
          status: 'queued',
          mode: payoutMode(amount),
          idempotencyKey: crypto.randomUUID(),
          paidByAdminId: adminId,
          activeAssignmentId: assignment.id,
        },
      });
      await tx.eventCrewAssignment.update({
        where: { id: assignment.id },
        data: { payoutStatus: 'processing' },
      });
      return { kind: 'resume', payout };
    });
  }

  async #ensureFundAccount(crew, bank, account) {
    let contactId = bank.razorpayContactId;
    if (!contactId) {
      const contactPayload = {
        name: String(crew.fullName || account.accountHolderName).slice(0, 50),
        type: 'employee',
        reference_id: `crew${crew.id}`,
      };
      const phone = contactPhone(crew.phoneNumber);
      if (phone) contactPayload.contact = phone;
      if (crew.email) contactPayload.email = crew.email;
      const contact = await razorpayService.createContact(contactPayload);
      contactId = contact.id;
      await prisma.crewBankDetail.update({
        where: { id: bank.id },
        data: { razorpayContactId: contactId },
      });
    }

    if (bank.razorpayFundAccountId) return bank.razorpayFundAccountId;

    const fresh = await prisma.crewBankDetail.findUnique({ where: { id: bank.id } });
    if (fresh?.razorpayFundAccountId) return fresh.razorpayFundAccountId;

    const fund = await razorpayService.createFundAccount({
      contact_id: contactId,
      account_type: 'bank_account',
      bank_account: {
        name: account.accountHolderName.slice(0, 120),
        ifsc: account.ifscCode,
        account_number: account.accountNumber,
      },
    });
    await prisma.crewBankDetail.update({
      where: { id: bank.id },
      data: { razorpayFundAccountId: fund.id },
    });
    return fund.id;
  }

  async #send(assignment, payout, crew, account) {
    const bank = crew.bankDetails[0];
    try {
      const fundAccountId = await this.#ensureFundAccount(crew, bank, account);
      const { accountNumber } = razorpayService.payoutCredentials();
      const gateway = await razorpayService.createPayout({
        account_number: accountNumber,
        fund_account_id: fundAccountId,
        amount: toPaise(payout.amount),
        currency: 'INR',
        mode: payout.mode,
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: `a${assignment.id}p${payout.id}`,
        narration: 'Crew Connect payout',
      }, payout.idempotencyKey);
      const updated = await this.applyGatewayStatus(payout.id, {
        razorpayPayoutId: gateway.id,
        gatewayStatus: gateway.status,
        failureReason: gateway.failure_reason || null,
        amountPaise: gateway.amount != null ? Number(gateway.amount) : null,
      });
      return resultRow({
        assignment,
        amount: decimal(payout.amount),
        payoutStatus: assignmentStatusFor(updated?.status || gateway.status),
        payout: updated || { ...payout, razorpayPayoutId: gateway.id },
      });
    } catch (err) {
      const reason = publicFailureReason(err.message);
      if (err.definitive) {
        const updated = await this.applyGatewayStatus(payout.id, {
          gatewayStatus: 'failed',
          failureReason: reason,
        });
        return resultRow({
          assignment,
          amount: decimal(payout.amount),
          payoutStatus: 'failed',
          payout: updated,
          error: 'PAYOUT_GATEWAY_ERROR',
          failureReason: reason,
        });
      }
      logger.error('Crew payout left in processing after a gateway error', {
        payoutId: payout.id,
        assignmentId: assignment.id,
        message: reason,
      });
      return resultRow({
        assignment,
        amount: decimal(payout.amount),
        payoutStatus: 'processing',
        payout,
        error: 'PAYOUT_GATEWAY_ERROR',
        failureReason: reason,
      });
    }
  }
}

export default new PayoutService();
