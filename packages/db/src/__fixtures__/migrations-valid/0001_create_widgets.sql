-- Fixture migration (test-only). Not a Slotnova domain schema.
CREATE TABLE public.widgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
