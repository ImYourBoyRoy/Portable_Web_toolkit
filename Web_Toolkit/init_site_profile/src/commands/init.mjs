// ./Web_Toolkit/init_site_profile/src/commands/init.mjs
/**
 * Requirements and profile-creation flows for portable site profiles.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildProfile,
  requirementsPayload,
  requiredQuestions,
  validateCreateFlags
} from '../lib/template.mjs';

export async function runRequirements(flags = {}) {
  const payload = requirementsPayload();
  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log('\nPortable site profile — agent intake');
  console.log(`Default output: ${payload.defaultOutput}`);
  console.log(`Profile projectRoot value: "${payload.projectRootInProfile}" when written into the client project`);
  console.log(`Note: ${payload.note}`);

  console.log('\nRequired create flags:');
  for (const entry of payload.requiredCreateFlags) {
    console.log(`- ${entry.flag}  (${entry.field}) — ${entry.why}`);
  }

  console.log('\nOptional interview fields (propose defaults; ask only when unknown):');
  for (const entry of payload.optionalInterviewFields) {
    console.log(`- ${entry.flag}  (${entry.field}) — ${entry.why}`);
  }

  console.log('\nAgent protocol:');
  for (const step of payload.agentProtocol) {
    console.log(`- ${step}`);
  }

  console.log('\nLegacy checklist:');
  for (const question of requiredQuestions()) {
    console.log(`- ${question}`);
  }
  return 0;
}

export async function runCreate(flags = {}) {
  const errors = validateCreateFlags(flags);
  if (errors.length > 0) {
    console.log('\nCannot create site profile');
    for (const entry of errors) {
      console.log(`- ${entry}`);
    }
    console.log('\nRun `init-site-profile requirements` (or `requirements --json`) for the agent checklist.');
    return 2;
  }

  const { outputPath, profile } = buildProfile(flags);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

  console.log('\nPortable site profile created');
  console.log(`- siteId: ${profile.siteId}`);
  console.log(`- deployTarget: ${profile.deployTarget}`);
  console.log(`- projectRoot: ${profile.projectRoot}`);
  console.log(`- output: ${outputPath}`);
  console.log(`- next: pass --site-profile "${outputPath}" to site-readiness / cf-agent`);
  return 0;
}
