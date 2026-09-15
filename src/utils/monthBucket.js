/**
 * Returns the YYYY-MM bucket string used on activity_logs for
 * month-wise querying/archival.
 */
export default function monthBucket(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
