-- Repeatable reference data only; no demo users or patient information.
INSERT INTO SPECIALIZATION (specialization_id, name) VALUES
    ('10000000-0000-4000-8000-000000000001', 'Cardiology'),
    ('10000000-0000-4000-8000-000000000002', 'Dermatology'),
    ('10000000-0000-4000-8000-000000000003', 'Family Medicine'),
    ('10000000-0000-4000-8000-000000000004', 'Pediatrics')
ON CONFLICT (specialization_id) DO NOTHING;

INSERT INTO MEDICINE (medicine_id, name, brand_manufacturer, unit_price) VALUES
    ('20000000-0000-4000-8000-000000000001', 'Paracetamol 500 mg', 'Generic', 0.50),
    ('20000000-0000-4000-8000-000000000002', 'Ibuprofen 200 mg', 'Generic', 0.75),
    ('20000000-0000-4000-8000-000000000003', 'Cetirizine 10 mg', 'Generic', 0.40)
ON CONFLICT (medicine_id) DO NOTHING;
