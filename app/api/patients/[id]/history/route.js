import { z } from 'zod';
import { getActor } from '../../../../../lib/auth.js';
import { jsonError, requestFailure } from '../../../../../lib/api.js';
import { query } from '../../../../../lib/db.js';

const idSchema = z.string().uuid();

export async function GET(request, { params }) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const { id: rawId } = await params;
    const parsed = idSchema.safeParse(rawId);
    if (!parsed.success) return jsonError('Invalid patient identifier.', 400);
    const patientId = parsed.data;

    if (actor.role === 'patient' && actor.patientId !== patientId) return jsonError('Forbidden.', 403);
    if (actor.role === 'doctor') {
      const access = await query(
        `SELECT 1 FROM APPOINTMENT WHERE patient_id = $1 AND doctor_id = $2 LIMIT 1`,
        [patientId, actor.doctorId],
      );
      if (!access.rowCount) return jsonError('Forbidden.', 403);
    }
    const { rows } = await query('SELECT get_patient_history($1::uuid) AS history', [patientId]);
    if (!rows[0]?.history?.patient) return jsonError('Patient not found.', 404);
    return Response.json({ history: rows[0].history });
  } catch (error) {
    return requestFailure(error);
  }
}
