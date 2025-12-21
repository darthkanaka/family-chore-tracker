-- =====================================================
-- SUPABASE SCHEMA FOR FAMILY CHORE TRACKER
-- Run this in: Supabase Dashboard → SQL Editor
-- =====================================================

-- Enable UUID extension (optional, we're using bigint IDs to match Firebase)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: family_members
-- Stores family member info including contact details
-- =====================================================
CREATE TABLE family_members (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  phone TEXT,                    -- For SMS reminders (e.g., '+18081234567')
  email TEXT,                    -- For email/calendar invites
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert your family members
INSERT INTO family_members (name) VALUES ('Kawika'), ('Jordyn');

-- =====================================================
-- TABLE: chores
-- Master list of all chores
-- =====================================================
CREATE TABLE chores (
  id BIGINT PRIMARY KEY,         -- Using Firebase's timestamp-based IDs
  name TEXT NOT NULL,
  frequency_days INT NOT NULL,   -- Days between occurrences
  assigned_to TEXT NOT NULL,     -- References family_members.name
  last_completed TIMESTAMPTZ,
  completed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by assignment
CREATE INDEX idx_chores_assigned_to ON chores(assigned_to);

-- =====================================================
-- TABLE: completion_history
-- Record of all completed tasks
-- =====================================================
CREATE TABLE completion_history (
  id BIGINT PRIMARY KEY,         -- Using Firebase's timestamp-based IDs
  chore_id BIGINT REFERENCES chores(id) ON DELETE SET NULL,
  chore_name TEXT NOT NULL,      -- Denormalized for history preservation
  completed_date TIMESTAMPTZ NOT NULL,
  completed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_completion_history_chore_id ON completion_history(chore_id);
CREATE INDEX idx_completion_history_completed_date ON completion_history(completed_date);
CREATE INDEX idx_completion_history_completed_by ON completion_history(completed_by);

-- =====================================================
-- TABLE: change_log
-- Audit trail of all changes
-- =====================================================
CREATE TABLE change_log (
  id BIGINT PRIMARY KEY,         -- Using Firebase's timestamp-based IDs
  action TEXT NOT NULL,          -- 'completed', 'edited', 'deleted', etc.
  chore_name TEXT NOT NULL,
  person TEXT NOT NULL,          -- Who made the change
  timestamp TIMESTAMPTZ NOT NULL,
  details TEXT,                  -- Human-readable description
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for chronological queries
CREATE INDEX idx_change_log_timestamp ON change_log(timestamp DESC);

-- =====================================================
-- VIEW: chores_due
-- Computed view showing when each chore is due
-- Useful for n8n queries and calendar feeds
-- =====================================================
CREATE VIEW chores_due AS
SELECT
  c.*,
  fm.phone,
  fm.email,
  (c.last_completed + (c.frequency_days || ' days')::INTERVAL) AS next_due,
  DATE_PART('day',
    (c.last_completed + (c.frequency_days || ' days')::INTERVAL) - NOW()
  )::INT AS days_until_due,
  CASE
    WHEN c.last_completed IS NULL THEN true
    WHEN (c.last_completed + (c.frequency_days || ' days')::INTERVAL) <= NOW() THEN true
    ELSE false
  END AS is_overdue,
  CASE
    WHEN c.last_completed IS NULL THEN true
    WHEN (c.last_completed + (c.frequency_days || ' days')::INTERVAL)::DATE = CURRENT_DATE THEN true
    ELSE false
  END AS is_due_today
FROM chores c
LEFT JOIN family_members fm ON c.assigned_to = fm.name;

-- =====================================================
-- VIEW: weekly_stats
-- Statistics for the current week
-- =====================================================
CREATE VIEW weekly_stats AS
SELECT
  completed_by,
  COUNT(*) as completions
FROM completion_history
WHERE completed_date >= NOW() - INTERVAL '7 days'
GROUP BY completed_by;

-- =====================================================
-- VIEW: monthly_stats
-- Statistics for the current month
-- =====================================================
CREATE VIEW monthly_stats AS
SELECT
  completed_by,
  COUNT(*) as completions
FROM completion_history
WHERE completed_date >= NOW() - INTERVAL '30 days'
GROUP BY completed_by;

-- =====================================================
-- FUNCTION: Update timestamp on chore edit
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chores_updated_at
  BEFORE UPDATE ON chores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY (Optional - enable if needed)
-- For now, disabled since this is a family app
-- =====================================================
-- ALTER TABLE chores ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE completion_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPFUL QUERIES FOR n8n / AUTOMATION
-- =====================================================

-- Get all chores due today or overdue (for morning reminder):
-- SELECT * FROM chores_due WHERE is_overdue = true OR is_due_today = true;

-- Get chores due in next 2 days (for advance notice):
-- SELECT * FROM chores_due WHERE days_until_due <= 2 AND days_until_due >= 0;

-- Get today's completions (for end-of-day summary):
-- SELECT * FROM completion_history WHERE completed_date::DATE = CURRENT_DATE;
