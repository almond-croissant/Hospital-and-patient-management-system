import { basename } from 'node:path';
import { createPool } from './db-common.js';

const pool = createPool();
const files = [
  'db/01_schema.sql',
  'db/02_consultation_embedding.sql',
  'db/03_prescription_audit.sql',
  'db/views.sql',
  'db/04_procedures.sql',
  'db/05_vector.sql',
  'db/06_transactions.sql',
  'db/07_seed_reference.sql',
];

try {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('hospital-schema-setup'))");
    const { rows } = await client.query("SELECT to_regclass('public.app_user') AS existing_table");
    if (rows[0].existing_table) {
      throw new Error('Found public.app_user; refusing to initialize a non-empty project database.');
    }
    await client.query('BEGIN');
    try {
      for (const file of files) {
        const sql = await (await import('node:fs/promises')).readFile(file, 'utf8');
        await client.query(sql);
        console.log(`Applied ${basename(file)}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext('hospital-schema-setup'))"); } catch { /* connection cleanup */ }
    client.release();
  }
  console.log('Fresh database setup completed.');
} catch (error) {
  console.error(`Database setup stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
