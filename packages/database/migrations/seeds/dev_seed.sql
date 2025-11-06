-- Seed data for development environment only
-- DO NOT run in production

-- Insert test organization
INSERT INTO organizations (id, name, type, is_active)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Test Medical Clinic', 'clinic', true),
    ('00000000-0000-0000-0000-000000000002', 'Demo Hospital', 'hospital', true);

-- Insert test users
INSERT INTO users (id, email, role, first_name, last_name, npi, organization_id, is_active, email_verified)
VALUES
    ('00000000-0000-0000-0000-000000000010', 'doctor@test.com', 'physician', 'John', 'Doe', '1234567890', '00000000-0000-0000-0000-000000000001', true, true),
    ('00000000-0000-0000-0000-000000000011', 'np@test.com', 'nurse_practitioner', 'Jane', 'Smith', '0987654321', '00000000-0000-0000-0000-000000000001', true, true),
    ('00000000-0000-0000-0000-000000000012', 'admin@test.com', 'admin', 'User', null, '00000000-0000-0000-0000-000000000001', true, true);

-- Insert test patients
INSERT INTO patients (id, mrn, organization_id, first_name, last_name, date_of_birth, gender, email, phone)
VALUES
    ('00000000-0000-0000-0000-000000000020', 'MRN001', '00000000-0000-0000-0000-000000000001', 'Alice', 'Johnson', '1985-05-15', 'female', 'alice@example.com', '555-0001'),
    ('00000000-0000-0000-0000-000000000021', 'MRN002', '00000000-0000-0000-0000-000000000001', 'Bob', 'Williams', '1970-08-22', 'male', 'bob@example.com', '555-0002'),
    ('00000000-0000-0000-0000-000000000022', 'MRN003', '00000000-0000-0000-0000-000000000001', 'Carol', 'Davis', '1992-12-10', 'female', 'carol@example.com', '555-0003');

-- Insert sample ICD-10 codes (common diagnoses)
INSERT INTO icd10_codes (code, description, category, is_billable)
VALUES
    ('E11.9', 'Type 2 diabetes mellitus without complications', 'Endocrine', true),
    ('I10', 'Essential (primary) hypertension', 'Circulatory', true),
    ('J45.909', 'Unspecified asthma, uncomplicated', 'Respiratory', true),
    ('M79.3', 'Panniculitis, unspecified', 'Musculoskeletal', true),
    ('R50.9', 'Fever, unspecified', 'Symptoms', true);

-- Insert sample CPT codes
INSERT INTO cpt_codes (code, description, category, relative_value_units)
VALUES
    ('99213', 'Office visit, established patient, 20-29 minutes', 'E/M', 1.92),
    ('99214', 'Office visit, established patient, 30-39 minutes', 'E/M', 2.80),
    ('99215', 'Office visit, established patient, 40-54 minutes', 'E/M', 3.95),
    ('80053', 'Comprehensive metabolic panel', 'Lab', 0.55),
    ('85025', 'Complete blood count with differential', 'Lab', 0.42);
