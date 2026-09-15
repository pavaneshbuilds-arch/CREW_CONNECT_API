/**
 * Returns the YYYY-MM bucket string used across MongoDB collections for
 * month-wise querying/archival.
 */
export default function monthBucket(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
