/**
 * Transaction-rollback test helper.
 *
 * `docs/testing/strategy.md` §5: prefer transaction rollback for fast, isolated
 * database tests; tests that need real commits (locking, constraint interaction,
 * concurrency) use isolated databases/schemas instead (see `./isolation.ts`).
 */
import { Client } from "pg";
import type { ClientBase } from "pg";

/**
 * Run `fn` inside a transaction that is **always rolled back**, so the database
 * is left untouched regardless of what `fn` wrote. Accepts either an existing
 * connected client (reused, not closed) or a connection string (a client is
 * opened and closed for the call).
 *
 * The value returned by `fn` is passed through, but any rows it wrote are gone.
 */
export async function withRolledBackTransaction<T>(
  target: ClientBase | string,
  fn: (tx: ClientBase) => Promise<T>,
): Promise<T> {
  const ownsClient = typeof target === "string";
  const client: ClientBase = ownsClient ? new Client({ connectionString: target }) : target;
  if (ownsClient) {
    await (client as Client).connect();
  }

  try {
    await client.query("BEGIN");
    try {
      return await fn(client);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    if (ownsClient) {
      await (client as Client).end();
    }
  }
}
