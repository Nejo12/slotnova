#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
# Synthetic, nonfunctional key generated at runtime so it is not committed.
printf 'github_token = "%s%s"\n' ghp_ aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6 > "$scratch/secret.txt"
set +e
gitleaks dir "$scratch" --redact --no-banner > "$scratch/secret-result" 2>&1
result=$?
set -e
if [ "$result" -ne 1 ]; then echo 'Secret scanner failed its positive control' >&2; exit 1; fi
# Each rule must independently detect a positive control.
for source in 'eval(input);' 'const tls = { rejectUnauthorized: false };' 'exec(req.body.command);' 'db.query(request.query.sql);'; do
  printf '%s\n' "$source" > "$scratch/unsafe.ts"
  set +e
  semgrep scan --config tooling/security/semgrep.yml --error --strict --metrics=off --disable-version-check "$scratch/unsafe.ts" > "$scratch/sast-result" 2>&1
  result=$?
  set -e
  if [ "$result" -ne 1 ]; then cat "$scratch/sast-result"; echo 'SAST failed its positive control' >&2; exit 1; fi
done
printf 'db.query("SELECT id FROM users WHERE id=$1", [request.query.id]);\n' > "$scratch/safe.ts"
semgrep scan --config tooling/security/semgrep.yml --error --strict --metrics=off --disable-version-check "$scratch/safe.ts" > "$scratch/safe-result" 2>&1
