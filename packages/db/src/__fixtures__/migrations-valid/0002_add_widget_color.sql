-- Fixture migration (test-only): additive expand-style column.
ALTER TABLE public.widgets ADD COLUMN color text;
