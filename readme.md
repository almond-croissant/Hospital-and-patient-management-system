# MediCare HMS: Hospital & Patient Management System

A full-stack hospital management web app built for a DBMS Experiential Learning project. Patients book appointments, doctors record diagnoses and prescribe medicines, and admins manage the hospital. All data lives in PostgreSQL, and the project goes beyond basic CRUD by using transactions, triggers, views, a stored procedure and vector similarity search.

**Stack:** Next.js (App Router + Route Handlers) · PostgreSQL · pgvector · JWT auth · zod validation

---

## 1. What the project does

**Roles**
| Role | Can do |
|---|---|
| Patient | Register, book and cancel own appointments, view own prescriptions and medical history |
| Doctor | View daily schedule, write diagnoses, prescribe medicines, search similar past cases |
| Admin | Manage doctors, patients and medicines, view analytics dashboard and the audit log |

Each role only sees and does what it is allowed to. Permissions are enforced in the API, not just hidden in the UI.

## 2. Database design

Ten tables, linked by primary and foreign keys:

- **PATIENT**, **DOCTOR**, **SPECIALIZATION**: the core entities
- **DOCTOR_SPECIALIZATION**: many-to-many link (a doctor can have several specializations)
- **APPOINTMENT**: a patient meeting a doctor at a date and time
- **CONSULTATION**: what happened at the appointment (symptoms, diagnosis, notes)
- **MEDICINE**: catalogue of drugs
- **PRESCRIPTION** and **PRESCRIPTION_MEDICINE**: a prescription and the drugs on it (dose, frequency, duration)
- **PRESCRIPTION_AUDIT**: automatic history of prescription changes

Extra tables: **APP_USER** (logins and roles) and **CONSULTATION_EMBEDDING** (vectors for similarity search).

Integrity is enforced inside the database with PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK constraints, plus partial unique indexes that prevent double-booking a doctor or patient slot.

## 3. Advanced database features

| Concept              | What it does                                                                                                                                                                                                                                                                         | File                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Transaction**      | Booking an appointment and creating its consultation happen together, or not at all. The doctor row is locked with `FOR UPDATE` to stop concurrent double-booking.                                                                                                                   | `app/api/appointments/route.js`, `db/examples/06_transactions.sql` |
| **Triggers**         | Editing or deleting a prescription or a prescription medicine automatically writes an audit row (who, when, old and new values as JSONB). Extra triggers block edits to closed prescriptions, block past appointments, and mark an appointment Completed when its consultation ends. | `db/02_triggers.sql`                                               |
| **View**             | `v_doctor_daily_schedule` joins a doctor's daily appointments with patient details. `v_doctor_daily_summary` aggregates the day by status.                                                                                                                                           | `db/03_views.sql`                                                  |
| **Stored procedure** | `sp_generate_patient_history_report(patient_id)` builds a full medical history report as JSON.                                                                                                                                                                                       | `db/04_procedures.sql`                                             |
| **Vector search**    | Finds past consultations similar to a description of symptoms (see below).                                                                                                                                                                                                           | `db/05_vector.sql`, `lib/embedding.js`                             |
| **Complex queries**  | `JOIN`, `GROUP BY`, `HAVING`, `ORDER BY`, aggregates, `FILTER`, window functions and subqueries power the dashboard and list pages.                                                                                                                                                  | `app/api/dashboard/route.js`, `app/api/patients/route.js`          |

## 4. Vector similarity search (secondary database feature)

Each consultation's **symptoms + diagnosis** text is converted into a 256-number vector (an _embedding_). Cases with similar meaning get similar vectors. The vectors are stored in PostgreSQL using the **pgvector** extension and searched with the cosine-distance operator (`<=>`), accelerated by an **HNSW** index.

Flow: doctor types symptoms → text is embedded → pgvector returns the nearest past consultations → UI shows match percentage, diagnosis and the medicines used.

**Embedding model (simulated):** `lib/embedding.js` is a deterministic, offline stand-in for a real model. It uses feature hashing into 256 buckets, plus a small lexicon of clinical concept groups so that different wordings of the same complaint (for example "wheezing" and "asthma") land close together. Vectors are L2-normalised. To use a real model (such as OpenAI `text-embedding-3-small` with 256 dimensions), only `embedConsultation()` needs to change.

## 5. Security

- Passwords hashed with bcrypt
- Sessions are JWTs in `httpOnly` cookies
- Role-based access control on every API route, plus row-level scoping (patients see only their own data, doctors only their own appointments)
- All SQL uses parameterised queries
- Secrets (database URL, JWT secret) come from `.env` only and are never committed
- Validation happens twice: in the browser and API with zod, and again in the database with CHECK constraints

## 6. Project structure

```
hospital-mgmt/
├── db/                  SQL: schema, triggers, views, procedure, vector, seed data
│   └── examples/        Transaction demos
├── scripts/             migrate.js, seed.js
├── lib/                 db pool, auth, API helpers, zod schemas, embedding
├── components/          Nav, shared UI
├── app/
│   ├── api/             Route Handlers (the backend)
│   ├── (auth)/          login and register pages
│   └── (app)/           dashboard, patients, doctors, appointments, schedule, consultations, ...
├── middleware.js        page-level auth gate
├── docker-compose.yml   Postgres + pgvector
└── .env.example
```

## 7. Setup

Requires Node 20.6+ and Docker (or a PostgreSQL 14+ install with pgvector).

```bash
npm install
cp .env.example .env        # then edit the values, especially JWT_SECRET
docker compose up -d        # starts PostgreSQL with pgvector
npm run db:setup            # creates tables, triggers, views, seed data
npm run dev                 # http://localhost:3000
```

Useful commands: `npm run db:reset` (drops everything and rebuilds), `npm run db:seed`.

**Demo accounts** (password is `SEED_PASSWORD` from your `.env`):

| Role    | Email                    |
| ------- | ------------------------ |
| Admin   | admin@hospital.test      |
| Doctor  | anita.rao@hospital.test  |
| Patient | aarav.sharma@example.com |

## 8. How a request flows

Click "Book appointment" → form validated in the browser → request sent to the API → API checks login and role → SQL runs inside a transaction → the database enforces its own rules → result returns and the page updates.

## 9. Possible future improvements

- Replace the simulated embedding with a real embedding model
- Automated tests (API and SQL)
- Email or SMS appointment reminders
- Billing and insurance module
