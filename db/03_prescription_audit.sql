
-- Record prescription and prescription medicine changes.
CREATE OR REPLACE FUNCTION audit_prescription_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    current_user_id UUID;
    audit_prescription_id UUID;
    audit_action TEXT;
BEGIN
    current_user_id := NULLIF(
        current_setting('app.current_user', TRUE), ''
    )::UUID;

    IF TG_TABLE_NAME = 'prescription' THEN
        audit_prescription_id := OLD.prescription_id;
        audit_action := TG_OP;
    ELSE
        audit_prescription_id := CASE
            WHEN TG_OP = 'DELETE' THEN OLD.prescription_id
            ELSE NEW.prescription_id
        END;
        audit_action := TG_OP || '_PRESCRIPTION_MEDICINE';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        INSERT INTO PRESCRIPTION_AUDIT (
            prescription_id,
            action,
            performed_by,
            payload
        )
        VALUES (
            audit_prescription_id,
            audit_action,
            current_user_id,
            jsonb_build_object(
                'previous', to_jsonb(OLD),
                'updated', to_jsonb(NEW)
            )
        );

        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO PRESCRIPTION_AUDIT (
            prescription_id,
            action,
            performed_by,
            payload
        )
        VALUES (
            CASE
                WHEN TG_TABLE_NAME = 'prescription' THEN NULL
                ELSE audit_prescription_id
            END,
            audit_action,
            current_user_id,
            jsonb_build_object('previous', to_jsonb(OLD))
        );

        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prescription_changes_audit ON PRESCRIPTION;

CREATE TRIGGER prescription_changes_audit
AFTER UPDATE OR DELETE ON PRESCRIPTION
FOR EACH ROW
EXECUTE FUNCTION audit_prescription_changes();

DROP TRIGGER IF EXISTS prescription_medicine_changes_audit ON PRESCRIPTION_MEDICINE;

CREATE TRIGGER prescription_medicine_changes_audit
AFTER UPDATE OR DELETE ON PRESCRIPTION_MEDICINE
FOR EACH ROW
EXECUTE FUNCTION audit_prescription_changes();
