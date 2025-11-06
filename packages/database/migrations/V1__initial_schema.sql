-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Custom enum types
CREATE TYPE user_role AS ENUM (
    'physician',
    'nurse_practitioner', 
    'physician_assistant',
    'admin',
    'scribe',
    'billing_specialist'
);

CREATE TYPE encounter_status AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'signed',
    'amended'
);

CREATE TYPE note_section AS ENUM (
    'subjective',
    'objective', 
    'assessment',
    'plan'
);

CREATE TYPE approval_tier AS ENUM (
    'auto',
    'single_click',
    'full_review'
);

CREATE TYPE approval_status AS ENUM (
    'pending',
    'approved',
    'modified',
    'rejected'
);

-- =============================================================================
-- CORE ENTITIES
-- =============================================================================

-- Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    tax_id VARCHAR(20),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    phone VARCHAR(20),
    fax VARCHAR(20),
    hipaa_signed_at TIMESTAMP WITH TIME ZONE,
    baa_signed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_organizations_active ON organizations(id) WHERE is_active = TRUE AND deleted_at IS NULL;

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    role user_role NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    npi VARCHAR(10),
    dea_number VARCHAR(20),
    state_license_number VARCHAR(50),
    specialty VARCHAR(100),
    phone VARCHAR(20),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    password_hash VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_organization ON users(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_npi ON users(npi) WHERE npi IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role, organization_id) WHERE deleted_at IS NULL;

-- Patients table (PHI)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mrn VARCHAR(50) NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20),
    ssn_encrypted TEXT,
    email VARCHAR(255),
    phone VARCHAR(20),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    preferred_language VARCHAR(50) DEFAULT 'en',
    insurance_provider VARCHAR(255),
    insurance_policy_number VARCHAR(100),
    insurance_group_number VARCHAR(100),
    allergies TEXT[],
    active_problems TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(organization_id, mrn)
);

CREATE INDEX idx_patients_mrn ON patients(organization_id, mrn) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_name ON patients(last_name, first_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_dob ON patients(date_of_birth) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_search ON patients USING gin(
    to_tsvector('english', first_name || ' ' || last_name)
);

-- Enable Row Level Security
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_organization_isolation ON patients
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM users 
            WHERE id = current_setting('app.current_user_id', true)::UUID
        )
    );

-- Encounters table (PHI)
CREATE TABLE encounters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    physician_id UUID NOT NULL REFERENCES users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    encounter_type VARCHAR(50),
    chief_complaint TEXT,
    status encounter_status DEFAULT 'scheduled',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    location VARCHAR(255),
    visit_reason TEXT,
    consent_obtained BOOLEAN DEFAULT FALSE,
    consent_obtained_at TIMESTAMP WITH TIME ZONE,
    recording_consent_given BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_encounters_patient ON encounters(patient_id);
CREATE INDEX idx_encounters_physician ON encounters(physician_id);
CREATE INDEX idx_encounters_status ON encounters(status);
CREATE INDEX idx_encounters_scheduled ON encounters(scheduled_at);
CREATE INDEX idx_encounters_organization ON encounters(organization_id);

ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY encounters_organization_isolation ON encounters
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM users 
            WHERE id = current_setting('app.current_user_id', true)::UUID
        )
    );

-- =============================================================================
-- AUDIO & TRANSCRIPTION
-- =============================================================================

-- Audio recordings table (PHI)
CREATE TABLE audio_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    s3_key VARCHAR(500) NOT NULL,
    s3_bucket VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    format VARCHAR(20),
    encryption_key_id VARCHAR(255),
    checksum VARCHAR(64),
    uploaded_at TIMESTAMP WITH TIME ZONE,
    transcription_started_at TIMESTAMP WITH TIME ZONE,
    transcription_completed_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    scheduled_deletion_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audio_encounter ON audio_recordings(encounter_id);
CREATE INDEX idx_audio_scheduled_deletion ON audio_recordings(scheduled_deletion_at) 
    WHERE scheduled_deletion_at IS NOT NULL AND deleted_at IS NULL;

-- Transcripts table (PHI)
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audio_recording_id UUID NOT NULL REFERENCES audio_recordings(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL REFERENCES encounters(id),
    full_text TEXT NOT NULL,
    word_error_rate DECIMAL(5,4),
    processing_time_seconds INTEGER,
    model_version VARCHAR(50),
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transcripts_encounter ON transcripts(encounter_id);
CREATE INDEX idx_transcripts_audio ON transcripts(audio_recording_id);
CREATE INDEX idx_transcripts_search ON transcripts USING gin(
    to_tsvector('english', full_text)
);

-- Transcript segments table (for speaker diarization)
CREATE TABLE transcript_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    speaker VARCHAR(20),
    text TEXT NOT NULL,
    start_time_seconds DECIMAL(10,3),
    end_time_seconds DECIMAL(10,3),
    confidence DECIMAL(5,4),
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(transcript_id, sequence_number)
);

CREATE INDEX idx_transcript_segments_transcript ON transcript_segments(transcript_id, sequence_number);

-- =============================================================================
-- CLINICAL DOCUMENTATION
-- =============================================================================

-- Clinical notes table (PHI)
CREATE TABLE clinical_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    encounter_id UUID NOT NULL REFERENCES encounters(id),
    physician_id UUID NOT NULL REFERENCES users(id),
    note_type VARCHAR(50) DEFAULT 'soap',
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    status encounter_status DEFAULT 'in_progress',
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_confidence_score DECIMAL(5,4),
    manually_edited BOOLEAN DEFAULT FALSE,
    edit_time_seconds INTEGER,
    signed_at TIMESTAMP WITH TIME ZONE,
    signed_by UUID REFERENCES users(id),
    signature_method VARCHAR(50),
    addendum TEXT,
    addendum_added_at TIMESTAMP WITH TIME ZONE,
    addendum_added_by UUID REFERENCES users(id),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clinical_notes_encounter ON clinical_notes(encounter_id);
CREATE INDEX idx_clinical_notes_physician ON clinical_notes(physician_id);
CREATE INDEX idx_clinical_notes_status ON clinical_notes(status);
CREATE INDEX idx_clinical_notes_signed ON clinical_notes(signed_at) WHERE signed_at IS NOT NULL;

-- Note sections table (granular tracking)
CREATE TABLE note_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinical_note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
    section note_section NOT NULL,
    content TEXT NOT NULL,
    ai_generated BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(5,4),
    source_transcript_segment_ids UUID[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_note_sections_note ON note_sections(clinical_note_id);
CREATE INDEX idx_note_sections_section ON note_sections(clinical_note_id, section);

-- =============================================================================
-- MEDICAL CODING
-- =============================================================================

-- ICD-10 codes table (reference data)
CREATE TABLE icd10_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(100),
    is_billable BOOLEAN DEFAULT TRUE,
    is_hcc BOOLEAN DEFAULT FALSE,
    hcc_category VARCHAR(50),
    effective_date DATE,
    termination_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_icd10_code ON icd10_codes(code);
CREATE INDEX idx_icd10_description ON icd10_codes USING gin(
    to_tsvector('english', description)
);
CREATE INDEX idx_icd10_hcc ON icd10_codes(is_hcc) WHERE is_hcc = TRUE;
CREATE INDEX idx_icd10_active ON icd10_codes(code) 
    WHERE (termination_date IS NULL OR termination_date > CURRENT_DATE);

-- CPT codes table (reference data)
CREATE TABLE cpt_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(100),
    relative_value_units DECIMAL(6,2),
    requires_modifier BOOLEAN DEFAULT FALSE,
    bundling_restrictions TEXT[],
    effective_date DATE,
    termination_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cpt_code ON cpt_codes(code);
CREATE INDEX idx_cpt_description ON cpt_codes USING gin(
    to_tsvector('english', description)
);
CREATE INDEX idx_cpt_category ON cpt_codes(category);

-- Diagnosis codes (linking encounters to ICD-10)
CREATE TABLE diagnoses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    encounter_id UUID NOT NULL REFERENCES encounters(id),
    clinical_note_id UUID REFERENCES clinical_notes(id),
    icd10_code_id UUID NOT NULL REFERENCES icd10_codes(id),
    is_primary BOOLEAN DEFAULT FALSE,
    ai_suggested BOOLEAN DEFAULT FALSE,
    ai_confidence DECIMAL(5,4),
    ai_rationale TEXT,
    physician_accepted BOOLEAN,
    physician_modified BOOLEAN DEFAULT FALSE,
    original_suggestion VARCHAR(10),
    status approval_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_diagnoses_encounter ON diagnoses(encounter_id);
CREATE INDEX idx_diagnoses_note ON diagnoses(clinical_note_id);
CREATE INDEX idx_diagnoses_status ON diagnoses(status);
CREATE INDEX idx_diagnoses_primary ON diagnoses(encounter_id, is_primary) WHERE is_primary = TRUE;

-- Procedure codes (linking encounters to CPT)
CREATE TABLE procedures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    encounter_id UUID NOT NULL REFERENCES encounters(id),
    clinical_note_id UUID REFERENCES clinical_notes(id),
    cpt_code_id UUID NOT NULL REFERENCES cpt_codes(id),
    units INTEGER DEFAULT 1,
    modifier VARCHAR(10),
    ai_suggested BOOLEAN DEFAULT FALSE,
    ai_confidence DECIMAL(5,4),
    ai_rationale TEXT,
    physician_accepted BOOLEAN,
    physician_modified BOOLEAN DEFAULT FALSE,
    documentation_support TEXT,
    status approval_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_procedures_encounter ON procedures(encounter_id);
CREATE INDEX idx_procedures_note ON procedures(clinical_note_id);
CREATE INDEX idx_procedures_status ON procedures(status);

-- =============================================================================
-- AUDIT & COMPLIANCE
-- =============================================================================

-- Audit logs table (HIPAA requirement)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    changes JSONB,
    phi_accessed BOOLEAN DEFAULT FALSE,
    reason TEXT,
    session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Create initial partitions
CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE audit_logs_2025_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_phi ON audit_logs(phi_accessed, created_at) WHERE phi_accessed = TRUE;
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function to automatically create audit log partitions
CREATE OR REPLACE FUNCTION create_audit_log_partition()
RETURNS void AS $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    partition_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    partition_name := 'audit_logs_' || TO_CHAR(partition_date, 'YYYY_MM');
    start_date := TO_CHAR(partition_date, 'YYYY-MM-DD');
    end_date := TO_CHAR(partition_date + INTERVAL '1 month', 'YYYY-MM-DD');
    
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
    
    RAISE NOTICE 'Created partition %', partition_name;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for automatic audit logging
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    user_id_value UUID;
    org_id_value UUID;
BEGIN
    -- Get current user context (set by application)
    BEGIN
        user_id_value := current_setting('app.current_user_id', true)::UUID;
        org_id_value := current_setting('app.current_organization_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        user_id_value := NULL;
        org_id_value := NULL;
    END;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (
            user_id, 
            organization_id, 
            action, 
            resource_type, 
            resource_id, 
            changes, 
            phi_accessed
        ) VALUES (
            user_id_value,
            org_id_value,
            'create',
            TG_TABLE_NAME,
            NEW.id,
            to_jsonb(NEW),
            TRUE
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (
            user_id, 
            organization_id, 
            action, 
            resource_type, 
            resource_id, 
            changes, 
            phi_accessed
        ) VALUES (
            user_id_value,
            org_id_value,
            'update',
            TG_TABLE_NAME,
            NEW.id,
            jsonb_build_object(
                'before', to_jsonb(OLD),
                'after', to_jsonb(NEW)
            ),
            TRUE
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (
            user_id, 
            organization_id, 
            action, 
            resource_type, 
            resource_id, 
            changes, 
            phi_accessed
        ) VALUES (
            user_id_value,
            org_id_value,
            'delete',
            TG_TABLE_NAME,
            OLD.id,
            to_jsonb(OLD),
            TRUE
        );
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to PHI tables
CREATE TRIGGER audit_patients 
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_encounters 
    AFTER INSERT OR UPDATE OR DELETE ON encounters
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_clinical_notes 
    AFTER INSERT OR UPDATE OR DELETE ON clinical_notes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_transcripts 
    AFTER INSERT OR UPDATE OR DELETE ON transcripts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at 
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at 
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encounters_updated_at 
    BEFORE UPDATE ON encounters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinical_notes_updated_at 
    BEFORE UPDATE ON clinical_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get patient age
CREATE OR REPLACE FUNCTION get_patient_age(patient_id UUID)
RETURNS INTEGER AS $$
    SELECT EXTRACT(YEAR FROM AGE(date_of_birth))::INTEGER
    FROM patients
    WHERE id = patient_id;
$$ LANGUAGE SQL STABLE;

-- Function to check if user has access to patient
CREATE OR REPLACE FUNCTION user_can_access_patient(
    user_id_param UUID,
    patient_id_param UUID
)
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1
        FROM patients p
        JOIN users u ON p.organization_id = u.organization_id
        WHERE p.id = patient_id_param
        AND u.id = user_id_param
        AND u.is_active = TRUE
        AND p.deleted_at IS NULL
    );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
