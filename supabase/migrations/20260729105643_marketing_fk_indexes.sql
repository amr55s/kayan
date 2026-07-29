create index if not exists marketing_channels_created_by_idx
  on public.marketing_channels (created_by)
  where created_by is not null;

create index if not exists marketing_campaigns_created_by_idx
  on public.marketing_campaigns (created_by)
  where created_by is not null;

create index if not exists marketing_publications_published_by_idx
  on public.marketing_publications (published_by)
  where published_by is not null;
