# Map Graph backend

One handler, two homes. `handler.js` and `validate.js` are plain ES modules. The Node server runs them against SQLite. The site runs the same code against browser storage when no server answers, so the pages work in a preview.

## Run it

```bash
cd server
cp .env.example .env     # set ADMIN_TOKEN, PUBLIC_URL, SMTP_URL
npm install
set -a; . ./.env; set +a
npm start                # API and the static site on http://localhost:8787
npm run worker           # sends the five-email drip (dry run until SMTP_URL is set)
```

The schema in `schema.sql` is applied on start. The database is the single file `DB_FILE`.

## Endpoints

See `openapi.yaml`. In short: `POST /api/waitlist`, `GET /api/waitlist/:code`, `POST /api/waitlist/:code/survey`, `POST /api/upgrade`, `POST /api/contact`, `POST /api/events`, `GET /api/stats` and `GET /api/admin/signups.csv` (both need the admin token).

## Queue position

Score is arrival number minus ten per referral. Position is one plus the number of members with a lower score.

## Before launch

- Set `ADMIN_TOKEN` and `CORS_ORIGIN`.
- Put the server behind HTTPS (a reverse proxy or your host's TLS).
- Replace the placeholder sender in `MAIL_FROM` and add real unsubscribe handling before sending to real addresses.
- Add a privacy notice that matches what `schema.sql` stores.
- The static route refuses `/server/`, `.db` and `.env` paths. Keep it that way, or serve the site from a CDN and set `SERVE_STATIC=0`.
