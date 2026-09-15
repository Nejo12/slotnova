# Deployment foundation (T072, T075)

R1 is **FOUNDER-APPROVED, 2026-09-15**: [decision and primary-source evidence](../decisions/0001-hosting-postgres-provider.md). AWS Frankfurt (`eu-central-1`) remains provisional. This PR provisions **no AWS resources, IAM roles, secrets, runners, DNS, certificates, alarms or deployment environments**. No hosted result or production readiness is claimed. T079 belongs to PR-00; T076+ and full T087 remain separate.

## Topology and traffic

Use RDS PostgreSQL 18 with a production **Multi-AZ DB instance** (synchronous standby, not Aurora or the three-instance cluster product). Place separate API and worker ECS/Fargate services in private subnets in the same region. Security groups admit PostgreSQL only from the two runtime services and the controlled release path. Never expose RDS publicly. Publish the Vite build from private S3 through CloudFront with origin access control.

CloudFront serves web and `/v1/*` on the same HTTPS origin. API behavior must disable caching, forward methods, cookies, query parameters and security/CORS headers, preserve `Set-Cookie`, and never apply SPA fallback to API errors. Restrict direct ALB origin access. Configure `API_TRUST_PROXY` with reviewed ALB subnet IP/CIDR ranges, never `true`, arbitrary hop counts or universal networks. The proxy chain must overwrite untrusted forwarding headers; test actual client IPs before enabling traffic. Defaults trust no proxy. The SPA reads the secure `__Host-slotnova_csrf` cookie first, then the local-development cookie; session cookies remain HttpOnly.

The worker connects directly to RDS using session-capable PostgreSQL. No PgBouncer transaction pooling, RDS Proxy multiplexing or pooled endpoint is accepted for its advisory-lock connection. Declaring `direct` is an operator assertion: configuration rejects common pooler ports/names but cannot discover an opaque proxy. Hosted validation must prove the actual path.

## Environment and secret ownership

Every executable/build boundary requires `SLOTNOVA_ENV=local|preview|staging|production`. CI uses `preview`; `NODE_ENV` is not the deployment class. Server hosted security restrictions also apply whenever `NODE_ENV=production`; Vite uses production mode for ordinary preview builds, so its hosted policy follows `SLOTNOVA_ENV`. The thin `@slotnova/deployment-config` package shares the environment enum; API/worker/web own their Zod schemas. Database connection parsing remains in `@slotnova/db`.

| Surface | Local | Preview / CI | Staging / production |
| --- | --- | --- | --- |
| API | Developer-owned ignored env, disposable DB | Testcontainers credentials generated per run | Separate environment Secrets Manager secret for ordinary API login; ECS injects only API values |
| Worker | Separate disposable worker login | Disposable direct PG and scheduler schema | Worker-only secret, direct endpoint, scheduler schema role; no migration secret |
| Business release | Explicit local migrator login | Ordinary isolated migration owner in tests | Release-only business owner secret; never an ECS runtime secret |
| Scheduler release | Separate scheduler release login | Separate tested scheduler owner membership | Release-only login able to assume NOLOGIN scheduler owner |
| Web | Public localhost API origin | Public test origin; E2E harness only in test server | Public same-origin configuration; **no secret** injected at build time |

Founder/platform operator owns environment configuration, IAM access, rotation and release authorization. Developers own local disposable values. Use `.env.example` only as a placeholder reference; it intentionally shows several process surfaces and must not be injected wholesale into hosted services. API rejects worker/business-migration credentials; worker rejects API/business-migration credentials. Host secrets in separate AWS accounts/environments or equivalently isolated IAM resources. Never copy production data or secrets into previews. Rotate through the approved secret version and restart affected tasks; prove old credentials are revoked without logging URLs.

API requires `DATABASE_URL`; worker requires `WORKER_DATABASE_URL`. Hosted connections require passwords, `DATABASE_SSL=require`, explicit direct connection mode and certificate trust through a mounted approved RDS CA bundle (`NODE_EXTRA_CA_CERTS`, set before Node starts). URL SSL query overrides are rejected. Node verifies the certificate chain and hostname; never use `NODE_TLS_REJECT_UNAUTHORIZED=0`. Connect timeout defaults to 10 seconds; pool max defaults to 10, bounded at 100. Set reviewed statement timeouts per role; migration statement limits differ from request limits.

Hosted API requires secure cookies, HSTS, explicit HTTPS CORS origins and `API_CREDENTIAL_ADAPTER=disabled`. The development credential adapter is forbidden. **Production sign-in remains disabled until the separately approved real identity-provider adapter exists**; this foundation does not select or implement R5. Default API port is 3001 and host `0.0.0.0`. Invalid configuration fails before listening. Readiness and bootstrap reject superuser/BYPASSRLS, privileged-role membership and ownership of public business tables.

Hosted web builds require `VITE_API_URL=` and `VITE_E2E=false`; unknown `VITE_*` variables fail the build to prevent accidental publication. Only these two public variables are supported. Never inject server environment secrets into Vite. Local defaults use `http://localhost:3001`.

## Roles, releases and runtime

Follow [migration release](migration-release.md) for bootstrap grants, business migration then scheduler initialization/upgrade, followed by compatible API/worker rollout. Startup never runs business migrations. Hosted worker enforces `WORKER_SCHEDULER_MIGRATE=false`; its scheduler pool and outbox pool remain separate. `pgboss` belongs to pg-boss; `public.outbox_records` belongs to Slotnova. Worker scheduler-owner membership is deliberate because queue creation/partition operations require schema DDL; it does not grant business ownership.

Start with one API and one worker replica, provisional 0.25 vCPU/1 GiB, and RDS `db.t4g.small`/20 GiB gp3 per R1; validate capacity and actual engine/instance availability before purchase. A single API replica is not application HA. Budget database sessions as API pool 10 + worker pool 10 (including the dedicated ownership session) + scheduler pool 10, multiplied by simultaneous replicas including rollout overlap, plus release/admin reserve. Worker pool minimum is four; `WORKER_SCHEDULER_POOL_MAX` independently bounds pg-boss sessions. Set `max_connections`, CPU and memory alerts before scaling.

Authentication and invitation preview limits are **per API process**, bounded counters (default 20 requests per 60 seconds, max 10,000 keys). Authentication and CSRF issuance have separate buckets; previews have both IP and hashed-token buckets. Capacity exhaustion fails closed with stable RFC 9457 429 responses and `Retry-After`; no token plaintext or database mutation is involved. Rolling overlap/restarts change the aggregate budget; do not claim a global account/IP quota. Before increasing replicas, approve a coordinated edge/distributed limit and test proxy attribution. Do not add an unapproved broker in this foundation.

API `/healthz` is process liveness; `/readyz` checks the actual database, migration state and role guard. Configure ALB health checks against readiness after verifying deployed paths. Worker has no HTTP endpoint: use process/task health and existing structured readiness/start/stop/error logs. Task restart must fail readiness or fail startup when the schema is incompatible; deploy no traffic until verified.

On SIGTERM the API closes through Nest shutdown hooks. Worker stops polling and drains the active outbox handler before closing its ownership session; that handler drain has no universal timeout. pg-boss graceful stop has a 30-second timeout. Configure ECS stop timeout from measured handler duration plus scheduler shutdown, and test forced termination; do not assume every handler drains before ECS kills the task. On crash/disconnect PostgreSQL releases the advisory lock; another worker reclaims abandoned outbox records. There is no elapsed-time lease takeover. Database failover may drop sessions: test reconnection, ownership loss and eventual processing before production. Outbox delivery is at least once; existing consumer receipts protect duplicate side effects.

## Backups, operations and release acceptance

Configure encrypted automated RDS backups, provisionally 7-day staging / 14-day production retention, deletion protection and a final snapshot before approved destruction. Initial objectives RPO 15 minutes / RTO 2 hours are targets, not measured guarantees. Multi-AZ is availability, not backup or protection from operator mistakes. Restore snapshots/PITR into an isolated instance, validate migrations/RLS/counts and sampled integrity, then rehearse controlled endpoint/secret cutover. Never overwrite the only healthy source. Record restore duration, chosen recovery time, data loss and recovery owner; obtain approval before accepting new production writes after cutover.

Platform owns AWS metrics, log retention/access, backup alerts, ECS/RDS health and on-call escalation. Application logs keep the existing correlation/redaction boundary: no credentials, cookies, invitation tokens or job payloads. Product audit events remain application-owned; CloudWatch is not a second business audit store. Detailed observability implementation remains PR-18/T076+.

## Evidence and mandatory hosted pre-production checklist

Local real PostgreSQL tests cover clean/populated forward business CLI, restricted scheduler release and runtime queue operations, role rejection, FORCE RLS, transaction-local context, outbox concurrency and crash recovery. Local security/config tests cover 429s, headers/CORS/CSRF, unsafe hosted config and secure cookie selection. CI repeats the committed workflows; their check results are evidence only after green. AWS documentation links in R1 support the selected design, not a hosted test result.

All items below remain **unverified on AWS**:

- [ ] Confirm actual RDS PG18 minor and chosen instance/Multi-AZ availability in `eu-central-1`; approve cost and region.
- [ ] Confirm `citext`, `btree_gist`, UUID, JSONB, ranges and exclusion constraints on that exact version.
- [ ] Bootstrap separate roles/grants; prove API cannot assume any business/admin owner, and worker owns only scheduler operations.
- [ ] Prove ENABLE + FORCE RLS, cross-tenant denial and `SET LOCAL` rollback/reset over actual connections.
- [ ] Kill the worker's direct advisory-lock session; prove no premature reclamation and eventual recovery after lock release.
- [ ] Initialize/upgrade pinned pg-boss separately; prove ordinary worker queue/partition/schedule permissions and startup with migrations disabled.
- [ ] Test trusted CA success, untrusted CA and wrong-hostname failure; rehearse RDS CA rotation.
- [ ] Trigger Multi-AZ failover; measure API/worker outage, transaction outcomes, reconnect and owner-lock recovery.
- [ ] Restore a backup to an isolated instance and measure integrity and RTO.
- [ ] Perform PITR restore and measure achieved RPO/RTO; rehearse approved endpoint cutover.
- [ ] Restart and force-kill ECS tasks; prove shutdown, reconnect, duplicate protection and readiness behavior.
- [ ] Verify same-origin CloudFront/ALB secure cookies, workspace switch/logout, no API caching, CSRF/CORS and real client-IP attribution.
- [ ] Confirm private release runner isolation, Founder-only dispatch, protected secret access, exact-main release SHA and environment control entitlement before enabling releases.

Record dated evidence and an operator for each item. Do not turn documentation review or Testcontainers evidence into checked hosted boxes.
