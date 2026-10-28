import { z } from 'zod';
import { getActor } from '../../../../lib/auth.js';
import { jsonError, readJson, requestFailure, requireSameOrigin } from '../../../../lib/api.js';
import { getPool } from '../../../../lib/db.js';
import { findSimilarConsultations } from '../../../../lib/vector.js';

const schema = z.object({
  text: z.string().trim().min(1).max(10000),
  consultation_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();

export async function POST(request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const actor = await getActor(request);
    if (!actor) return jsonError('Authentication required.', 401);
    if (actor.role !== 'doctor') return jsonError('Only doctors can search consultations.', 403);
    const input = await readJson(request, schema);
    const client = await getPool().connect();
    try {
      const consultations = await findSimilarConsultations(client, {
        text: input.text,
        doctorId: actor.doctorId,
        excludeId: input.consultation_id || null,
        limit: input.limit || 5,
      });
      return Response.json({ consultations });
    } finally {
      client.release();
    }
  } catch (error) {
    return requestFailure(error);
  }
}
