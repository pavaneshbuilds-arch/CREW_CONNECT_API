import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';

function serializeDevice(row) {
  return {
    id: row.id,
    mid: row.mid,
    pnid: row.pnid,
    platform: row.platform,
    deviceName: row.deviceName,
    osVersion: row.osVersion,
    appVersion: row.appVersion,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

class DeviceService {
  /**
   * Upserts the current (mid, pnid) for a user or crew install. Previous
   * tokens / owners are written to device_history before the row is updated.
   */
  async register({ subjectType, subjectId, mid, pnid, platform, deviceName, osVersion, appVersion }) {
    if (subjectType !== 'user' && subjectType !== 'crew') {
      throw ApiError.forbidden('Device registration is only for user and crew apps', { code: 'FORBIDDEN_TYPE' });
    }

    const extras = { platform, deviceName, osVersion, appVersion, lastSeenAt: new Date() };

    const byMid = await prisma.device.findUnique({ where: { mid } });
    const byPnid = await prisma.device.findUnique({ where: { pnid } });

    return prisma.$transaction(async (tx) => {
      // Same install, token rotated (FCM refresh).
      if (byMid && byMid.subjectType === subjectType && byMid.subjectId === subjectId) {
        if (byMid.pnid !== pnid) {
          await this.#archiveInTx(tx, byMid, 'token_rotated');
          if (byPnid && byPnid.id !== byMid.id) {
            await this.#archiveInTx(tx, byPnid, 'replaced');
            await tx.device.delete({ where: { id: byPnid.id } });
          }
          const updated = await tx.device.update({
            where: { id: byMid.id },
            data: { pnid, ...extras },
          });
          return serializeDevice(updated);
        }
        const touched = await tx.device.update({
          where: { id: byMid.id },
          data: extras,
        });
        return serializeDevice(touched);
      }

      // This install was previously on another account.
      if (byMid) {
        await this.#archiveInTx(tx, byMid, 'reassigned');
        if (byPnid && byPnid.id !== byMid.id) {
          await this.#archiveInTx(tx, byPnid, 'replaced');
          await tx.device.delete({ where: { id: byPnid.id } });
        }
        const updated = await tx.device.update({
          where: { id: byMid.id },
          data: { subjectType, subjectId, pnid, ...extras },
        });
        return serializeDevice(updated);
      }

      // This push token was on a different install row.
      if (byPnid) {
        await this.#archiveInTx(tx, byPnid, 'replaced');
        const updated = await tx.device.update({
          where: { id: byPnid.id },
          data: { subjectType, subjectId, mid, ...extras },
        });
        return serializeDevice(updated);
      }

      const created = await tx.device.create({
        data: { subjectType, subjectId, mid, pnid, ...extras },
      });
      return serializeDevice(created);
    });
  }

  async #archiveInTx(tx, device, reason) {
    await tx.deviceHistory.create({
      data: {
        subjectType: device.subjectType,
        subjectId: device.subjectId,
        mid: device.mid,
        pnid: device.pnid,
        platform: device.platform,
        deviceName: device.deviceName,
        osVersion: device.osVersion,
        appVersion: device.appVersion,
        attachedAt: device.createdAt,
        detachedAt: new Date(),
        reason,
      },
    });
  }
}

export default new DeviceService();
