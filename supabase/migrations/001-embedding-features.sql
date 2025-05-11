-- Migration: Add features for embeddings script

-- 1. Add resume_text column to profiles table
ALTER TABLE public.profiles
ADD COLUMN resume_text TEXT NULL;

-- Make a comment about existing profiles not having resume_text
COMMENT ON COLUMN public.profiles.resume_text IS 'Stores the full resume text for a user. Populated by the embedding pipeline or user input.';

-- 2. Make FAQs user-specific
-- Add user_id to faq table, linking to auth.users
ALTER TABLE public.faq
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies for faq table
-- Drop existing public read policy
DROP POLICY IF EXISTS "public_read_faq" ON public.faq;

-- Allow users to select their own FAQs
CREATE POLICY "select_own_faq" ON public.faq
FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert/update/delete their own FAQs
CREATE POLICY "modify_own_faq" ON public.faq
FOR ALL USING (auth.uid() = user_id);

-- It's good practice to make user_id NOT NULL if all FAQs must belong to a user.
-- However, if you have existing global FAQs from 000-init.sql,
-- you'd need to assign them to a user or handle them before making this NOT NULL.
-- For new setups, making it NOT NULL is cleaner.
-- Consider: ALTER TABLE public.faq ALTER COLUMN user_id SET NOT NULL;
-- For now, leaving it nullable to avoid breaking existing data if any global FAQs were created.
-- If you run this on a fresh DB or after migrating existing global FAQs, you can add SET NOT NULL.

COMMENT ON COLUMN public.faq.user_id IS 'Foreign key linking the FAQ to a specific user in auth.users.';


-- 3. Make faq_chunks user-specific (and ensure it aligns with user-specific FAQs)
-- Add user_id to faq_chunks table, linking to auth.users
ALTER TABLE public.faq_chunks
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies for faq_chunks table
-- Drop existing public read policy
DROP POLICY IF EXISTS "public_read_faq_chunks" ON public.faq_chunks;

-- Allow users to select chunks related to their own FAQs
-- This policy assumes that if a user owns the parent FAQ, they can see its chunks.
-- This requires joining with the faq table to check ownership if faq_chunks.user_id is not directly the auth.uid()
-- For simplicity and directness, linking user_id here directly to auth.users is better.
CREATE POLICY "select_own_faq_chunks" ON public.faq_chunks
FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert/update/delete chunks related to their own FAQs
CREATE POLICY "modify_own_faq_chunks" ON public.faq_chunks
FOR ALL USING (auth.uid() = user_id);

-- Similar to faq.user_id, consider making this NOT NULL after data migration/on fresh setup.
-- Consider: ALTER TABLE public.faq_chunks ALTER COLUMN user_id SET NOT NULL;

COMMENT ON COLUMN public.faq_chunks.user_id IS 'Foreign key linking the FAQ chunk to a specific user in auth.users, typically matching the user_id of the parent FAQ.';

-- Note on existing data:
-- If you had global FAQs and faq_chunks from 000-init.sql:
-- 1. profiles: Will have `resume_text` as NULL.
-- 2. faq: Will have `user_id` as NULL. You might want to assign these to a specific admin user or delete them if they are test data.
-- 3. faq_chunks: Will have `user_id` as NULL. These should likely be updated to match their parent FAQ's new user_id or be deleted/re-processed.

-- For a clean slate after this migration, you might want to:
-- DELETE FROM public.faq WHERE user_id IS NULL;
-- DELETE FROM public.faq_chunks WHERE user_id IS NULL; (or based on faq_id whose user_id is NULL) 