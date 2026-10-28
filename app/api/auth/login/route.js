import bcrypt from 'bcrypt';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { assertAuthConfigured, createSessionToken, setSessionCookie } from '../../../../lib/auth.js';
import { readJson, requestFailure, requireSameOrigin, jsonError } from '../../../../lib/api.js';
import { query } from '../../../../lib/db.js';

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).strict();

export async function POST(request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const input = await readJson(request, schema);
    if (Buffer.byteLength(input.password) > 72) return jsonError('Invalid email or password.', 401);
    assertAuthConfigured();
    const { rows } = await query(
      `SELECT user_id, password_hash, role::text AS role
       FROM APP_USER WHERE lower(email) = $1`,
      [input.email.toLowerCase()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return jsonError('Invalid email or password.', 401);
    }
    const token = await createSessionToken(user.user_id, user.role);
    return setSessionCookie(NextResponse.json({ user: { user_id: user.user_id, role: user.role } }), token);
  } catch (error) {
    return requestFailure(error);
  }
}
