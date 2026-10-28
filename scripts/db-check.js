import { createPool } from './db-common.js';

const expectedTables = [
  'app_user', 'patient', 'doctor', 'specialization', 'doctor_specialization',
  'appointment', 'consultation', 'consultation_embedding', 'medicine',
  'prescription', 'prescription_medicine', 'prescription_audit',
];
const pool = createPool();
let failed = false;
try {
  for (const table of expectedTables) {
    const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${table}`]);
    const present = rows[0].present;
    console.log(`${present ? 'OK' : 'MISSING'} table ${table}`);
    failed ||= !present;
  }
  const checks = [
    ['pgvector extension', "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS present"],
    ['cosine HNSW index', "SELECT to_regclass('public.consultation_embedding_hnsw_cosine_idx') IS NOT NULL AS present"],
    ['256-dimensional embeddings', `SELECT EXISTS (
      SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'consultation_embedding'
        AND a.attname = 'embedding' AND format_type(a.atttypid, a.atttypmod) = 'vector(256)'
    ) AS present`],
    ['patient history function', "SELECT to_regprocedure('public.get_patient_history(uuid)') IS NOT NULL AS present"],
    ['schedule view', "SELECT to_regclass('public.doctor_appointment_schedule') IS NOT NULL AS present"],
    ['prescription audit triggers', `SELECT count(*) = 2 AS present FROM pg_trigger
      WHERE NOT tgisinternal AND tgname IN ('prescription_changes_audit', 'prescription_medicine_changes_audit')`],
    ['race-safe appointment indexes', `SELECT to_regclass('public.appointment_doctor_active_slot_uidx') IS NOT NULL
      AND to_regclass('public.appointment_patient_active_slot_uidx') IS NOT NULL AS present`],
  ];
  for (const [label, sql] of checks) {
    const { rows } = await pool.query(sql);
    console.log(`${rows[0].present ? 'OK' : 'MISSING'} ${label}`);
    failed ||= !rows[0].present;
  }
  if (failed) process.exitCode = 1;
} catch (error) {
  const codes = error?.errors?.map((item) => item?.code || item?.name).filter(Boolean).join(', ');
  console.error(`Database check failed (${codes || error?.cause?.code || error?.code || error?.name || 'unknown'}).`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
