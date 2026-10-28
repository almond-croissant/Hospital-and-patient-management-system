import { z } from 'zod';
import { getActor } from '../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../lib/api.js';
import { query, withTransaction } from '../../../lib/db.js';

const schema = z.object({
  consultation_id: z.string().uuid(),
  medicines: z.array(z.object({
    medicine_id: z.string().uuid(),
    dosage: z.string().trim().min(1).max(200),
    duration_days: z.number().int().positive().max(3650),
    instructions: z.string().trim().max(2000).optional(),
  }).strict()).min(1).max(50),
}).strict();

export async function GET(request) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const scope = actor.role === 'patient' ? 'a.patient_id = $1'
      : actor.role === 'doctor' ? 'a.doctor_id = $1' : 'TRUE';
    const values = actor.role === 'admin' ? [] : [actor.patientId || actor.doctorId];
    const { rows } = await query(
      `SELECT pr.prescription_id, pr.consultation_id, pr.created_at,
              a.patient_id, a.doctor_id,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'medicine_id', m.medicine_id,
                  'name', m.name,
                  'dosage', pm.dosage,
                  'duration_days', pm.duration_days,
                  'instructions', pm.instructions
                ) ORDER BY m.name)
                FROM PRESCRIPTION_MEDICINE AS pm
                JOIN MEDICINE AS m ON m.medicine_id = pm.medicine_id
                WHERE pm.prescription_id = pr.prescription_id
              ), '[]'::jsonb) AS medicines
       FROM PRESCRIPTION AS pr
       JOIN CONSULTATION AS c ON c.consultation_id = pr.consultation_id
       JOIN APPOINTMENT AS a ON a.appointment_id = c.appointment_id
       WHERE ${scope}
       ORDER BY pr.created_at DESC`,
      values,
    );
    return Response.json({ prescriptions: rows });
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
    if (actor.role !== 'doctor') return jsonError('Only doctors can create prescriptions.', 403);
    const input = await readJson(request, schema);
    const prescription = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO PRESCRIPTION (consultation_id)
         SELECT c.consultation_id
         FROM CONSULTATION AS c
         JOIN APPOINTMENT AS a ON a.appointment_id = c.appointment_id
         WHERE c.consultation_id = $1 AND a.doctor_id = $2
         RETURNING prescription_id, consultation_id, created_at`,
        [input.consultation_id, actor.doctorId],
      );
      if (!rows[0]) {
        const error = new Error('Consultation unavailable');
        error.code = '23503';
        throw error;
      }
      for (const medicine of input.medicines) {
        await client.query(
          `INSERT INTO PRESCRIPTION_MEDICINE
             (prescription_id, medicine_id, dosage, duration_days, instructions)
           VALUES ($1, $2, $3, $4, $5)`,
          [rows[0].prescription_id, medicine.medicine_id, medicine.dosage, medicine.duration_days, medicine.instructions || null],
        );
      }
      return rows[0];
    }, actor.userId);
    return Response.json({ prescription }, { status: 201 });
  } catch (error) {
    return requestFailure(error);
  }
}
