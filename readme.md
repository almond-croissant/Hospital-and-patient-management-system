# Hospital & Patient Management System

A PostgreSQL-backed hospital management API built with Next.js Route Handlers. The repository currently contains the backend API and database layer; it does not include the UI described in some earlier project notes.

## Stack

- Node.js and Next.js App Router
- PostgreSQL 16 with `pgvector`
- `pg` for parameterized database access
- `bcrypt` for password hashing, `jose` for signed sessions, and Zod for request validation

## Local setup

Use Node.js 20.9 or later and Docker Compose.

1. If `.env` does not exist, copy `.env.example` to `.env`; if it already exists, keep it and add/update only the needed settings. Set the same local database password in `POSTGRES_PASSWORD` and `DB_PASSWORD`, and set a separate `JWT_SECRET` of at least 32 bytes. The application may instead use a `DATABASE_URL` pointing at this local database.
2. Install packages and start PostgreSQL:

   ```sh
   npm ci
   docker compose up -d --wait
   ```

3. Initialize a **fresh, empty** `hospital_db`:

   ```sh
   npm run db:setup
   ```

   The setup script runs the numbered SQL files in order, then creates the views and reference data in one transaction. It refuses to initialize a database that already has `public.app_user`; it never drops tables or resets a volume. For an existing database, inspect and apply only the needed SQL changes after backing up the database.

4. Start the API and run checks:

   ```sh
   npm run dev
   npm test
   npm run db:check
   npm run build
   ```

Run `npm run db:seed` later to safely reapply the repeatable reference data.

Create the first administrator from an interactive terminal after database setup:

```sh
npm run admin:create
```

The script prompts for the email and reads the password without echoing it. Admin accounts cannot be created through the public API.

The database volume is named `pgdata` and is preserved by ordinary `docker compose down`. Do not use volume-removal commands when you need to retain database contents.

## Database files and order

| File | Purpose |
| --- | --- |
| `db/01_schema.sql` | Core tables, keys, checks, role enum, and consultation embeddings |
| `db/02_consultation_embedding.sql` | Compatibility migration for the embedding table |
| `db/03_prescription_audit.sql` | Audit function and update/delete triggers for prescriptions and medicine lines |
| `db/views.sql` | `doctor_appointment_schedule` and `doctor_consultation_summary` |
| `db/04_procedures.sql` | `get_patient_history(uuid)` JSON history function |
| `db/05_vector.sql` | pgvector table compatibility and cosine HNSW index |
| `db/06_transactions.sql` | Unique active appointment-slot indexes for race-safe booking |
| `db/07_seed_reference.sql` | Repeatable sample specializations and medicines; no user or patient data |

`doctor_appointment_schedule` includes appointments from every date. Filter it by `appointment_datetime` to retrieve a daily schedule. A normal view stores no result copy and does not automatically enforce authorization or make queries faster.

`get_patient_history` returns the patient profile and an ordered appointment array, with nested doctor, consultation, prescription, and medicine information. It returns an empty appointment array when the patient has no appointments. The function does not perform authorization; the API checks access before calling it.

The booking policy uses an exact timestamp as a single appointment slot because the current schema has no appointment duration. Two active appointments cannot use the same doctor/time or patient/time slot, including simultaneous attempts to book an empty slot. Cancelled appointments release the slot. The API returns a conflict response if a unique slot is already occupied. No overlapping time-range policy is possible until the schema defines duration or end times.

Prescription audit rows store old and updated rows in JSONB. A deleted prescription's audit row uses a null `prescription_id` so it survives the deletion. The actor is resolved from the transaction-local PostgreSQL setting `app.current_user`; missing, invalid, or unknown identifiers are recorded as null. Medicine-line updates and deletes are also audited.

## Authentication and authorization

- `POST /api/auth/register` creates a patient account only; clients cannot choose a role.
- `POST /api/auth/login` verifies the password and sets an HTTP-only, `SameSite=Lax` cookie. The cookie is marked `Secure` in production.
- `POST /api/auth/logout` clears the cookie.
- Protected routes verify the JWT and reload the user's role/profile from PostgreSQL.
- State-changing browser requests must include a matching `Origin` header.
- Admins create doctors, specializations, and medicines. Provision the initial admin through a trusted database administration process; there is intentionally no public admin-registration route.
- Doctor history/similarity access is scoped to patients with appointments assigned to that doctor. Patient history is limited to the signed-in patient. Admin routes are role-checked in the handler.

A database view is not an authorization boundary. Do not grant application clients unrestricted direct database access. This project does not yet include login rate limiting or a frontend.

## API summary

All request and response bodies are JSON. Protected endpoints require the `hospital_session` cookie.

| Method and path | Access | Use |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Register patient (`email`, `password`, `full_name`, optional profile fields) |
| `POST /api/auth/login` | Public | Sign in with `email` and `password` |
| `POST /api/auth/logout` | Signed-in user | Clear session |
| `GET /api/doctors` | Signed-in user | List doctor names and specializations |
| `POST /api/doctors` | Admin | Create account from `email`, `password`, `full_name`, `license_number`, optional `phone` and `specialization_ids` |
| `GET /api/specializations` | Signed-in user | List specializations |
| `POST /api/specializations` | Admin | Add a specialization using `name` |
| `GET /api/medicines` | Signed-in user | List medicine catalogue |
| `POST /api/medicines` | Admin | Add `name`, optional `brand_manufacturer`, and non-negative `unit_price` |
| `GET /api/appointments?day=YYYY-MM-DD` | Signed-in user | List all appointments for admin or only the actor's appointments |
| `POST /api/appointments` | Patient | Book with `doctor_id` and timezone-qualified `appointment_date` |
| `PATCH /api/appointments/{id}` | Patient or admin | Cancel; admins may restore a cancelled appointment |
| `GET /api/patients` | Signed-in user | Admin list, doctor's assigned patients, or the patient's own profile |
| `GET /api/patients/{id}/history` | Authorized patient, assigned doctor, or admin | Retrieve complete patient history |
| `GET /api/consultations` | Signed-in user | List consultations within the actor's access scope |
| `POST /api/consultations` | Assigned doctor | Record an `appointment_id` and optional `symptoms`, `diagnosis`, and `notes` |
| `POST /api/consultations/similar` | Doctor | Search similar cases using `text` and optional `consultation_id`/`limit` |
| `GET /api/prescriptions` | Signed-in user | List prescriptions within the actor's access scope |
| `POST /api/prescriptions` | Assigned doctor | Create a prescription for `consultation_id` with a `medicines` array (medicine ID, dosage, duration, optional instructions) |
| `PATCH /api/prescriptions/{id}` | Assigned doctor | Replace the `medicines` array; edits/deletes are audited |
| `DELETE /api/prescriptions/{id}` | Assigned doctor | Delete a prescription; audit survives the deletion |

Example booking request:

```json
{
  "doctor_id": "00000000-0000-4000-8000-000000000000",
  "appointment_date": "2026-11-01T09:30:00+05:30"
}
```

Example registration response:

```json
{ "user": { "user_id": "…", "role": "patient" } }
```

Example booking response:

```json
{ "appointment_id": "…" }
```

Example history response:

```json
{ "history": { "patient": { "patient_id": "…", "full_name": "…" }, "appointments": [] } }
```

## Vector search

Consultation text is transformed by deterministic feature hashing into 256 finite values and normalized before storage. This is an offline approximation, not a trained or clinically validated medical embedding. Similarity uses PostgreSQL cosine distance (`<=>`) and the HNSW index. Results are limited to consultations assigned to the searching doctor and omit consultation notes and patient identifiers.

## Testing and limitations

`npm test` checks vector dimension, normalization, finiteness, empty input, and determinism. `npm run db:check` checks that the expected core objects exist in the configured database. Database integration, trigger cascade behavior, API authorization, concurrent booking, and query-plan checks still require a running PostgreSQL/pgvector service and populated test fixtures; the SQL setup must only be run on an empty project database.

The API has no UI, email verification, password reset, rate limiting, appointment duration, or external clinical embedding model. Create the initial admin through a trusted database process and rotate any credentials that may have been committed in the past.
