-- Where the user lives or dresses from (free text, e.g. "Pakistan", "UK, South Asian family"), so the
-- stylist can respect local dress codes, climate and cultural events. Optional; null means not given.
-- Additive only: existing rows keep null, and the existing profile policies cover the new column.

alter table public.profiles
  add column region text
    constraint profiles_region_length check (char_length(region) <= 60);
