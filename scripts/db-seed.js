import { readFile } from 'node:fs/promises';
import { createPool } from './db-common.js';

const pool = createPool();
let client;
try {
  const sql = await readFile('db/07_seed_reference.sql', 'utf8');
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Reference data is seeded.');
} catch (error) {
  if (client) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
  }
  console.error(`Reference seeding failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
