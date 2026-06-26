// ./src/lib/site-config.ts
/**
 * Site identity for discovery, humans.txt, security.txt, and JSON-LD.
 * Copy from Web_Toolkit/templates/discovery/lib/site-config.ts and customize.
 */

export const siteConfig = {
  /** Display name — used in llms.txt, Schema.org, humans.txt */
  name: 'Site Name',
  /** One-line summary for discovery files and default meta */
  description: 'Brief description of this site.',
  /** RFC 9116 security contact (mailto: or https:) */
  contactEmail: '',
  /** Optional credits in humans.txt (tools, partners, etc.) */
  credits: [] as string[],
  /** Schema.org primary entity: Organization | Person | LocalBusiness */
  schemaType: 'Organization' as 'Organization' | 'Person' | 'LocalBusiness',
};
