import bcrypt from 'bcrypt';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { assertAuthConfigured, createSessionToken, setSessionCookie } from '../../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../../lib/api.js';
import { withTransaction } from '../../../../lib/db.js';

const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  full_name: z.string().trim().min(1).max(200),
  dob: z.iso.date().optional(),
  gender: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(40).optional(),
  blood_group: z.string().trim().max(10).optional(),
}).strict();

export async function POST(request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const input = await readJson(request, schema);
    if (Buffer.byteLength(input.password) > 72) return jsonError('Password must be at most 72 bytes.', 400);
    assertAuthConfigured();
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO APP_USER (email, password_hash, role)
         VALUES ($1, $2, 'patient') RETURNING user_id, role::text AS role`,
        [input.email.toLowerCase(), passwordHash],
      );
      const created = rows[0];
      await client.query(
        `INSERT INTO PATIENT (patient_id, full_name, dob, gender, phone, blood_group)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [created.user_id, input.full_name, input.dob || null, input.gender || null, input.phone || null, input.blood_group || null],
      );
      return created;
    });
    const token = await createSessionToken(user.user_id, user.role);
    return setSessionCookie(NextResponse.json({ user: { user_id: user.user_id, role: user.role } }, { status: 201 }), token);
  } catch (error) {
    return requestFailure(error);
  }
}
