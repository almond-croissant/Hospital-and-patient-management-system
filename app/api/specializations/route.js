import { z } from 'zod';
import { getActor } from '../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../lib/api.js';
import { query, withTransaction } from '../../../lib/db.js';

const schema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export async function GET(request) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const { rows } = await query('SELECT specialization_id, name FROM SPECIALIZATION ORDER BY name');
    return Response.json({ specializations: rows });
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
    const input = await readJson(request, schema);
    const { rows } = await withTransaction((client) => client.query(
      `INSERT INTO SPECIALIZATION (name) VALUES ($1)
       RETURNING specialization_id, name`,
      [input.name],
    ), actor.userId);
    return Response.json({ specialization: rows[0] }, { status: 201 });
  } catch (error) {
    return requestFailure(error);
  }
}
