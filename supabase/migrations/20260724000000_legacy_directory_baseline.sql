-- Reconstruct the legacy directory tables that pre-date the checked-in
-- delivery migrations.  Keep this migration intentionally small: later
-- migrations own RLS, grants, optional columns, and all write workflows.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.places (
  id uuid primary key default extensions.gen_random_uuid(),
  title varchar(150) not null,
  category varchar(50) not null,
  phone varchar(20) not null,
  whatsapp varchar(20),
  description text,
  images text[] default '{}'::text[],
  is_featured boolean default false,
  created_at timestamptz default now(),
  instapay_vfcash varchar(30)
);

create table if not exists public.drivers (
  id uuid primary key default extensions.gen_random_uuid(),
  name varchar(100) default 'كابتن توصيل',
  phone varchar(20) not null,
  whatsapp varchar(20),
  is_active boolean default true,
  active_until timestamptz default (now() + interval '2 hours'),
  created_at timestamptz default now()
);

create table if not exists public.pending_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  title varchar(150) not null,
  category varchar(50) not null,
  phone varchar(20) not null,
  whatsapp varchar(20),
  description text,
  images text[] default '{}'::text[],
  status varchar(20) default 'pending',
  created_at timestamptz default now(),
  instapay_vfcash varchar(30)
);

create table if not exists public.feedback_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  place_name_or_phone varchar(150) not null,
  feedback_type varchar(50) not null,
  contact_phone varchar(20) not null,
  notes text not null,
  images text[] default '{}'::text[],
  status varchar(20) default 'pending',
  created_at timestamptz default now()
);

comment on table public.places is
  'Legacy service directory; marketplace products use the commerce tables.';
comment on table public.drivers is
  'Legacy public driver records retained for migration compatibility.';
