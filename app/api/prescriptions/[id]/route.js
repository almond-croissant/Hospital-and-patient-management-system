import { z } from 'zod';
import { getActor } from '../../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../../lib/api.js';
import { withTransaction } from '../../../../lib/db.js';

const idSchema = z.string().uuid();
const updateSchema = z.object({
  medicines: z.array(z.object({
    medicine_id: z.string().uuid(),
    dosage: z.string().trim().min(1).max(200),
    duration_days: z.number().int().positive().max(3650),
    instructions: z.string().trim().max(2000).optional(),
  }).strict()).min(1).max(50),
}).strict();

export async function PATCH(request, { params }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    if (actor.role !== 'doctor') return jsonError('Only doctors can update prescriptions.', 403);
    const { id } = await params;
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return jsonError('Invalid prescription identifier.', 400);
    const input = await readJson(request, updateSchema);
    const medicineIds = input.medicines.map((item) => item.medicine_id);
    if (new Set(medicineIds).size !== medicineIds.length) return jsonError('Medicine IDs must be unique.', 400);

    const medicines = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT pr.prescription_id
         FROM PRESCRIPTION AS pr
         JOIN CONSULTATION AS c ON c.consultation_id = pr.consultation_id
         JOIN APPOINTMENT AS a ON a.appointment_id = c.appointment_id
         WHERE pr.prescription_id = $1 AND a.doctor_id = $2
         FOR UPDATE OF pr`,
        [parsedId.data, actor.doctorId],
      );
      if (!existing.rowCount) {
        const error = new Error('Prescription unavailable');
        error.statusCode = 404;
        throw error;
      }
      for (const item of input.medicines) {
        await client.query(
          `INSERT INTO PRESCRIPTION_MEDICINE
             (prescription_id, medicine_id, dosage, duration_days, instructions)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (prescription_id, medicine_id) DO UPDATE
             SET dosage = EXCLUDED.dosage,
                 duration_days = EXCLUDED.duration_days,
                 instructions = EXCLUDED.instructions
           WHERE (PRESCRIPTION_MEDICINE.dosage,
                  PRESCRIPTION_MEDICINE.duration_days,
                  PRESCRIPTION_MEDICINE.instructions)
             IS DISTINCT FROM
                 (EXCLUDED.dosage, EXCLUDED.duration_days, EXCLUDED.instructions)`,
          [parsedId.data, item.medicine_id, item.dosage, item.duration_days, item.instructions || null],
        );
      }
      await client.query(
        `DELETE FROM PRESCRIPTION_MEDICINE
         WHERE prescription_id = $1 AND medicine_id <> ALL($2::uuid[])`,
        [parsedId.data, medicineIds],
      );
      const { rows } = await client.query(
        `SELECT pm.medicine_id, pm.dosage, pm.duration_days, pm.instructions
         FROM PRESCRIPTION_MEDICINE AS pm WHERE pm.prescription_id = $1`,
        [parsedId.data],
      );
      return rows;
    }, actor.userId);
    return Response.json({ prescription_id: parsedId.data, medicines });
  } catch (error) {
    if (error?.statusCode === 404) return jsonError('Prescription not found or not accessible.', 404);
    return requestFailure(error);
  }
}

export async function DELETE(request, { params }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    if (actor.role !== 'doctor') return jsonError('Only doctors can delete prescriptions.', 403);
    const { id } = await params;
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return jsonError('Invalid prescription identifier.', 400);
    const deleted = await withTransaction((client) => client.query(
      `DELETE FROM PRESCRIPTION AS pr
       USING CONSULTATION AS c, APPOINTMENT AS a
       WHERE pr.consultation_id = c.consultation_id
         AND c.appointment_id = a.appointment_id
         AND pr.prescription_id = $1 AND a.doctor_id = $2
       RETURNING pr.prescription_id`,
      [parsedId.data, actor.doctorId],
    ), actor.userId);
    if (!deleted.rowCount) return jsonError('Prescription not found or not accessible.', 404);
    return Response.json({ deleted: true, prescription_id: deleted.rows[0].prescription_id });
  } catch (error) {
    return requestFailure(error);
  }
}
