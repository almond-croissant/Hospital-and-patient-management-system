import test from 'node:test';
import assert from 'node:assert/strict';
import { EMBEDDING_DIMENSIONS, embedConsultation, normalizeConsultationText, toVectorLiteral } from '../lib/embedding.js';

test('normalized equivalent consultation text produces a deterministic vector', () => {
  const first = embedConsultation('  Chest   PAIN and cough ');
  const second = embedConsultation('chest pain AND COUGH');
  assert.deepEqual(first, second);
  assert.equal(first.length, EMBEDDING_DIMENSIONS);
});

test('non-empty vectors are finite and unit normalized', () => {
  const vector = embedConsultation({ symptoms: 'fever cough', diagnosis: 'viral infection' });
  assert.equal(vector.length, 256);
  assert.ok(vector.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-12);
  assert.match(toVectorLiteral(vector), /^\[[^\]]+\]$/);
});

test('empty input is safe and invalid vectors are rejected', () => {
  assert.deepEqual(embedConsultation('  '), Array(256).fill(0));
  assert.equal(normalizeConsultationText('Ａ Fever'), 'a fever');
  assert.throws(() => toVectorLiteral([1, 2]), TypeError);
});
