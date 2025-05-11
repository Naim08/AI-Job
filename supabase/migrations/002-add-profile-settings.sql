-- Migration to add a settings column to the profiles table
ALTER TABLE public.profiles
ADD COLUMN settings JSONB;

COMMENT ON COLUMN public.profiles.settings IS 'User-specific settings, e.g., for job filters (keywords, locations).'; 