-- Reusable appointment schedule across all dates.
-- Filter appointment_datetime when retrieving a particular day's schedule, for example:
-- SELECT * FROM doctor_appointment_schedule
-- WHERE appointment_datetime >= DATE '2026-10-28'
--   AND appointment_datetime <  DATE '2026-10-29';
--
-- This view does not enforce authorization. Apply database permissions or
-- row-level security separately. As a normal view, it stores no result copy;
-- PostgreSQL runs the underlying query when the view is queried.
CREATE OR REPLACE VIEW doctor_appointment_schedule AS
SELECT
    a.appointment_id,
    a.appointment_date AS appointment_datetime,
    a.status AS appointment_status,
    d.doctor_id,
    d.full_name AS doctor_name,
    p.patient_id,
    p.full_name AS patient_name
FROM APPOINTMENT AS a
JOIN DOCTOR AS d ON d.doctor_id = a.doctor_id
JOIN PATIENT AS p ON p.patient_id = a.patient_id;

-- Operational consultation summary; callers must still enforce row-level access.
CREATE OR REPLACE VIEW doctor_consultation_summary AS
SELECT
    c.consultation_id,
    a.appointment_id,
    a.doctor_id,
    a.patient_id,
    a.appointment_date,
    a.status AS appointment_status,
    c.symptoms,
    c.diagnosis
FROM CONSULTATION AS c
JOIN APPOINTMENT AS a ON a.appointment_id = c.appointment_id;
