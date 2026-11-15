// ./src/lib/site-config.ts
export type PublicApi = {
  path: string;
  label: string;
  description?: string;
};

export type PublicDiscoveryLink = {
  label: string;
  path: string;
  description?: string;
};

/**
 * Site identity for discovery, humans.txt, security.txt, and JSON-LD.
 * Copy from Web_Toolkit/templates/discovery/lib/site-config.ts and customize.
 */

export const siteConfig = {
  /** Display name — used in llms.txt, Schema.org, humans.txt */
  name: 'Site Name',
  /** One-line summary for discovery files and default meta */
  description: 'Brief description of this site.',
  /** RFC 9116 security contact (mailto:, tel:, or https:) */
  contactEmail: '',
  /** Optional RFC 9116 Policy URI. Do not place prose in security.txt Policy. */
  securityPolicyUrl: '',
  /** Optional credits in humans.txt (tools, partners, etc.) */
  credits: [] as string[],
  /** Optional public REST/MCP discovery links; never put user-scoped routes here. */
  publicDiscovery: [] as PublicDiscoveryLink[],
  /** Schema.org primary entity: Organization | Person | LocalBusiness */
  schemaType: 'Organization' as 'Organization' | 'Person' | 'LocalBusiness',
  /** Optional full or legal name, emitted as schema.org alternateName when it differs from `name`. */
  legalName: '',
  /** Public profile URLs (GitHub, LinkedIn, ...) emitted as schema.org sameAs. */
  sameAs: [] as string[],
  /**
   * AI crawler policy declared in robots.txt (Content-Signal) and ai.txt. Decide deliberately:
   * search = appear in search results, aiInput = be retrieved and quoted in AI answers, aiTrain = be used for model training.
   */
  aiPolicy: { search: true, aiInput: true, aiTrain: true },
  /** Public, unauthenticated JSON APIs to list in /.well-known/api-catalog (RFC 9727). Never user-scoped routes. */
  apis: [] as PublicApi[],
  /** Paths crawlers should skip (form handlers, redirect routes). Repeated in every robots.txt group. */
  crawlerDisallow: [] as string[],
  /** Optional absolute-path OpenAPI description (for example '/api/openapi.json') linked from the catalog and Link headers. */
  openapiPath: '',
};
