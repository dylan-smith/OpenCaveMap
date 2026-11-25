# AGENTS.md

Instructions for AI coding agents (Claude Code, GitHub Copilot, Codex, etc.) working in this repository.
See [README.md](README.md) for full setup, deployment and Azure details.

## Project overview

OpenCaveMap is a cave mapping app. So far each user keeps projects, one for each cave, and enters the
survey segments in each one: stations with depths, joined by shots with distances and azimuths. See `GLOSSARY.md`.

- `backend/OpenCaveMap.Api`: ASP.NET Core Web API (.NET 10) with EF Core, SQL Server and controllers.
  OpenAPI is served at `/openapi/v1.json` and Scalar at `/scalar` in every environment.
- `backend/OpenCaveMap.Database`: DbUp console app that runs the SQL migrations in `Scripts/`.
- `backend/OpenCaveMap.Api.Tests`: xUnit backend tests.
- `frontend`: React 19 + TypeScript + Material UI (Vite). Unit tests use Vitest in `src/test`,
  and Playwright E2E tests are in `e2e`.
- `infra`: Bicep templates for Azure (App Service, Azure SQL, Storage static website,
  monitoring). `preview.bicep` is a pull request's preview environment, and `preview-shared.bicep`
  the plan and SQL server every preview shares (deployed from the PR's base branch).
- `.github/workflows/ci.yml`: build, test, CodeQL, E2E, PR what-if preview, deploy each PR based on
  `main` to a preview environment, and deploy to production on `main`. `preview-cleanup.yml` deletes a
  PR's preview when it closes.

## Validation commands

Run the checks for every area you change. These match CI.

Backend (from repo root):

```bash
dotnet restore
dotnet build --no-restore
dotnet format OpenCaveMap.slnx --verify-no-changes --no-restore
dotnet test --no-build
```

Frontend (from `frontend/`):

```bash
npm ci
npx tsc -b
npx vite build
npx eslint . --max-warnings 0
npx prettier --check .
npm test
```

E2E (from `frontend/`; Playwright starts the backend and frontend itself):

```bash
npx playwright install chromium --with-deps   # first time only
npm run test:e2e
```

## Running locally

- Backend: `cd backend/OpenCaveMap.Api && dotnet run` runs at `http://localhost:5269`. Development
  uses an in-memory database by default (`UseInMemoryDatabase` in `appsettings.Development.json`).
- Frontend: `cd frontend && npm run dev` runs at `http://localhost:5173`. Set `VITE_API_BASE_URL`
  if the API is elsewhere.
- Dev container: `.devcontainer/` runs the app next to a SQL Server container, and the API uses
  SQL by default there. See the README's "Dev Container" section.

## Conventions

- Keep changes minimal and scoped to the requested task. Don't edit unrelated files for style.
- Reuse existing patterns and naming in nearby files, and match the surrounding comment density.
- Avoid new dependencies unless they're needed.
- Keep logic in the backend where possible, and limit the frontend to UI and rendering. Validation, business rules,
  naming rules and generating files belong in the API: the frontend sends what the user gave it and shows what comes
  back.
- Give API requests and responses typed values: a number is a JSON number, a date is `YYYY-MM-DD` and a fixed set
  of choices is an enum, not text for the API to parse. The frontend turns what the user typed into those values, and
  that is the only check it makes.
- How a value is shown is rendering, so it's the frontend's: rounding, number formatting, and labels made from data
  the API already returns. The API returns values unrounded and unformatted.
- Validate a request in a validator beside its entity (`Projects/ProjectValidator.cs`,
  `Segments/SegmentValidator.cs`), not with validation attributes. Its `Validate` method returns a `ValidX` record,
  the checked values ready to store, or null after adding a message for every problem, keyed by the field's camelCase
  path (`stations[1].depth`), and the controller then returns `ValidationProblem(ModelState)`. Request fields are all
  optional, so the validator writes every message. Checks that every entity shares, such as required values and
  trimmed text, are in `Validation/FieldRules.cs`, and anything a rule needs from the database is passed in.
- Formatting is enforced: `.editorconfig` + `dotnet format` for C#, Prettier + ESLint for the
  frontend. Line endings are LF.
- Warnings fail the build. The backend uses `AnalysisLevel` `latest-recommended` with
  `TreatWarningsAsErrors` (`backend/Directory.Build.props`). Frontend ESLint uses type-checked
  typescript-eslint rules plus the jsx-a11y, Vitest, Testing Library and Playwright plugins, with
  `--max-warnings 0`.
- Add or update tests for new or changed behavior.

### Sign-in and data ownership

- Every API endpoint needs a signed-in user unless it's marked `AllowAnonymous` (`/health`, OpenAPI, Scalar).
  See `backend/OpenCaveMap.Api/Authentication/` and the README's "Sign-in" section.
- Projects belong to a user. `OpenCaveMapDbContext` filters them to the current user and sets the owner on new
  ones. Anything added under a project should only be reached through its project, so a new endpoint must look
  that up first, or it can reach another user's data. As a second guard, give it a query filter through its
  project too, as segments have.
- Local dev, E2E and PR previews use test sign-in (`Bearer test:<name>`); production never turns it on.

### Database

- The schema is owned by DbUp scripts in `backend/OpenCaveMap.Database/Scripts/`, not EF Core
  migrations. For a schema change, add a new numbered script (e.g. `0003-Description.sql`) and
  never edit one that has already shipped. Keep the EF model in `OpenCaveMap.Api` in sync with it.
- When the schema changes, review the preview seed data (`.github/scripts/preview-seed-data.json`,
  loaded through the API by `.github/scripts/seed-preview.sh`) and update it if needed, so new
  previews show the new data (e.g. a new field on projects).
- Production is an always-on Azure SQL Basic database, and PR previews are Azure SQL serverless, which
  auto-pauses. Keep the transient-error retry handling
  in `Program.cs` and `DbUpRunner.cs` intact.

### Infrastructure

- Bicep in `infra/` owns **all** App Service app settings. Add new settings in
  `infra/modules/appservice.bicep` (and `infra/preview.bicep` for previews), never by hand in the
  portal.
- The templates don't manage identities, role assignments or database users. Production's are set
  up manually (see README). Preview web apps' database users are created by the `deploy-preview`
  job (`.github/scripts/preview-db-user.sql`), so don't add manual steps for them.
- The SQL servers only let in addresses inside Azure, and GitHub runs some jobs on runners outside
  it. A workflow step that connects to a database from the runner must come between
  `.github/scripts/sql-firewall.sh open` and `close`, as the migrations do, and should run its SQL
  with the Database CLI (`--run-script`) rather than `sqlcmd` or `azure/sql-action`, which can't
  sign in on those runners (see the README's "Database Access From Deployments" section).
- Pushes to `main` deploy to production, so treat changes to `ci.yml` and `infra/` with care.

## Pull requests

- Keep PRs small and focused, and follow `.github/PULL_REQUEST_TEMPLATE.md`.
- Make sure the backend and frontend checks pass for the areas you touched.
- When a change affects the UI, take screenshots and attach them to the PR description.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `dylan-smith/OpenCaveMap`, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when they're first needed. See `docs/agents/domain.md`.
