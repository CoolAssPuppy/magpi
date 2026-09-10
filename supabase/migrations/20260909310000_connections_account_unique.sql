-- One connection per account per provider per space. Two indexes, because nulls compare distinct.

create unique index connections_account_idx
  on public.connections (space_id, user_id, provider, external_account_id)
  where external_account_id is not null;

create unique index connections_no_account_idx
  on public.connections (space_id, user_id, provider)
  where external_account_id is null;
