import { embedConsultation, toVectorLiteral } from './embedding.js';

export async function saveConsultationEmbedding(client, consultationId, text) {
  const vector = embedConsultation(text);
  if (vector.every((value) => value === 0)) return false;
  await client.query(
    `INSERT INTO CONSULTATION_EMBEDDING (consultation_id, embedding)
     VALUES ($1, $2::vector)
     ON CONFLICT (consultation_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
    [consultationId, toVectorLiteral(vector)],
  );
  return true;
}

export async function findSimilarConsultations(client, { text, doctorId, excludeId = null, limit = 5 }) {
  const vector = embedConsultation(text);
  if (vector.every((value) => value === 0)) return [];
  const literal = toVectorLiteral(vector);
  const { rows } = await client.query(
    `SELECT c.consultation_id, c.symptoms, c.diagnosis,
            (e.embedding <=> $1::vector) AS distance,
            1 - (e.embedding <=> $1::vector) AS similarity
     FROM CONSULTATION_EMBEDDING AS e
     JOIN CONSULTATION AS c ON c.consultation_id = e.consultation_id
     JOIN APPOINTMENT AS a ON a.appointment_id = c.appointment_id
     WHERE a.doctor_id = $2
       AND ($3::uuid IS NULL OR c.consultation_id <> $3::uuid)
     ORDER BY e.embedding <=> $1::vector
     LIMIT $4`,
    [literal, doctorId, excludeId, limit],
  );
  return rows;
}
