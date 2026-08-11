// ./Web_Toolkit/registrar/tests/mx-gate.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apexHasMx, evaluateMxGate } from '../mx-gate.mjs';

describe('apexHasMx', () => {
  it('matches apex MX only', () => {
    assert.equal(
      apexHasMx(
        [
          { type: 'MX', name: 'example.com', content: 'mail.example.com' },
          { type: 'A', name: 'example.com', content: '1.2.3.4' }
        ],
        'example.com'
      ),
      true
    );
    assert.equal(
      apexHasMx([{ type: 'MX', name: 'mail.example.com', content: 'mx.example.com' }], 'example.com'),
      false
    );
  });
});

describe('evaluateMxGate', () => {
  it('blocks without MX unless allow-missing-email', () => {
    assert.equal(evaluateMxGate({ hasMx: false }).ok, false);
    assert.equal(evaluateMxGate({ hasMx: false, allowMissingEmail: true }).ok, true);
    assert.equal(evaluateMxGate({ hasMx: true }).ok, true);
  });
});
