alter table public.account_requests
  drop constraint if exists account_requests_check1;

alter table public.account_requests
  drop constraint if exists account_requests_place_selection_check;

alter table public.account_requests
  add constraint account_requests_place_selection_check
  check (
    kind <> 'merchant'
    or (
      (place_mode = 'existing' and existing_place_id is not null)
      or (
        place_mode = 'new'
        and existing_place_id is null
        and char_length(trim(coalesce(place_title, ''))) between 2 and 150
        and place_category in (
          'restaurants', 'stores', 'home_made', 'market', 'veggies',
          'pharmacy', 'crafts', 'services'
        )
      )
    )
  );
