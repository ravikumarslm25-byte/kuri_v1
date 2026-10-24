import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { Session } from '../models/index.js';

const IMAGE_FIELDS = ['facePhotoPath', 'palmPhotoPath', 'palmEnhancedPath', 'cardImagePath'];

export async function deleteSessionFiles(s) {
  await Promise.all(
    IMAGE_FIELDS.filter((f) => s[f]).map((f) => fs.rm(path.join(config.uploadDir, s[f]), { force: true }).catch(() => undefined)),
  );
}

/**
 * Erase guest photos and contact details from readings older than `days`.
 * The reading itself (time, machine, event, fortune, outcome) stays for reports.
 */
export async function purgeExpired(days = config.retentionDays, now = new Date()) {
  if (!days || days <= 0) return { purged: 0 };
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const old = await Session.find({
    createdAt: { $lt: cutoff },
    $or: [...IMAGE_FIELDS.map((f) => ({ [f]: { $gt: '' } })), { 'delivery.whatsapp': { $gt: '' } }, { 'delivery.email': { $gt: '' } }],
  }).lean();
  for (const s of old) {
    await deleteSessionFiles(s);
    await Session.updateOne(
      { _id: s._id },
      { $set: { facePhotoPath: '', palmPhotoPath: '', palmEnhancedPath: '', cardImagePath: '', 'delivery.whatsapp': '', 'delivery.email': '' } },
    );
  }
  return { purged: old.length };
}

/** Runs the purge once at boot and then every 6 hours. */
export function scheduleRetention() {
  const run = () =>
    purgeExpired()
      .then((r) => r.purged && console.log(`[retention] erased photos/contacts from ${r.purged} readings`))
      .catch((e) => console.error('[retention] failed', e));
  setTimeout(run, 10_000).unref();
  setInterval(run, 6 * 3600_000).unref();
}
