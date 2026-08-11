// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/dns-match.mjs
/**
 * DNS expected-record matching helpers (name + type).
 */

/**
 * @param {Array<{ name?: string, type?: string }>} records
 * @param {{ name?: string, type?: string }} expected
 */
export function findDnsRecordByNameAndType(records, expected) {
  const expectedName = String(expected?.name || '').toLowerCase();
  const expectedType = String(expected?.type || 'CNAME').toUpperCase();
  return (records || []).find(
    (record) =>
      String(record.name || '').toLowerCase() === expectedName &&
      String(record.type || '').toUpperCase() === expectedType
  );
}
