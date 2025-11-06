# Data Dictionary

The following reference details the business meaning of each table and noteworthy columns created in `V1__initial_schema.sql`. All timestamps are stored with time zone information unless noted otherwise.

## organizations

- **id** (`uuid`): Primary key.
- **name** (`varchar(255)`): Legal organisation name.
- **type** (`varchar(50)`): Classification such as `clinic`, `hospital`, etc.
- **tax_id** (`varchar(20)`): Optional tax identification number.
- **hipaa_signed_at`/`baa_signed_at** (`timestamptz`): Contractual compliance markers.
- **settings** (`jsonb`): Organisation-level feature toggles.
- **is_active / deleted_at**: Soft deletion controls.

## users

- **id** (`uuid`): Primary key.
- **email** (`varchar(255)`): Unique login identifier.
- **role** (`user_role` enum): Access role (physician, admin, etc.).
- **organization_id** (`uuid`): Foreign key to `organizations`.
- **npi/dea_number/state_license_number**: Credential metadata for clinicians.
- **mfa_enabled/mfa_secret**: Multi-factor authentication settings.
- **preferences** (`jsonb`): User-configurable UI preferences.

## patients

- **id** (`uuid`): Primary key; PHI record.
- **mrn** (`varchar(50)`): Medical record number unique per organisation.
- **organization_id**: Links patient to the owning organisation (enforced by RLS).
- **date_of_birth / gender**: Core demographics.
- **ssn_encrypted** (`text`): Encrypted SSN using application-level crypto before insert.
- **insurance\_\* fields**: Coverage metadata for billing workflows.
- **allergies / active_problems** (`text[]`): Array-based clinical problem lists.

## encounters

- **id** (`uuid`): Primary key.
- **patient_id** (`uuid`): Links to `patients`.
- **physician_id** (`uuid`): Responsible provider (`users`).
- **status** (`encounter_status` enum): Visit lifecycle state.
- **consent\_\* fields**: Audit of HIPAA consent and recording permissions.
- **metadata** (`jsonb`): Free-form integration metadata (EHR IDs, etc.).

## audio_recordings

- **id** (`uuid`): Primary key.
- **encounter_id** (`uuid`): Back-reference to encounter.
- **s3\_\* fields**: Location of encrypted audio artefacts.
- **duration_seconds / format**: File properties for processing decisions.
- **scheduled_deletion_at** (`timestamptz`): Automatic purge window.

## transcripts

- **id** (`uuid`): Primary key.
- **audio_recording_id** (`uuid`): Source audio.
- **full_text** (`text`): Transcribed conversation.
- **word_error_rate** (`decimal(5,4)`): Quality metric.
- **model_version** (`varchar(50)`): LLM/ASR build identifier.

## transcript_segments

- **id** (`uuid`): Primary key.
- **transcript_id** (`uuid`): Parent transcript.
- **speaker** (`varchar(20)`): Speaker label (physician/patient).
- **start_time_seconds / end_time_seconds**: Precise offsets to align UI playback.
- **sequence_number** (`integer`): Ordering column (unique per transcript).

## clinical_notes

- **id** (`uuid`): Primary key.
- **encounter_id** (`uuid`): Associated visit.
- **physician_id** (`uuid`): Author of the note.
- **note_type** (`varchar(50)`): Format such as `soap`.
- **subjective/objective/assessment/plan** (`text`): SOAP sections.
- **ai_generated / ai_confidence_score**: Provenance of AI assistance.
- **signed_at / signed_by**: Signature metadata.
- **version** (`integer`): Incremented on successive edits.

## note_sections

- **id** (`uuid`): Primary key.
- **clinical_note_id** (`uuid`): Parent note.
- **section** (`note_section` enum): Section identifier.
- **content** (`text`): Canonical text for the section.
- **source_transcript_segment_ids** (`uuid[]`): Rationale traceability back to transcript segments.

## icd10_codes

- **code** (`varchar(10)`): ICD-10 code; unique constraint ensures no duplicates.
- **description / category**: Clinical meaning and classification.
- **is_billable / is_hcc** (`boolean`): Billing rules.
- **effective_date / termination_date**: Payer availability window.

## cpt_codes

- **code** (`varchar(10)`): CPT code; unique.
- **relative_value_units** (`decimal(6,2)`): Used in RVU calculations.
- **requires_modifier / bundling_restrictions**: Claim submission hints.

## diagnoses

- **id** (`uuid`): Primary key.
- **encounter_id / clinical_note_id**: Clinical context for the diagnosis.
- **icd10_code_id** (`uuid`): FK to `icd10_codes`.
- **is_primary** (`boolean`): Flags primary diagnosis.
- **ai_suggested / ai_confidence / ai_rationale**: Captures AI recommendation metadata for auditing.
- **status** (`approval_status` enum): Review workflow state.

## procedures

- **id** (`uuid`): Primary key.
- **encounter_id / clinical_note_id**: Claim context.
- **cpt_code_id** (`uuid`): FK to `cpt_codes`.
- **units / modifier**: Billing adjustments.
- **documentation_support** (`text`): Narrative supporting the code.
- **status** (`approval_status`): Approval workflow.

## audit_logs

- **id** (`uuid`): Primary key (partitioned table).
- **user_id / organization_id**: Actor and tenant context.
- **action / resource_type / resource_id**: CRUD event metadata.
- **changes** (`jsonb`): Before/after snapshots when applicable.
- **phi_accessed** (`boolean`): Whether PHI was accessed or altered.
- **partitions**: Table is range partitioned monthly for efficient retention management.

## Helper functions & triggers

- **create_audit_log_partition()**: Ensures partitions exist ahead of time.
- **audit_trigger_function()**: Centralised auditing logic applied to PHI tables.
- **update_updated_at_column()**: Maintains `updated_at` fields.
- **get_patient_age(patient_id)**: Convenience helper for analytics and UI.
- **user_can_access_patient(user_id, patient_id)**: Enforces organisation level scoping in queries.
