import { z } from 'zod';
import { getActor } from '../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../lib/api.js';
import { query, withTransaction } from '../../../lib/db.js';
import { saveConsultationEmbedding } from '../../../lib/vector.js';

const schema = z.object({
  appointment_id: z.string().uuid(),
  symptoms: z.string().trim().max(10000).optional(),
  diagnosis: z.string().trim().max(10000).optional(),
  notes: z.string().trim().max(20000).optional(),
}).strict();

export async function GET(request) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const scope = actor.role === 'patient' ? 'a.patient_id = $1'
      : actor.role === 'doctor' ? 'a.doctor_id = $1' : 'TRUE';
    const values = actor.role === 'admin' ? [] : [actor.patientId || actor.doctorId];
    const { rows } = await query(
      `SELECT c.consultation_id, c.appointment_id, c.symptoms, c.diagnosis, c.notes
       FROM CONSULTATION AS c
       JOIN APPOINTMENT AS a ON a.appointment_id = c.appointment_id
       WHERE ${scope}
       ORDER BY a.appointment_date DESC`,
      values,
    );
    return Response.json({ consultations: rows });
  } catch (error) {
    return requestFailure(error);
  }
}

export async function POST(request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    if (actor.role !== 'doctor') return jsonError('Only doctors can record consultations.', 403);
    const input = await readJson(request, schema);
    const consultation = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO CONSULTATION (appointment_id, symptoms, diagnosis, notes)
         SELECT a.appointment_id, $3, $4, $5
         FROM APPOINTMENT AS a
         WHERE a.appointment_id = $1 AND a.doctor_id = $2
           AND lower(a.status) NOT IN ('cancelled', 'canceled')
         RETURNING consultation_id, appointment_id, symptoms, diagnosis, notes`,
        [input.appointment_id, actor.doctorId, input.symptoms || null, input.diagnosis || null, input.notes || null],
      );
      if (!rows[0]) {
        const error = new Error('Appointment unavailable');
        error.code = '23503';
        throw error;
      }
      await saveConsultationEmbedding(client, rows[0].consultation_id, input);
      return rows[0];
    }, actor.userId);
    return Response.json({ consultation }, { status: 201 });
  } catch (error) {
    return requestFailure(error);
  }
}
