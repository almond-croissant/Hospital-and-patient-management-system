import pg from 'pg';

const { Pool } = pg;
let pool;

export function getPool() {
  if (pool) return pool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl && !process.env.DB_HOST) {
    throw new Error('Database configuration is missing. Set DATABASE_URL or DB_HOST.');
  }
  pool = new Pool(databaseUrl ? {
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  } : {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'hospital_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export async function query(text, values = []) {
  return getPool().query(text, values);
}

export async function withTransaction(work, actorId = null) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (actorId) {
      await client.query("SELECT set_config('app.current_user', $1, true)", [actorId]);
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}
