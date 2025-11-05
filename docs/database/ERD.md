# Scribemed Database ERD

The entity-relationship diagram below summarises the core healthcare data model introduced in `V1__initial_schema.sql`. Relationships are cardinality annotated so engineers can visualise the lifecycle of encounters, notes, and coding artefacts.

```
┌────────────────┐      ┌────────────────────┐
│ organizations  │◄────►│ users              │
└────────┬───────┘      └────────┬───────────┘
         │                      │  ▲
         │                      │  │
         ▼                      ▼  │
┌────────────────┐      ┌────────────────────┐
│ patients       │─────►│ encounters         │
└────────┬───────┘      └───────┬────┬───────┘
         │                      │    │
         │                      │    └─────────────┐
         │                      │                  ▼
         │                      │          ┌───────────────┐
         ▼                      ▼          │ audio_record- │
┌────────────────┐      ┌────────────────┐ │ ings          │
│ clinical_notes │◄────►│ diagnoses      │ └────┬──────────┘
└───────┬────────┘      └────┬──────────┘      │
        │                    │                 ▼
        │                    │         ┌────────────────┐
        ▼                    ▼         │ transcripts    │
┌───────────────┐     ┌────────────┐   └────┬───────────┘
│ note_sections │     │ procedures │        │
└───────────────┘     └────┬───────┘        ▼
                            │         ┌────────────────────┐
                            │         │ transcript_segments│
                            ▼         └────────────────────┘
                    ┌──────────────┐
                    │ icd10_codes  │
                    └──────────────┘
                    ┌──────────────┐
                    │ cpt_codes    │
                    └──────────────┘

┌────────────────┐
│ audit_logs     │◄─────────────────────────────┐
└────────────────┘                              │
                                                │
┌────────────────┐                              │
│ helper funcs   │ (set context, RLS, triggers) │
└────────────────┘                              │
```

Key takeaways:

- Every `user` belongs to exactly one `organization`. Organization settings drive RLS policies.
- `patients` are scoped to organisations and can experience many `encounters`.
- Each `encounter` can have one `audio_recording`, multiple `transcripts`, one or more `clinical_notes`, and billing artefacts (`diagnoses`, `procedures`).
- `clinical_notes` optionally decompose into granular `note_sections` for subject/objective/etc sections.
- Coding reference data (`icd10_codes`, `cpt_codes`) remains independent but links to encounter artefacts via foreign keys.
- All PHI tables are protected by audit triggers writing to `audit_logs`, which is range-partitioned by month.
