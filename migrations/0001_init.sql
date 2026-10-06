CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rev INTEGER NOT NULL
);
INSERT INTO sync_state (id, rev) VALUES (1, 0);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  rev INTEGER NOT NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  updated_by TEXT CHECK (updated_by IS NULL OR updated_by IN ('a', 'b', 'import')),
  deleted_at TEXT CHECK (deleted_at IS NULL OR deleted_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES items (id),
  kind TEXT NOT NULL,
  parent_id TEXT REFERENCES items (id),
  title TEXT NOT NULL,
  status TEXT,
  group_key TEXT,
  due_on TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  done_on TEXT CHECK (done_on IS NULL OR done_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount INTEGER CHECK (amount IS NULL OR amount >= 0),
  currency TEXT NOT NULL DEFAULT 'IDR' CHECK (length(currency) = 3),
  qty INTEGER CHECK (qty IS NULL OR qty >= 0),
  who TEXT CHECK (who IS NULL OR who IN ('a', 'b', 'both')),
  note TEXT,
  data TEXT CHECK (data IS NULL OR json_valid(data)),
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  updated_by TEXT CHECK (updated_by IS NULL OR updated_by IN ('a', 'b', 'import')),
  deleted_at TEXT CHECK (deleted_at IS NULL OR deleted_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
);
CREATE INDEX items_rev ON items (rev);
CREATE INDEX items_kind_due ON items (kind, due_on);
CREATE INDEX items_parent ON items (parent_id);

CREATE TABLE budget_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES items (id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('planned', 'payment')),
  budget_id TEXT REFERENCES budget_entries (id),
  vendor_id TEXT REFERENCES items (id),
  title TEXT NOT NULL,
  group_key TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('due', 'paid')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'IDR' CHECK (length(currency) = 3),
  due_on TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  done_on TEXT CHECK (done_on IS NULL OR done_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  who TEXT CHECK (who IS NULL OR who IN ('a', 'b', 'both')),
  note TEXT,
  data TEXT CHECK (data IS NULL OR json_valid(data)),
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  updated_by TEXT CHECK (updated_by IS NULL OR updated_by IN ('a', 'b', 'import')),
  deleted_at TEXT CHECK (deleted_at IS NULL OR deleted_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  CHECK (
    (entry_type = 'planned' AND budget_id IS NULL AND group_key IS NOT NULL AND status IS NULL AND due_on IS NULL AND done_on IS NULL)
    OR
    (entry_type = 'payment' AND budget_id IS NOT NULL AND vendor_id IS NULL AND status IS NOT NULL AND (done_on IS NULL OR status = 'paid'))
  )
);
CREATE INDEX budget_entries_rev ON budget_entries (rev);
CREATE INDEX budget_entries_budget ON budget_entries (budget_id);
CREATE INDEX budget_entries_due ON budget_entries (entry_type, due_on);
