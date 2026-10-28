import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSIONS = 256;

export function normalizeConsultationText(input) {
  const text = typeof input === 'string'
    ? input
    : [input?.symptoms, input?.diagnosis, input?.notes].filter(Boolean).join(' ');
  return String(text || '').normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
}

function addFeature(vector, feature, weight) {
  const digest = createHash('sha256').update(feature, 'utf8').digest();
  const bucket = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
  vector[bucket] += (digest[4] & 1 ? 1 : -1) * weight;
}

// Deterministic offline feature hashing. This is not a trained medical embedding.
export function embedConsultation(input) {
  const tokens = normalizeConsultationText(input).split(' ').filter(Boolean);
  const vector = Array(EMBEDDING_DIMENSIONS).fill(0);
  for (let i = 0; i < tokens.length; i += 1) {
    addFeature(vector, `word:${tokens[i]}`, 1);
    if (i > 0) addFeature(vector, `pair:${tokens[i - 1]}_${tokens[i]}`, 0.5);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  }
  return vector;
}

export function toVectorLiteral(vector) {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((v) => !Number.isFinite(v))) {
    throw new TypeError(`Expected ${EMBEDDING_DIMENSIONS} finite vector values.`);
  }
  return `[${vector.map((v) => Number(v.toPrecision(9))).join(',')}]`;
}
