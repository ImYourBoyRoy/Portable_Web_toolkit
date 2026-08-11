// ./Web_Toolkit/registrar/mx-gate.mjs
/**
 * Email / MX gate helpers for registrar NS cutover.
 */

/**
 * @param {Array<{ type?: string, name?: string }>} records
 * @param {string} zoneName
 */
export function apexHasMx(records, zoneName) {
  const apex = String(zoneName || '').toLowerCase();
  return (records || []).some(
    (entry) =>
      String(entry.type || '').toUpperCase() === 'MX' &&
      String(entry.name || '').toLowerCase() === apex
  );
}

/**
 * Decide whether NS update may proceed.
 * @returns {{ ok: boolean, reason: string }}
 */
export function evaluateMxGate({ hasMx, allowMissingEmail = false } = {}) {
  if (hasMx) return { ok: true, reason: 'apex MX present' };
  if (allowMissingEmail) {
    return { ok: true, reason: 'proceeding with --allow-missing-email (mail may break)' };
  }
  return {
    ok: false,
    reason: 'no apex MX on Cloudflare zone; pass --allow-missing-email to override'
  };
}
