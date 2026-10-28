import { z } from 'zod';
import { getActor } from '../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../lib/api.js';
import { query, withTransaction } from '../../../lib/db.js';

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  brand_manufacturer: z.string().trim().max(200).optional(),
  unit_price: z.number().finite().nonnegative().max(10000000),
}).strict();

export async function GET(request) {
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const { rows } = await query(
      `SELECT medicine_id, name, brand_manufacturer, unit_price
       FROM MEDICINE ORDER BY name, brand_manufacturer`,
    );
    return Response.json({ medicines: rows });
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
      `INSERT INTO MEDICINE (name, brand_manufacturer, unit_price)
       VALUES ($1, $2, $3)
       RETURNING medicine_id, name, brand_manufacturer, unit_price`,
      [input.name, input.brand_manufacturer || null, input.unit_price],
    ), actor.userId);
    return Response.json({ medicine: rows[0] }, { status: 201 });
  } catch (error) {
    return requestFailure(error);
  }
}
