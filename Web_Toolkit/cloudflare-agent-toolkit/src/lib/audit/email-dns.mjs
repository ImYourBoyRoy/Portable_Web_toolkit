// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/audit/email-dns.mjs
/**
 * Email-related DNS analysis helpers.
 */

function textRecordStrings(records, name) {
  return records
    .filter((entry) => entry.type === 'TXT' && String(entry.name || '').toLowerCase() === name.toLowerCase())
    .map((entry) => String(entry.content || ''));
}

function mxStrings(records, zoneName) {
  return records
    .filter((entry) => entry.type === 'MX' && String(entry.name || '').toLowerCase() === zoneName.toLowerCase())
    .map((entry) => String(entry.content || '').toLowerCase());
}

function dkimRecords(records, zoneName) {
  return records.filter((entry) => {
    const name = String(entry.name || '').toLowerCase();
    return name.endsWith(`._domainkey.${zoneName.toLowerCase()}`) || name.includes('._domainkey.');
  });
}

function detectProvider(mxRecords) {
  const joined = mxRecords.join(' ');
  if (joined.includes('google.com')) return 'Google Workspace';
  if (joined.includes('outlook.com') || joined.includes('protection.outlook.com')) return 'Microsoft 365';
  if (joined.includes('zoho.')) return 'Zoho Mail';
  if (joined.includes('porkbun.com')) return 'Porkbun forwarding';
  if (joined.includes('mx.cloudflare.net')) return 'Cloudflare Email Routing';
  return mxRecords.length > 0 ? 'Unknown mail provider' : 'No MX records detected';
}

export function auditEmailDns(records, zoneName) {
  const mx = mxStrings(records, zoneName);
  const spf = textRecordStrings(records, zoneName).filter((entry) => entry.toLowerCase().includes('v=spf1'));
  const dmarc = textRecordStrings(records, `_dmarc.${zoneName}`).filter((entry) => entry.toLowerCase().includes('v=dmarc1'));
  const dkim = dkimRecords(records, zoneName).map((entry) => ({ name: entry.name, type: entry.type, content: entry.content }));
  const warnings = [];
  if (mx.length > 0 && spf.length === 0) warnings.push('MX records exist but no SPF record was found at the apex.');
  if (mx.length > 0 && dmarc.length === 0) warnings.push('MX records exist but no DMARC record was found at _dmarc.');
  if (mx.length > 0 && dkim.length === 0) warnings.push('MX records exist but no DKIM-like records were detected.');

  return {
    mailProviderGuess: detectProvider(mx),
    hasMx: mx.length > 0,
    hasSpf: spf.length > 0,
    hasDmarc: dmarc.length > 0,
    dkimCandidateCount: dkim.length,
    mx,
    spf,
    dmarc,
    dkim,
    warnings
  };
}

