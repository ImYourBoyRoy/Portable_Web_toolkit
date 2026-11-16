// ./Web_Toolkit/templates/contact/lib/load-config.ts
/**
 * Loads the OPTIONAL src/data/contact.json (a missing file is fine) and normalises it with resolveContactConfig.
 * Used by both ContactForm.astro and the API route, so inquiry types and limits can never drift apart.
 * Copy to: src/lib/contact/load-config.ts. The glob path below assumes that destination.
 * Public values only: recipient and sender addresses belong in Worker secrets, never in this file.
 */
import { resolveContactConfig, type ContactConfig } from './contact-lib';

const files = import.meta.glob('../../data/contact.json', { eager: true, import: 'default' });

let cached: ContactConfig | undefined;

export function getContactConfig(): ContactConfig {
  cached ??= resolveContactConfig(Object.values(files)[0] ?? {});
  return cached;
}
