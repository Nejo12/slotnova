/**
 * `citext` column type (PostgreSQL `citext` extension, enabled by the identity
 * migration, T031). Used for `email` columns so equality/uniqueness is
 * case-insensitive without repository-level normalization (data-model.md
 * `User.email`, `Invitation.email`).
 *
 * Drizzle has no built-in `citext` type; this is the documented
 * `customType` escape hatch. Local to `identity` — not a shared/dumping-ground
 * package (constitution VI).
 */
import { customType } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});
