# Release strategy

## Present state

`ci.yml` tests pull requests and main pushes, checks migrations against a disposable PostgreSQL service, enforces 85% API coverage, and builds the runtime container. Successful main pushes additionally publish an image to GHCR using the built-in short-lived GitHub token. The image digest is written to the job summary. This is CI plus artifact delivery, not a completed application deployment pipeline. These jobs have not run remotely yet.

## GitHub bootstrap

The existing public repository is `Nagoor06/commutecircle`; preserve its license and visibility. The foundation is submitted on `chore/modular-foundation` for CI validation before merging. See [Windows setup](windows-setup.md) to clone it with GitHub Desktop.

Repository settings to configure: required `API checks` on main, block force pushes/deletion, resolve review conversations, squash merges, automatic branch deletion, Dependabot alerts. CODEOWNERS is present but does not by itself enforce review. Availability of rules and protected environments depends on account and repository plan; verify support before relying on them.

## Hosting decision and CD work

Proposed fit: Azure Container Apps and managed PostgreSQL, building on existing Azure familiarity. Do not provision paid resources until the owner selects the account, region, and budget. The current repository does not contain a provider deployment workflow or infrastructure resources.

Before the first staging deployment:
1. Define infrastructure as code, database connectivity, secret injection, TLS, health probes, resource limits, and cost limits.
2. Add a dependency vulnerability check, secret scan, container vulnerability scan, SBOM and build provenance. Resolve findings before promotion; do not silently disable gates.
3. Configure GitHub-to-cloud OIDC using the actual repository/environment identity and least-privilege roles. No permanent cloud password in GitHub.
4. Configure separate staging and production environments, database instances/roles and secrets. Verify environment approval support for the selected GitHub plan.
5. Implement CD after successful CI: publish one image, record its digest, run backward-compatible migrations as a single controlled job, deploy that digest to staging, run readiness and API smoke tests, then promote the same digest to production through an explicit release gate.
6. Add release records with commit SHA, image digest, migration revision, tests and timestamps. Do not rebuild a different image for production.

## Rollback design

Start with rolling revisions and health-gated traffic. Add canary traffic only when telemetry and enough traffic make the comparison useful. Keep the previous verified image digest and configuration. On a failed smoke test or SLO breach, route traffic back and investigate. Use additive expand/contract database changes so both revisions can run during rollout. Application rollback must not automatically execute a destructive database downgrade. Test backup restoration on a separate database and record the actual recovery time.

## Mobile release design

API deployment and mobile release are separate. Add Expo development builds and device tests first, then signed preview builds. Store signing material in the build service's protected credential storage. Preserve API backward compatibility because installed mobile clients do not update instantly. Only use over-the-air updates within the compatible native runtime.
