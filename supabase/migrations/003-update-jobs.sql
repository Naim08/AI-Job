-- Add new columns to job_applications table
ALTER TABLE public.job_applications
ADD COLUMN job_id TEXT NULL, -- Stores the external job ID from LinkedIn
ADD COLUMN job_url TEXT NULL,
ADD COLUMN job_description TEXT NULL,
ADD COLUMN reason TEXT NULL;

-- Add a unique constraint for user_id and job_id
-- This is crucial for the upsert logic to prevent duplicates
ALTER TABLE public.job_applications
ADD CONSTRAINT unique_user_job_id UNIQUE (user_id, job_id);

-- Optional: Make job_id NOT NULL if every scanned job must have one
-- ALTER TABLE public.job_applications ALTER COLUMN job_id SET NOT NULL;
-- (Consider implications if you have existing rows without it)

COMMENT ON COLUMN public.job_applications.job_id IS 'External job identifier, e.g., from LinkedIn.';
COMMENT ON COLUMN public.job_applications.job_url IS 'Direct URL to the job posting.';
COMMENT ON COLUMN public.job_applications.job_description IS 'Full description of the job.';
COMMENT ON COLUMN public.job_applications.reason IS 'Reason why a job application was skipped or has a certain status.';