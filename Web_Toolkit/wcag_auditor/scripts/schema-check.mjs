import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CONFIG_SCHEMA_VERSION,
  EVIDENCE_SCHEMA_VERSION,
  NATIVE_EVIDENCE_SCHEMA_VERSION,
  OUTCOMES,
  RUN_SCHEMA_VERSION,
  SEVERITIES
} from '../src/core/constants.mjs';
import { validateConfig } from '../src/core/config.mjs';
import { validateEvidenceDocument } from '../src/adapters/manual-evidence.mjs';
import { validateNativeEvidenceDocument } from '../src/adapters/native-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemas = {
  config: await json('src/schemas/config.schema.json'),
  evidence: await json('src/schemas/evidence.schema.json'),
  native: await json('src/schemas/native-evidence.schema.json'),
  run: await json('src/schemas/run.schema.json')
};

for (const [name, schema] of Object.entries(schemas)) {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', `${name} must use JSON Schema 2020-12`);
  assert.match(schema.$id, /^urn:roydawsoniv:wcag-auditor:schema:/, `${name} must have a stable WCAG Auditor schema ID`);
  assert.equal(typeof schema.title, 'string');
}

assert.equal(schemas.config.properties.schemaVersion.const, CONFIG_SCHEMA_VERSION);
assert.equal(schemas.evidence.properties.schemaVersion.const, EVIDENCE_SCHEMA_VERSION);
assert.equal(schemas.native.properties.schemaVersion.const, NATIVE_EVIDENCE_SCHEMA_VERSION);
assert.equal(schemas.run.properties.schemaVersion.const, RUN_SCHEMA_VERSION);

const evidenceFinding = schemas.evidence.properties.checks.items.properties;
const nativeFinding = schemas.native.properties.findings.items.properties;
const runFinding = schemas.run.properties.findings.items.properties;
for (const finding of [evidenceFinding, nativeFinding, runFinding]) {
  assert.deepEqual(finding.outcome.enum, [...OUTCOMES]);
  assert.deepEqual(finding.severity.enum, [...SEVERITIES]);
  assert.deepEqual(finding.standards.items.properties.mapping.enum, ['conformance', 'secondary', 'policy']);
}

for (const configFile of ['examples/basic/wcag-auditor.config.mjs', 'examples/tauri/wcag-auditor.config.mjs']) {
  const imported = await import(`${pathToFileURL(path.join(root, configFile)).href}?schema-check=1`);
  assert.deepEqual(validateConfig(imported.default), [], `${configFile} must satisfy runtime config validation`);
}

const manual = await json('examples/basic/manual-evidence.json');
assert.deepEqual(validateEvidenceDocument(manual), [], 'manual evidence example must satisfy runtime validation');
const native = await json('examples/bevy/native-evidence.example.json');
assert.deepEqual(validateNativeEvidenceDocument(native), [], 'native evidence example must satisfy runtime validation');

process.stdout.write('Schema check passed: schemas, runtime validators, and shipped examples are consistent.\n');

async function json(relative) {
  return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
}
