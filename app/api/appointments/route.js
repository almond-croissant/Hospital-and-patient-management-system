import { z } from 'zod';
import { getActor } from '../../../lib/auth.js';
import { jsonError, requestFailure, requireSameOrigin, readJson } from '../../../lib/api.js';
import { query, withTransaction } from '../../../lib/db.js';

const bookingSchema = z.object({
  doctor_id: z.string().uuid(),
  appointment_date: z.iso.datetime({ offset: true }),
}).strict();

export async function GET(request) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const url = new URL(request.url);
    const day = url.searchParams.get('day');
    if (day && !z.iso.date().safeParse(day).success) return jsonError('day must be a valid date in YYYY-MM-DD format.', 400);
    const filters = [];
    const values = [];
    if (actor.role === 'patient') {
      values.push(actor.patientId);
      filters.push(`patient_id = $${values.length}`);
    } else if (actor.role === 'doctor') {
      values.push(actor.doctorId);
      filters.push(`doctor_id = $${values.length}`);
    }
    if (day) {
      values.push(day);
      filters.push(`appointment_datetime >= $${values.length}::date::timestamptz AND appointment_datetime < ($${values.length}::date + INTERVAL '1 day')`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT appointment_id, appointment_datetime, appointment_status,
              doctor_id, doctor_name, patient_id, patient_name
       FROM doctor_appointment_schedule ${where}
       ORDER BY appointment_datetime`,
      values,
    );
    return Response.json({ appointments: rows });
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
    if (actor.role !== 'patient') return jsonError('Only patients can book appointments.', 403);
    const input = await readJson(request, bookingSchema);
    if (new Date(input.appointment_date).getTime() <= Date.now()) {
      return jsonError('Appointments must be scheduled in the future.', 400);
    }
    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO APPOINTMENT (patient_id, doctor_id, appointment_date, status)
         VALUES ($1, $2, $3::timestamptz, 'Scheduled')
         RETURNING appointment_id`,
        [actor.patientId, input.doctor_id, input.appointment_date],
      );
      return rows[0];
    }, actor.userId);
    return Response.json({ appointment_id: created.appointment_id }, { status: 201 });
  } catch (error) {
    return requestFailure(error);
  }
}
