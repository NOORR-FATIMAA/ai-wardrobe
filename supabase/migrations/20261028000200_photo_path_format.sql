-- Wardrobe photos live flat in the owner's folder: "<user id>/<name>.<jpg|jpeg|png|webp>", where
-- <name> is 1-128 letters, digits, "_" or "-". That rules out other users' folders, nested folders,
-- and traversal or encoded segments ("..", "/", "%"). The app already uploads names like
-- "1761234567890-k3j9x2ab.jpg". supabase/functions/_shared/photo_path.ts checks the same format.
--
-- Both rules below use one anchored regular expression on the whole name, rather than
-- storage.foldername(): that helper is defined by Supabase Storage, not in this repository, so its
-- exact handling of edge cases (no folder, leading or trailing "/") cannot be verified here. In
-- PostgreSQL's default (non-newline-sensitive) regex mode "^" and "$" anchor the whole string, and
-- "::" binds tighter than "||", so the pattern is '^' || <uuid as text> || '/...$'. A null auth.uid()
-- makes the whole expression null, which denies the insert.

-- 1. wardrobe_items.image_path must point into the owner's folder, in that format.
--    Refuse to continue (changing nothing) if existing rows do not match; they are not modified.
do $$
declare
  mismatched integer;
begin
  select count(*) into mismatched
  from public.wardrobe_items
  where image_path is not null
    and image_path !~ ('^' || user_id::text || '/[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$');

  if mismatched > 0 then
    raise exception 'wardrobe_items has % row(s) whose image_path is not "<owner id>/<name>.<jpg|jpeg|png|webp>"; nothing was changed', mismatched
      using hint = 'List them with: select id, user_id, image_path from public.wardrobe_items where image_path is not null and image_path !~ (''^'' || user_id::text || ''/[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$'');';
  end if;
end;
$$;

alter table public.wardrobe_items
  add constraint wardrobe_items_image_path_format check (
    image_path is null
    or image_path ~ ('^' || user_id::text || '/[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$')
  );

-- 2. Uploads: same format, in the caller's own folder. Replaces the folder-only insert policy from
--    20261026000000_init. The read, update and delete policies are unchanged. Existing objects are
--    not touched; the policy applies to new uploads only.
drop policy "wardrobe insert own" on storage.objects;

create policy "wardrobe insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wardrobe'
    and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$')
  );
