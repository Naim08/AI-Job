-- Enable pgvector extension
create extension if not exists "vector" with schema "extensions";

-- Profiles Table
create table if not exists "public"."profiles" (
    "id" uuid primary key default gen_random_uuid(),
    "user_id" uuid references auth.users(id) on delete cascade not null unique,
    "created_at" timestamp with time zone default timezone('utc', now()) not null,
    "updated_at" timestamp with time zone default timezone('utc', now()) not null,
    "full_name" text,
    "avatar_url" text
);
alter table "public"."profiles" enable row level security;
create policy "select_own_profile" on "public"."profiles" for select using (auth.uid() = user_id);
create policy "modify_own_profile" on "public"."profiles" for update using (auth.uid() = user_id);

-- FAQ Table
create table if not exists "public"."faq" (
    "id" uuid primary key default gen_random_uuid(),
    "question" text not null,
    "answer" text not null,
    "created_at" timestamp with time zone default timezone('utc', now()) not null
);
-- RLS for FAQ (assuming admin/public read, specific roles for write - not specified, so keeping it simple for now)
alter table "public"."faq" enable row level security;
create policy "public_read_faq" on "public"."faq" for select using (true);


-- Blacklist Companies Table
create table if not exists "public"."blacklist_companies" (
    "id" uuid primary key default gen_random_uuid(),
    "user_id" uuid references auth.users(id) on delete cascade not null,
    "company_name" text not null,
    "reason" text,
    "created_at" timestamp with time zone default timezone('utc', now()) not null,
    unique("user_id", "company_name")
);
alter table "public"."blacklist_companies" enable row level security;
create policy "select_own_blacklist_companies" on "public"."blacklist_companies" for select using (auth.uid() = user_id);
create policy "modify_own_blacklist_companies" on "public"."blacklist_companies" for all using (auth.uid() = user_id);


-- Job Applications Table
create table if not exists "public"."job_applications" (
    "id" uuid primary key default gen_random_uuid(),
    "user_id" uuid references auth.users(id) on delete cascade not null,
    "job_title" text not null,
    "company_name" text not null,
    "status" text, -- e.g., applied, interviewing, offer, rejected
    "applied_at" timestamp with time zone default timezone('utc', now())  not null,
    "notes" text,
    "created_at" timestamp with time zone default timezone('utc', now())  not null,
    "updated_at" timestamp with time zone default timezone('utc', now())  not null
);
alter table "public"."job_applications" enable row level security;
create policy "select_own_job_applications" on "public"."job_applications" for select using (auth.uid() = user_id);
create policy "modify_own_job_applications" on "public"."job_applications" for all using (auth.uid() = user_id);

-- Application Answers Table
create table if not exists "public"."application_answers" (
    "id" uuid primary key default gen_random_uuid(),
    "application_id" uuid references public.job_applications(id) on delete cascade not null,
    "question" text not null,
    "answer" text,
    "created_at" timestamp with time zone default timezone('utc', now())  not null
    -- No direct user_id, RLS inherited via job_applications if joined.
    -- Or, could add user_id here as well for direct RLS if needed.
    -- For now, assuming access is managed via job_applications.
);
alter table "public"."application_answers" enable row level security;
-- Policy requires checking ownership of the parent job_application
create policy "select_application_answers_if_owner_of_application" on "public"."application_answers"
    for select using (
        auth.uid() = (
            select user_id from public.job_applications where id = application_id
        )
    );
create policy "modify_application_answers_if_owner_of_application" on "public"."application_answers"
    for all using (
        auth.uid() = (
            select user_id from public.job_applications where id = application_id
        )
    );


-- Resume Chunks Table
create table if not exists "public"."resume_chunks" (
    "id" uuid primary key default gen_random_uuid(),
    "user_id" uuid references auth.users(id) on delete cascade not null,
    "resume_text_content" text not null,
    "embedding" extensions.vector(768), -- Assuming pgvector is in extensions schema
    "created_at" timestamp with time zone default timezone('utc', now())  not null,
    "source_document_name" text -- e.g., filename or resume version
);
alter table "public"."resume_chunks" enable row level security;
create policy "select_own_resume_chunks" on "public"."resume_chunks" for select using (auth.uid() = user_id);
create policy "modify_own_resume_chunks" on "public"."resume_chunks" for all using (auth.uid() = user_id);


-- FAQ Chunks Table
create table if not exists "public"."faq_chunks" (
    "id" uuid primary key default gen_random_uuid(),
    "faq_id" uuid references public.faq(id) on delete cascade not null,
    "chunk_text" text not null,
    "embedding" extensions.vector(768), -- Assuming pgvector is in extensions schema
    "created_at" timestamp with time zone default timezone('utc', now())  not null
);
-- RLS for FAQ Chunks (assuming admin/public read, specific roles for write - not specified, so keeping it simple)
alter table "public"."faq_chunks" enable row level security;
create policy "public_read_faq_chunks" on "public"."faq_chunks" for select using (true);


-- Ensure created_at and updated_at are automatically managed for profiles
create or replace function "public"."handle_profile_updated_at"()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now()) ;
  return new;
end;
$$ language plpgsql security definer;

create trigger "on_profile_update_set_updated_at"
before update on "public"."profiles"
for each row execute procedure "public"."handle_profile_updated_at"();

-- Ensure created_at and updated_at are automatically managed for job_applications
create or replace function "public"."handle_job_application_updated_at"()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql security definer;

create trigger "on_job_application_update_set_updated_at"
before update on "public"."job_applications"
for each row execute procedure "public"."handle_job_application_updated_at"();

-- Note on RLS for application_answers and faq_chunks:
-- application_answers policies check ownership through the job_applications table.
-- faq_chunks are public read, similar to faq.
-- If faq or faq_chunks need stricter write controls, those policies would need to be defined (e.g., based on a role). 