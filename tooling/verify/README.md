# tooling/verify

Low-noise wrapper around the repository's existing pnpm gates.

- `pnpm verify:fast` -- format, lint, boundaries, typecheck, test, build, contract checks
- `pnpm verify:integration` -- real-PostgreSQL integration tests, then Playwright e2e
- `pnpm verify:pr` -- `fast` then `integration`, stopping at the first failure

Each check's full stdout/stderr is written to a temp file under the OS temp
directory (printed at the start of the run); only a one-line PASS/FAIL per
check reaches the terminal. On failure the command, exit status, a bounded
tail of output, and the full log path are printed.

`verify:integration` does not install Playwright/browser dependencies --
run `pnpm --filter @slotnova/web exec playwright install --with-deps
chromium` first, as CI does.

Spawned checks default `SLOTNOVA_ENV` to `local` (the value documented in
`.env.example`) only when it is not already set in the caller's
environment -- an explicit value always wins. CI and other provider
environments remain responsible for setting their own intended
`SLOTNOVA_ENV` explicitly.
