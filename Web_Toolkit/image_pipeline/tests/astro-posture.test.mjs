// ./Web_Toolkit/image_pipeline/tests/astro-posture.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { analyzeAstroImagePosture } from '../src/lib/astro-posture.mjs';

describe('analyzeAstroImagePosture', () => {
  it('passes when Workers config + OptimizedPicture exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-posture-'));
    fs.writeFileSync(
      path.join(dir, 'astro.config.mjs'),
      `import cloudflare from '@astrojs/cloudflare';
export default { output: 'server', adapter: cloudflare({ imageService: 'compile' }), image: { domains: [] } };`
    );
    fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'components', 'OptimizedPicture.astro'),
      `---\nimport { Picture } from 'astro:assets';\n---`
    );
    fs.writeFileSync(
      path.join(dir, 'src', 'components', 'Hero.astro'),
      `---\nimport { Picture } from 'astro:assets';\n---`
    );
    const result = analyzeAstroImagePosture(dir, { deployTarget: 'workers' });
    assert.equal(result.status, 'pass');
    assert.equal(result.hasImageServiceCompile, true);
    assert.equal(result.hasOptimizedPicture, true);
  });

  it('fails workers without imageService', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-posture-bad-'));
    fs.writeFileSync(
      path.join(dir, 'astro.config.mjs'),
      `export default { output: 'server', adapter: {} };`
    );
    const result = analyzeAstroImagePosture(dir, { deployTarget: 'workers' });
    assert.equal(result.status, 'fail');
    assert.ok(result.issues.some((i) => /imageService/i.test(i)));
  });
});
