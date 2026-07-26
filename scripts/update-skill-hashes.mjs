#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  manifestPath,
  readManifest,
  repoRoot,
  treeDigest,
} from './skill-lib.mjs';

const manifest = readManifest();
for (const entry of manifest.skills) {
  entry.content_sha256 = treeDigest(path.join(repoRoot, entry.path));
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`updated ${manifest.skills.length} skill hashes`);
