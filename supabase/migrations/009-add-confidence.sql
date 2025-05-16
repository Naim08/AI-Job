ALTER TABLE application_answers
ADD COLUMN confidence REAL DEFAULT 0.5;

-- Update existing rows to a default, for example, setting to 0.5 for existing answers:
UPDATE application_answers
SET confidence = 0.5
WHERE confidence IS NULL;

-- Add a check constraint to enforce 0-1 range at DB level
ALTER TABLE application_answers
ADD CONSTRAINT confidence_check CHECK (confidence >= 0 AND confidence <= 1); 