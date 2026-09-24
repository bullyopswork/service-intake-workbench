CREATE TABLE IF NOT EXISTS demo_workspaces (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  normalized_email text NOT NULL,
  category text NOT NULL CHECK (category IN ('maintenance', 'installation', 'billing', 'other')),
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('new', 'triage', 'in_progress', 'resolved')),
  source text NOT NULL CHECK (source IN ('web', 'partner', 'seed')),
  assignee text,
  duplicate_of uuid REFERENCES service_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requests_workspace_recent
  ON service_requests (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_possible_duplicate
  ON service_requests (workspace_id, normalized_email, category, created_at DESC);

CREATE TABLE IF NOT EXISTS request_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor text NOT NULL,
  note text,
  from_status text,
  to_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_request_time
  ON request_events (request_id, created_at, id);

CREATE TABLE IF NOT EXISTS idempotency_receipts (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  source text NOT NULL,
  idempotency_key text NOT NULL,
  payload_sha256 text NOT NULL,
  request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source, idempotency_key)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  scope text NOT NULL,
  bucket date NOT NULL,
  count integer NOT NULL CHECK (count >= 0),
  PRIMARY KEY (scope, bucket)
);
