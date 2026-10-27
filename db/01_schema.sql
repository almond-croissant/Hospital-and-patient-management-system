-- PostgreSQL schema for the hospital and patient management system.
-- PostgreSQL 13+ provides gen_random_uuid() natively.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE user_role AS ENUM ('admin', 'doctor', 'patient');

-- Independent / parent tables
CREATE TABLE APP_USER (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE SPECIALIZATION (
    specialization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL UNIQUE
);

CREATE TABLE MEDICINE (
    medicine_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    brand_manufacturer TEXT,
    unit_price        NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0)
);

-- Profile tables: profile IDs are also APP_USER IDs.
CREATE TABLE PATIENT (
    patient_id  UUID PRIMARY KEY REFERENCES APP_USER (user_id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    dob         DATE,
    gender      TEXT,
    phone       TEXT,
    blood_group TEXT
);

CREATE TABLE DOCTOR (
    doctor_id      UUID PRIMARY KEY REFERENCES APP_USER (user_id) ON DELETE CASCADE,
    full_name      TEXT NOT NULL,
    license_number TEXT NOT NULL UNIQUE,
    phone          TEXT
);

-- Junction and operational tables
CREATE TABLE DOCTOR_SPECIALIZATION (
    doctor_id         UUID NOT NULL REFERENCES DOCTOR (doctor_id) ON DELETE CASCADE,
    specialization_id UUID NOT NULL REFERENCES SPECIALIZATION (specialization_id) ON DELETE CASCADE,
    PRIMARY KEY (doctor_id, specialization_id)
);

CREATE TABLE APPOINTMENT (
    appointment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id       UUID NOT NULL REFERENCES PATIENT (patient_id),
    doctor_id        UUID NOT NULL REFERENCES DOCTOR (doctor_id),
    appointment_date TIMESTAMPTZ NOT NULL,
    status           TEXT NOT NULL
);

CREATE TABLE CONSULTATION (
    consultation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id  UUID NOT NULL UNIQUE REFERENCES APPOINTMENT (appointment_id) ON DELETE CASCADE,
    symptoms        TEXT,
    diagnosis       TEXT,
    notes           TEXT
);

CREATE TABLE CONSULTATION_EMBEDDING (
    consultation_id UUID PRIMARY KEY REFERENCES CONSULTATION (consultation_id) ON DELETE CASCADE,
    embedding       VECTOR(256) NOT NULL
);

CREATE TABLE PRESCRIPTION (
    prescription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES CONSULTATION (consultation_id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dependent / line item tables
CREATE TABLE PRESCRIPTION_MEDICINE (
    prescription_id UUID NOT NULL REFERENCES PRESCRIPTION (prescription_id) ON DELETE CASCADE,
    medicine_id     UUID NOT NULL REFERENCES MEDICINE (medicine_id),
    dosage          TEXT NOT NULL,
    duration_days   INTEGER NOT NULL CHECK (duration_days > 0),
    instructions    TEXT,
    PRIMARY KEY (prescription_id, medicine_id)
);

CREATE TABLE PRESCRIPTION_AUDIT (
    audit_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID REFERENCES PRESCRIPTION (prescription_id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    performed_by    UUID REFERENCES APP_USER (user_id) ON DELETE SET NULL,
    payload         JSONB,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

