-- Return one patient's history as a single, stable JSON document.
-- Authorization and patient ownership checks belong in the API layer.
CREATE OR REPLACE FUNCTION get_patient_history(p_patient_id UUID)
RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
    SELECT jsonb_build_object(
        'patient', (
            SELECT jsonb_build_object(
                'patient_id', p.patient_id,
                'full_name', p.full_name,
                'dob', p.dob,
                'gender', p.gender,
                'blood_group', p.blood_group
            )
            FROM PATIENT AS p
            WHERE p.patient_id = p_patient_id
        ),
        'appointments', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'appointment_id', a.appointment_id,
                    'appointment_date', a.appointment_date,
                    'status', a.status,
                    'doctor', jsonb_build_object(
                        'doctor_id', d.doctor_id,
                        'full_name', d.full_name,
                        'license_number', d.license_number
                    ),
                    'consultation', (
                        SELECT jsonb_build_object(
                            'consultation_id', c.consultation_id,
                            'symptoms', c.symptoms,
                            'diagnosis', c.diagnosis,
                            'notes', c.notes,
                            'prescriptions', COALESCE((
                                SELECT jsonb_agg(
                                    jsonb_build_object(
                                        'prescription_id', pr.prescription_id,
                                        'created_at', pr.created_at,
                                        'medicines', COALESCE((
                                            SELECT jsonb_agg(
                                                jsonb_build_object(
                                                    'medicine_id', m.medicine_id,
                                                    'name', m.name,
                                                    'brand_manufacturer', m.brand_manufacturer,
                                                    'dosage', pm.dosage,
                                                    'duration_days', pm.duration_days,
                                                    'instructions', pm.instructions
                                                ) ORDER BY m.name
                                            )
                                            FROM PRESCRIPTION_MEDICINE AS pm
                                            JOIN MEDICINE AS m ON m.medicine_id = pm.medicine_id
                                            WHERE pm.prescription_id = pr.prescription_id
                                        ), '[]'::jsonb)
                                    ) ORDER BY pr.created_at
                                )
                                FROM PRESCRIPTION AS pr
                                WHERE pr.consultation_id = c.consultation_id
                            ), '[]'::jsonb)
                        )
                        FROM CONSULTATION AS c
                        WHERE c.appointment_id = a.appointment_id
                    )
                ) ORDER BY a.appointment_date
            )
            FROM APPOINTMENT AS a
            JOIN DOCTOR AS d ON d.doctor_id = a.doctor_id
            WHERE a.patient_id = p_patient_id
        ), '[]'::jsonb)
    );
$$;
