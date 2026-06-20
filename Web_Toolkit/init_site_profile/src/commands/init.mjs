// ./Web_Toolkit/init_site_profile/src/commands/init.mjs
/**
 * Requirements and profile-creation flows for portable site profiles.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildProfile, missingFields, requiredQuestions } from '../lib/template.mjs';

export async function runRequirements() {
  console.log('\nPortable site profile requirements');
  for (const question of requiredQuestions()) {
    console.log(`- ${question}`);
  }
  console.log('\nAI guidance: if any required field is missing, ask the user before creating the profile.');
  return 0;
}

export async function runCreate(flags = {}) {
  const missing = missingFields(flags);
  if (missing.length > 0) {
    console.log('\nMissing required profile fields');
    for (const entry of missing) {
      console.log(`- ${entry}`);
    }
    console.log('\nRun `init-site-profile requirements` to see what the AI should ask for.');
    return 2;
  }

  const { outputPath, profile } = buildProfile(flags);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

  console.log('\nPortable site profile created');
  console.log(`- siteId: ${profile.siteId}`);
  console.log(`- deployTarget: ${profile.deployTarget}`);
  console.log(`- output: ${outputPath}`);
  return 0;
}

