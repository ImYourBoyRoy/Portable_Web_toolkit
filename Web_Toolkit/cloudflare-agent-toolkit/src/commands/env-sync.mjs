// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/env-sync.mjs
/**
 * Legacy compatibility shim for the retired env-sync workflow.
 */

export async function runEnvSync() {
  console.log('No env sync is required. Portable tools now read the target project root .env directly.');
  console.log('If a legacy Web_Toolkit/.env exists, keep only machine-level defaults there or remove it entirely.');
  return 0;
}

