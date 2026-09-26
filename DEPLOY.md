# Deploying Watchdog

One Vercel project, one Turso database. About 20 minutes. Never paste secret values into chats, issues or commit messages.

## 1 · GitHub

```bash
git status --short            # .env.local must NOT appear (it is git-ignored)
git add -A && git commit -m "Watchdog: backend B1–B6"
gh repo create watchdog --public --source=. --push      # or create it on github.com and push
```

## 2 · Turso database

```bash
brew install tursodatabase/tap/turso      # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup                         # or: turso auth login
turso db create watchdog --location fra   # pick the location closest to your judges (fra = Frankfurt)
turso db show watchdog --url              # → DATABASE_URL  (libsql://watchdog-<you>.turso.io)
turso db tokens create watchdog           # → DATABASE_AUTH_TOKEN
```

## 3 · Vercel project

Import the GitHub repository at vercel.com/new (framework: Next.js). Before the first deploy, add these
**Environment Variables** for *Production* (and *Preview* if you want preview deploys to work):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_BACKEND` | `remote` |
| `DATABASE_URL` | from `turso db show watchdog --url` |
| `DATABASE_AUTH_TOKEN` | from `turso db tokens create watchdog` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `NEXT_PUBLIC_FHIR_CANONICAL` | `https://<your-project>.vercel.app/fhir` |
| `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` | your key (set `LLM_PROVIDER` only if you set both) |
| `DEMO_MODE` | `true` |

Project → Settings → Functions → **Region**: choose the one next to your Turso location (e.g. `fra1` for `fra`).
Deploy. The build runs `vercel-build` → `db:migrate` → `next build`; a missing or file `DATABASE_URL` stops it with a clear message.

## 4 · Verify production

```bash
curl -s https://<your-project>.vercel.app/api/health
```

Expect `"ok":true`, `"migrations":["0001_init","0002_photos"]`, `"build":{"transport":"remote",…}`,
`"config":{"ok":true,"issues":[]}` and your AI provider. Then:

1. Open the app, sign in as Sofia, press the phone button in the top bar and scan the QR code with a real phone.
   Over HTTPS the camera and location work. File a report on the phone and watch it arrive in the console.
2. `https://<your-project>.vercel.app/fhir/CodeSystem/sentinel-sign` returns the CodeSystem JSON.
3. Run the whole suite against production:
   ```bash
   E2E_BASE_URL=https://<your-project>.vercel.app NEXT_PUBLIC_BACKEND=remote npx playwright test --grep-invert '(@network|@capture)'
   ```

## 5 · Scheduled jobs

Vercel Cron (`vercel.json`) calls `/api/cron/retention` and `/api/cron/weather` daily with your `CRON_SECRET`.
For the 10-minute cycle/outbox job add GitHub repository **secrets** `WATCHDOG_URL` (`https://<your-project>.vercel.app`)
and `CRON_SECRET` (same value). Check: `curl -s https://<your-project>.vercel.app/api/cron/retention` → 401 without the header.

## 6 · CI

Add the repository **variable** `FHIR_CANONICAL` = `https://<your-project>.vercel.app/fhir` so the FHIR job validates with
your real canonical. CI runs unit tests, end-to-end in both transports, and the HL7 FHIR Validator on every push.

## Rollback

Vercel → Deployments → a previous deployment → *Promote to Production*. For a single-browser fallback that needs no
server, set `NEXT_PUBLIC_BACKEND=local` and redeploy.

## Public test servers

The HAPI R4 sandbox is shared by people worldwide. Watchdog only ever POSTs its own synthetic bundles there.
Never run DELETE, PUT, `$expunge`, `$reindex` or other administrative operations against it.
