-- Add cleared and cleared_at columns to expenses for tracking reimbursement status
-- When someone pays from their pocket, this marks it as reimbursed
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cleared boolean NOT NULL DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cleared_at timestamptz;