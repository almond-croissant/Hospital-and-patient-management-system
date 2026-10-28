import { getActor } from '../../../lib/auth.js';
import { jsonError, requestFailure } from '../../../lib/api.js';
import { query } from '../../../lib/db.js';

export async function GET(request) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    if (actor.role === 'patient') {
      const { rows } = await query(
        `SELECT patient_id, full_name, dob, gender, phone, blood_group
         FROM PATIENT WHERE patient_id = $1`,
        [actor.patientId],
      );
      return Response.json({ patients: rows });
    }
    const condition = actor.role === 'doctor' ? `EXISTS (
      SELECT 1 FROM APPOINTMENT a WHERE a.patient_id = p.patient_id AND a.doctor_id = $1
    )` : 'TRUE';
    const values = actor.role === 'doctor' ? [actor.doctorId] : [];
    const { rows } = await query(
      `SELECT p.patient_id, p.full_name, p.dob, p.gender, p.phone, p.blood_group
       FROM PATIENT AS p WHERE ${condition} ORDER BY p.full_name`,
      values,
    );
    return Response.json({ patients: rows });
  } catch (error) {
    return requestFailure(error);
  }
}
