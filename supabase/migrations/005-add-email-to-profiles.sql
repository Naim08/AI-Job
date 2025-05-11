ALTER TABLE public.profiles
ADD COLUMN email TEXT NULL;

COMMENT ON COLUMN public.profiles.email IS 'User-editable email address for application profile purposes.';

-- Optional: Consider adding a UNIQUE constraint if emails in profiles should be unique
-- ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email); 