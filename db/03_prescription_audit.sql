-- Record prescription and prescription medicine updates/deletes.
CREATE OR REPLACE FUNCTION audit_prescription_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    current_user_id UUID;
    requested_user_id UUID;
    audit_prescription_id UUID;
    audit_action TEXT;
BEGIN
    -- Missing or malformed application context is recorded as an unknown actor.
    BEGIN
        requested_user_id := NULLIF(current_setting('app.current_user', TRUE), '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        requested_user_id := NULL;
    END;

    -- Avoid failing the audited change if the session names a deleted/unknown user.
    IF requested_user_id IS NOT NULL THEN
        SELECT u.user_id INTO current_user_id
        FROM APP_USER AS u
        WHERE u.user_id = requested_user_id;
    END IF;

    IF TG_TABLE_NAME = 'prescription' THEN
        audit_prescription_id := OLD.prescription_id;
        audit_action := TG_OP;
    ELSE
        audit_prescription_id := OLD.prescription_id;
        -- During a cascade the parent may already be absent when the child
        -- trigger runs; keep that audit event without violating its FK.
        IF NOT EXISTS (
            SELECT 1 FROM PRESCRIPTION AS p
            WHERE p.prescription_id = audit_prescription_id
        ) THEN
            audit_prescription_id := NULL;
        END IF;
        audit_action := TG_OP || '_PRESCRIPTION_MEDICINE';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        INSERT INTO PRESCRIPTION_AUDIT (
            prescription_id, action, performed_by, payload
        ) VALUES (
            audit_prescription_id,
            audit_action,
            current_user_id,
            jsonb_build_object('previous', to_jsonb(OLD), 'updated', to_jsonb(NEW))
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO PRESCRIPTION_AUDIT (
            prescription_id, action, performed_by, payload
        ) VALUES (
            CASE WHEN TG_TABLE_NAME = 'prescription' THEN NULL ELSE audit_prescription_id END,
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
FOR EACH ROW EXECUTE FUNCTION audit_prescription_changes();

DROP TRIGGER IF EXISTS prescription_medicine_changes_audit ON PRESCRIPTION_MEDICINE;
CREATE TRIGGER prescription_medicine_changes_audit
AFTER UPDATE OR DELETE ON PRESCRIPTION_MEDICINE
FOR EACH ROW EXECUTE FUNCTION audit_prescription_changes();
