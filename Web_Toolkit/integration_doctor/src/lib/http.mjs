// ./Web_Toolkit/integration_doctor/src/lib/http.mjs
/**
 * Simple fetch helpers for integration-doctor.
 */

import { fetchPublicText } from '../../../shared/lib/url-safety.mjs';

export async function fetchText(url) {
  try {
    const result = await fetchPublicText(url, { label: 'integration URL' });
    return {
      ok: result.ok,
      status: result.status,
      body: result.body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
