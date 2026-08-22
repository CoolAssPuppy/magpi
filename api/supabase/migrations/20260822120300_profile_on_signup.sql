-- Create a profile row for every new auth user.
--
-- Without this, a freshly signed-up user has no profiles row, so the badge's
-- first gateway call and the claim response both return a null handle and
-- display name. The badge would pair successfully and then show a blank
-- identity, which reads as a pairing failure to the person holding it.
--
-- Runs as a trigger rather than from application code so it cannot be
-- skipped by whichever sign-in path the user took (GitHub OAuth, magic
-- link, or password).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text;
begin
  -- Prefer the provider's handle. GitHub sends user_name; other providers
  -- vary, so fall back through the usual keys and finally to the local part
  -- of the email.
  v_handle := coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'nickname',
    split_part(coalesce(new.email, ''), '@', 1)
  );

  -- handle is unique. Two GitHub accounts cannot collide, but an email local
  -- part can collide with someone's GitHub handle, so fall back to null
  -- rather than failing the signup: a user can set their handle later, and a
  -- failed insert here would abort account creation entirely.
  if v_handle = '' then
    v_handle := null;
  elsif exists (select 1 from public.profiles where handle = v_handle) then
    v_handle := null;
  end if;

  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    v_handle,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      v_handle
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
