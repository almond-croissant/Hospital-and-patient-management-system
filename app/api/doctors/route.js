import bcrypt from 'bcrypt';
import { z } from 'zod';
import { getActor } from '../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../lib/api.js';
import { query, withTransaction } from '../../../lib/db.js';

const createSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(72),
  full_name: z.string().trim().min(1).max(200),
  license_number: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(40).optional(),
  specialization_ids: z.array(z.string().uuid()).max(20).default([]),
}).strict();

export async function GET(request) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const { rows } = await query(
      `SELECT d.doctor_id, d.full_name,
              COALESCE(jsonb_agg(s.name ORDER BY s.name) FILTER (WHERE s.name IS NOT NULL), '[]'::jsonb) AS specializations
       FROM DOCTOR AS d
       LEFT JOIN DOCTOR_SPECIALIZATION AS ds ON ds.doctor_id = d.doctor_id
       LEFT JOIN SPECIALIZATION AS s ON s.specialization_id = ds.specialization_id
       GROUP BY d.doctor_id, d.full_name
       ORDER BY d.full_name`,
    );
    return Response.json({ doctors: rows });
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
    if (actor.role !== 'admin') return jsonError('Admin access required.', 403);
    const input = await readJson(request, createSchema);
    if (Buffer.byteLength(input.password) > 72) return jsonError('Password must be at most 72 bytes.', 400);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const doctor = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO APP_USER (email, password_hash, role)
         VALUES ($1, $2, 'doctor') RETURNING user_id`,
        [input.email.toLowerCase(), passwordHash],
      );
      const doctorId = rows[0].user_id;
      await client.query(
        `INSERT INTO DOCTOR (doctor_id, full_name, license_number, phone)
         VALUES ($1, $2, $3, $4)`,
        [doctorId, input.full_name, input.license_number, input.phone || null],
      );
      for (const specializationId of new Set(input.specialization_ids)) {
        await client.query(
          `INSERT INTO DOCTOR_SPECIALIZATION (doctor_id, specialization_id) VALUES ($1, $2)`,
          [doctorId, specializationId],
        );
      }
      return { doctor_id: doctorId, full_name: input.full_name };
    }, actor.userId);
    return Response.json({ doctor }, { status: 201 });
  } catch (error) {
    return requestFailure(error);
  }
}
