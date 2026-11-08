-- Updates (renames, moves, overwrites) must leave a photo in the same flat, owner-only format that
-- 20261028000200_photo_path_format requires for uploads: "<user id>/<name>.<jpg|jpeg|png|webp>",
-- where <name> is 1-128 letters, digits, "_" or "-".
--
-- 20261026000000_init created "wardrobe update own" with USING only. Without WITH CHECK, PostgreSQL
-- checks the new row against USING, which only requires the first folder to be the caller's, so an
-- object could be moved to "<uid>/sub/x.png" or "<uid>/bad name.png" even though uploads cannot
-- create those names.
--
-- USING is kept exactly as before, so users can still update any object in their own folder,
-- including older ones whose names predate the format. WITH CHECK requires the result to match the
-- upload format, anchored to the caller. The app never updates, moves or renames photos (uploads do
-- not use upsert), so its behaviour is unchanged. SELECT, INSERT and DELETE policies are unchanged.
-- A null auth.uid() makes the expression null, which denies the update.

drop policy "wardrobe update own" on storage.objects;

create policy "wardrobe update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (
    bucket_id = 'wardrobe'
    and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$')
  );
