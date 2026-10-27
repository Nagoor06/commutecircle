# Windows + GitHub Desktop

The repository is https://github.com/Nagoor06/commutecircle. GitHub Desktop manages source control; GitHub Actions runs CI. Neither alone deploys a running API to a cloud host.

Your previously extracted ZIP is at `C:\Users\gowriveeraboina\Desktop\Project\commutecircle`. It is not a Git checkout.

1. Keep the ZIP files as a backup: rename that folder to `commutecircle-zip-backup` (use another unused name if it already exists).
2. In GitHub Desktop choose File → Clone repository → URL.
3. Enter `https://github.com/Nagoor06/commutecircle`.
4. Set Local path to `C:\Users\gowriveeraboina\Desktop\Project\commutecircle` and clone into that now-empty destination.
5. If the foundation PR is still open, select `chore/modular-foundation` in Current Branch to inspect it. Once merged, switch to main and Fetch origin / Pull origin.
6. Use Repository → Open in Visual Studio Code to edit.

Keep one checkout, with README.md, compose.yaml, apps, services and .github directly under its root. Do not copy the old ZIP over the checkout; it has the previous layout.

With Docker Desktop running, open PowerShell in the repository root:

```powershell
Copy-Item .env.example .env
# Only copy on first setup; keep any existing local settings.
docker compose up --build
```

Then open http://localhost:8000/docs. Database content starts empty. This is the API, not a completed mobile app. For an existing checkout, Fetch/Pull main, then run `docker compose up --build` to apply migrations. Configure OIDC variables using authentication.md before testing ride requests. There is no mock login.

Daily workflow: Fetch/Pull main → create a short-lived branch → edit/test → review changed files in Desktop → commit → Push origin → create PR → wait for checks → merge → switch to main and pull. Keep `.env` and credentials untracked. Configure required API checks in repository rules before relying on enforcement; a workflow alone does not protect main.
