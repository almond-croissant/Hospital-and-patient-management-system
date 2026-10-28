-- Conflict policy: appointments occupy a single exact timestamp slot because
-- APPOINTMENT has no duration. Active/completed slots cannot be duplicated;
-- cancelled slots may be reused. The unique indexes are the concurrency guard,
-- including when two bookings target a previously empty slot simultaneously.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM APPOINTMENT
        WHERE lower(status) NOT IN ('cancelled', 'canceled')
        GROUP BY doctor_id, appointment_date
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot add doctor booking guard: duplicate active doctor slots exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM APPOINTMENT
        WHERE lower(status) NOT IN ('cancelled', 'canceled')
        GROUP BY patient_id, appointment_date
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot add patient booking guard: duplicate active patient slots exist';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS appointment_doctor_active_slot_uidx
    ON APPOINTMENT (doctor_id, appointment_date)
    WHERE lower(status) NOT IN ('cancelled', 'canceled');

CREATE UNIQUE INDEX IF NOT EXISTS appointment_patient_active_slot_uidx
    ON APPOINTMENT (patient_id, appointment_date)
    WHERE lower(status) NOT IN ('cancelled', 'canceled');
