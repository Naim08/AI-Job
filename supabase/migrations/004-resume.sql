-- Add resume_path column to profiles table
ALTER TABLE public.profiles
ADD COLUMN resume_path TEXT NULL;

COMMENT ON COLUMN public.profiles.resume_path IS 'Path to the cached resume PDF in the application\'s user data directory.'; 