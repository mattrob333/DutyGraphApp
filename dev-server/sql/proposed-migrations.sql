-- 00NN-meeting-os (proposed, not applied)
-- The DutyGraph team chooses the migration number and reconciles records/record_versions.
-- No migration or grant in this file has been executed.
BEGIN;
CREATE TABLE advisor_devices (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 advisor_id uuid NOT NULL, label text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id,id)
);
CREATE TABLE advisor_sessions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 device_id uuid NOT NULL REFERENCES advisor_devices(id), advisor_id uuid NOT NULL,
 access_hash text UNIQUE NOT NULL CHECK (access_hash ~ '^[a-f0-9]{64}$'), refresh_hash text UNIQUE NOT NULL CHECK (refresh_hash ~ '^[a-f0-9]{64}$'),
 access_expires_at timestamptz NOT NULL, refresh_expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id)
);
CREATE TABLE advisor_pairing_codes (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 code_hash text UNIQUE NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'), advisor_id uuid NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id)
);
CREATE TABLE meeting_sessions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 meeting_record_id uuid NOT NULL, mode text NOT NULL CHECK (mode IN ('capture','copilot','facilitator')),
 state text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0), content_hash text NOT NULL,
 started_at timestamptz, ended_at timestamptz, prompt_version text, prompt_hash text, log jsonb NOT NULL DEFAULT '[]',
 budget_cents integer NOT NULL CHECK(budget_cents>=0), spent_cents integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), UNIQUE(tenant_id,company_id,id)
);
CREATE TABLE meeting_attendee_consents (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 session_id uuid NOT NULL, person_key text NOT NULL, state text NOT NULL CHECK(state IN ('pending','consented','declined')),
 notice_version text NOT NULL, app_version text NOT NULL, consent_at timestamptz, recorded_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,company_id,session_id) REFERENCES meeting_sessions(tenant_id,company_id,id), UNIQUE(session_id,person_key)
);
CREATE TABLE meeting_segments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 session_id uuid NOT NULL, segment_index integer NOT NULL CHECK(segment_index>=0), asset_id uuid NOT NULL,
 sha256 text NOT NULL, bytes bigint NOT NULL CHECK(bytes>=0), duration_ms integer NOT NULL CHECK(duration_ms>=0), chunks jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,company_id,session_id) REFERENCES meeting_sessions(tenant_id,company_id,id), UNIQUE(session_id,segment_index)
);
CREATE TABLE transcript_segments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 session_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), start_ms integer NOT NULL, end_ms integer NOT NULL CHECK(end_ms>=start_ms),
 text text NOT NULL, speaker_cluster text, source text NOT NULL CHECK(source IN('live','batch')), committed boolean NOT NULL DEFAULT false, excluded text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,company_id,session_id) REFERENCES meeting_sessions(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,id)
);
CREATE TABLE meeting_speaker_maps (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 session_id uuid NOT NULL, cluster text NOT NULL, person_key text, confirmed_by uuid, version integer NOT NULL DEFAULT 1, content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,company_id,session_id) REFERENCES meeting_sessions(tenant_id,company_id,id), UNIQUE(session_id,cluster)
);
-- Team may implement this payload as record kind meeting_proposal instead.
CREATE TABLE meeting_proposals (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 session_id uuid NOT NULL, kind text NOT NULL, state text NOT NULL CHECK(state IN('proposed','accepted','rejected','stale')),
 version integer NOT NULL DEFAULT 1, content_hash text NOT NULL, source_segment_ids uuid[] NOT NULL CHECK(cardinality(source_segment_ids)>0),
 sources jsonb NOT NULL, body jsonb NOT NULL, stale boolean NOT NULL DEFAULT false, decided_by uuid, decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,company_id,session_id) REFERENCES meeting_sessions(tenant_id,company_id,id)
);
CREATE TABLE meeting_parked_items (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 session_id uuid NOT NULL, text text NOT NULL, speaker_cluster text, at_ms integer NOT NULL, follow_up_person_id uuid, follow_up_request_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,company_id,session_id) REFERENCES meeting_sessions(tenant_id,company_id,id)
);
CREATE TABLE pulses (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 meeting_record_id uuid, title text NOT NULL, due_at timestamptz NOT NULL, version integer NOT NULL DEFAULT 1, content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), UNIQUE(tenant_id,company_id,id)
);
CREATE TABLE pulse_participants (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 pulse_id uuid NOT NULL, person_id uuid NOT NULL, questions jsonb NOT NULL, response_record_id uuid,
 state text NOT NULL CHECK(state IN('not_started','in_progress','complete')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,company_id,pulse_id) REFERENCES pulses(tenant_id,company_id,id), UNIQUE(pulse_id,person_id)
);
CREATE TABLE voice_line_cache (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), company_id uuid NOT NULL,
 person_id uuid NOT NULL, content_hash text NOT NULL, voice text NOT NULL, model text NOT NULL, duration_ms integer NOT NULL, asset_id uuid NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id), UNIQUE(tenant_id,company_id,person_id,content_hash)
);
-- Tenant policies are generated explicitly; audio remains in the existing assets service.
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['advisor_devices','advisor_sessions','advisor_pairing_codes','meeting_sessions','meeting_attendee_consents','meeting_segments','transcript_segments','meeting_speaker_maps','meeting_proposals','meeting_parked_items','pulses','pulse_participants','voice_line_cache'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
 EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id::text = current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'',true))',table_name);
 EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO dutygraph_app',table_name);
 END LOOP;
END $$;
CREATE INDEX meeting_proposals_sources ON meeting_proposals USING gin(source_segment_ids);
CREATE INDEX transcript_session ON transcript_segments(tenant_id,company_id,session_id,start_ms);
-- Define under the trusted auth-lookup owner with BYPASSRLS, not the runtime role.
CREATE FUNCTION advisor_session_by_access_hash(p_hash text) RETURNS SETOF advisor_sessions
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT * FROM public.advisor_sessions WHERE access_hash=p_hash AND revoked_at IS NULL AND access_expires_at>now() AND refresh_expires_at>now()
 $$;
REVOKE ALL ON FUNCTION advisor_session_by_access_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION advisor_session_by_access_hash(text) TO dutygraph_app;
COMMIT;
