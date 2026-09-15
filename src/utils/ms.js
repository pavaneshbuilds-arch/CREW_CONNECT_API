const UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parses a short duration string ("15m", "30d", "12h") into milliseconds.
 * Accepts a plain number (already ms). Throws on malformed input so token TTL
 * misconfiguration surfaces immediately.
 */
export default function ms(value) {
  if (typeof value === 'number') return value;
  const match = /^(\d+)\s*(ms|s|m|h|d|w)$/.exec(String(value).trim());
  if (!match) throw new Error(`Invalid duration: "${value}"`);
  const [, amount, unit] = match;
  return Number(amount) * UNITS[unit];
}
