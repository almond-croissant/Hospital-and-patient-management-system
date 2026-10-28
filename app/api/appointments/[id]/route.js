import { z } from 'zod';
import { getActor } from '../../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../../lib/api.js';
import { withTransaction } from '../../../../lib/db.js';

const schema = z.object({ status: z.enum(['Scheduled', 'Cancelled']) }).strict();

export async function PATCH(request, { params }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const { id } = await params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return jsonError('Invalid appointment identifier.', 400);
    const input = await readJson(request, schema);
    if (input.status === 'Cancelled' && actor.role !== 'patient' && actor.role !== 'admin') {
      return jsonError('Only the patient or an admin can cancel an appointment.', 403);
    }
    if (input.status === 'Scheduled' && actor.role !== 'admin') {
      return jsonError('Only an admin can restore an appointment.', 403);
    }
    const result = await withTransaction(async (client) => client.query(
      `UPDATE APPOINTMENT SET status = $1
       WHERE appointment_id = $2
         AND ($3::user_role = 'admin' OR patient_id = $4)
         AND (lower(status) = 'scheduled' OR ($1 = 'Scheduled' AND lower(status) IN ('cancelled', 'canceled')))
       RETURNING appointment_id, status`,
      [input.status, parsedId.data, actor.role, actor.patientId || null],
    ), actor.userId);
    if (!result.rowCount) return jsonError('Appointment not found or not accessible.', 404);
    return Response.json({ appointment: result.rows[0] });
  } catch (error) {
    return requestFailure(error);
  }
}
