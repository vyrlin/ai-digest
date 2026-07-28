-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query)

create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  date date not null,
  title text not null,
  summary text not null,       -- short teaser for the list page
  body_markdown text not null, -- full digest article, in Markdown
  sources jsonb not null default '[]'::jsonb, -- [{name, url, title}] items used that day
  created_at timestamptz not null default now()
);

create index if not exists digests_date_idx on digests (date desc);

-- Enable Row Level Security
alter table digests enable row level security;

-- Anyone can READ digests (needed for the public static site)
create policy "Public can read digests"
  on digests for select
  using (true);

-- Only the service_role key (used by the GitHub Action) can INSERT/UPDATE.
-- No policy is created for insert/update/delete, so the public anon key
-- cannot write — only the service_role key can, and it bypasses RLS by design.
