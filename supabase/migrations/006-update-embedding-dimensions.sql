-- Clear existing potentially incompatible embeddings
DELETE FROM public.resume_chunks;
DELETE FROM public.faq_chunks;

-- Alter embedding columns to accept 1536 dimensions
ALTER TABLE public.resume_chunks
ALTER COLUMN embedding TYPE vector(1536);

ALTER TABLE public.faq_chunks
ALTER COLUMN embedding TYPE vector(1536);

-- Optional: Re-enable Row Level Security if you disabled it for the migration
-- Ensure your policies are correctly set up for these tables.
-- ALTER TABLE public.resume_chunks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.faq_chunks ENABLE ROW LEVEL SECURITY;

-- Note: If you previously had a MATCH_DOCUMENTS or similar function
-- that was specific to 768 dimensions, you might need to update
-- its definition as well if the dimension was hardcoded there.
-- Check your Supabase Edge Functions or database functions. 