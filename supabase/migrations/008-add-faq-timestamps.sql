-- Add last_learned_at column to faq table
ALTER TABLE faq ADD COLUMN last_learned_at TIMESTAMPTZ DEFAULT NOW(); 