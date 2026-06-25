// ./Web_Toolkit/headers_deploy/src/commands/stack.mjs
/**
 * Prints the recommended Cloudflare enhancement stack for Astro sites.
 */

import { CLOUDFLARE_ENHANCEMENT_STACK } from '../lib/zenith-baseline.mjs';

export async function runStack() {
  console.log('\nCloudflare enhancement stack (recommended order)\n');
  const stack = CLOUDFLARE_ENHANCEMENT_STACK();
  stack.forEach((item, index) => {
    console.log(`${index + 1}. ${item.phase}`);
    console.log(`   ${item.command}`);
    console.log(`   ${item.note}\n`);
  });
  return 0;
}
