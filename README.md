# Justlife Teleconsultation — Booking & Doctor Calendar (Vercel + Google Sheets)

Web app for **Justlife Healthcare**: CX shares a secure booking link, the client picks a doctor and a 1-hour window, the doctor calls them in that window, records notes and recommended services, and admins see bookings, calendar and performance in one place.

**Everything is stored in one Google Sheet** — no database server to run. The app is hosted on **Vercel**, and only **@justlife.com Google accounts** can open the admin console.

| Interface | URL | Who | Sign-in |
|---|---|---|---|
| Client booking | `/book/<token>` | Clients | None — secure link from CX |
| Client reschedule / cancel | `/reschedule/<token>` | Clients | None — secure link in confirmation email |
| Admin console | `/admin` | Justlife staff | Google, **@justlife.com only** |
| Doctor portal | `/doctor` | Doctors | Email + password created by an admin |

```text
 Browser ──► Vercel (Next.js app + API) ──► Google Sheet  (Doctors, Appointments, Clients, … tabs)
                    │                            ▲
                    ├── Email (Resend / SMTP)    │  Apps Script in the sheet:
                    └── Google sign-in           └─ hourly reminders, reports, backup, (optional) Drive files
```

---

## Contents
1. [The two files you edit](#1-the-two-files-you-edit)
2. [Step 1 — Create the Google Sheet](#2-step-1--create-the-google-sheet)
3. [Step 2 — Connect the app to the sheet (service account)](#3-step-2--connect-the-app-to-the-sheet-service-account)
4. [Step 3 — Google login for @justlife.com](#4-step-3--google-login-for-justlifecom)
5. [Step 4 — Put the code on GitHub](#5-step-4--put-the-code-on-github)
6. [Step 5 — Deploy on Vercel](#6-step-5--deploy-on-vercel)
7. [Step 6 — Apps Script (reminders, reports, backup)](#7-step-6--apps-script-reminders-reports-backup)
8. [Test checklist after deploying](#8-test-checklist-after-deploying)
9. [Creating doctors](#9-creating-doctors)
10. [Generating client booking links](#10-generating-client-booking-links)
11. [Email & notifications](#11-email--notifications)
12. [How the sheet is used (please read before editing it by hand)](#12-how-the-sheet-is-used-please-read-before-editing-it-by-hand)
13. [How double booking is prevented](#13-how-double-booking-is-prevented)
14. [Limits, speed & security](#14-limits-speed--security)
15. [KPI definitions](#15-kpi-definitions)
16. [Local development](#16-local-development)
17. [API reference](#17-api-reference)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. The two files you edit

**`config/config.js`** — non-secret settings (it is bundled into the browser, so never put passwords here):

```js
GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/…/edit',  // ← your sheet link
SHEETS_CONNECTION: 'service-account',   // or 'apps-script' (see §3, plan B)
APPS_SCRIPT_URL: '',                    // only for 'apps-script' / Drive storage
FILE_STORAGE: 'sheet',                  // 'sheet' | 'drive' | 's3' — lab results & photos
AUTH_MODE: 'google',                    // 'google' | 'test' (temporary password login)
GOOGLE_CLIENT_ID: '676386166698-….apps.googleusercontent.com',
ALLOWED_ADMIN_DOMAIN: '@justlife.com',  // only this domain can sign in as admin
ADMIN_EMAILS: [],                       // optional: limit to specific people
```

Below those are the business defaults (booking horizon, reminder hours, upsell price list, support contacts…). Most can also be changed live in **Admin → Settings**.

**Vercel → Settings → Environment Variables** — the secrets. Full list with explanations in [`.env.example`](.env.example). The required ones:

| Variable | What to put |
|---|---|
| `NEXTAUTH_URL`, `APP_URL` | Your app URL, e.g. `https://justlife-teleconsultation.vercel.app` |
| `NEXTAUTH_SECRET` | Random string: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_SECRET` | From the Google OAuth client (§4) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The whole JSON key file of the service account (§3) |
| `CRON_SECRET` | Random string (protects the reminder job) |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` | Email sending (§11) |

After changing `config/config.js`, commit and push — Vercel redeploys automatically. After changing env vars, click **Redeploy** in Vercel.

---

## 2. Step 1 — Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) while signed in with your Justlife Google account. Name it e.g. *Justlife Teleconsultation — DATA*.
2. Copy the link from the address bar and paste it into `config/config.js` ▸ `GOOGLE_SHEET_URL`.
3. You don't need to create any tabs — the app creates all of them (with headers) the first time it runs.

Keep sharing of this sheet **tight**: anyone who can open it can read all client details, lab-result metadata and consultation notes.

---

## 3. Step 2 — Connect the app to the sheet (service account)

A *service account* is a robot Google account the app uses to read and write the sheet.

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select (or create) a project — the same one you use for the OAuth client is fine.
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account** → name `justlife-teleconsult-app` → **Done** (no roles needed).
4. Click the new service account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads. Treat it like a password.
5. Open the JSON file in a text editor, copy **everything**, and paste it into Vercel as `GOOGLE_SERVICE_ACCOUNT_JSON`.
6. In the JSON, find `"client_email"` (looks like `justlife-teleconsult-app@your-project.iam.gserviceaccount.com`). In your Google Sheet click **Share**, paste that email, choose **Editor**, untick *Notify*, **Share**.

Check it from your computer (optional):
```bash
export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat ~/Downloads/your-key.json)"
npm install && npm run sheet:setup     # prints ✓ Connected and creates all tabs
```

> **Plan B — Workspace blocks sharing with the service account?** Some Google Workspace admins block sharing files with accounts outside `justlife.com`. Then use the sheet's own Apps Script as the connection instead: complete §7 (including the web-app deployment and `APP_SECRET`), set `SHEETS_CONNECTION: 'apps-script'` and `APPS_SCRIPT_URL` in `config/config.js`, set `APPS_SCRIPT_SECRET` in Vercel, and skip `GOOGLE_SERVICE_ACCOUNT_JSON`. It is a bit slower (≈1 s per sheet call) but needs no service account.

---

## 4. Step 3 — Google login for @justlife.com

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: User type **Internal** (only Justlife Workspace accounts can even see it). App name *Justlife Teleconsultation*, scopes `email`, `profile`, `openid`.
2. **APIs & Services → Credentials** → your OAuth 2.0 Client ID of type **Web application** (the one whose ID is already in `config/config.js`, or create one):
   - **Authorised JavaScript origins**: `https://<your-app>.vercel.app` (+ `http://localhost:3000` for local dev)
   - **Authorised redirect URIs**: `https://<your-app>.vercel.app/api/auth/callback/google` (+ `http://localhost:3000/api/auth/callback/google`)
3. Make sure `config/config.js` ▸ `GOOGLE_CLIENT_ID` is that client's ID, and put its **Client secret** in Vercel as `GOOGLE_CLIENT_SECRET`.

How access is enforced: Google is asked to show only `justlife.com` accounts, and then the **server** re-checks every sign-in — the email must be *verified by Google* and end in `ALLOWED_ADMIN_DOMAIN`. Anyone else sees *"Access restricted to authorized Justlife accounts."* and the attempt is written to the *AuditLog* tab. The first sign-in of each person creates their admin row in the *Users* tab; admins can switch others off in **Admin → Settings → Admin users**.

**Can't set up OAuth yet?** Set `AUTH_MODE: 'test'` in `config/config.js` and `TEST_LOGIN_PASSWORD` in Vercel. The login page then asks for an `@justlife.com` email + that shared password. Use it only for a first look, then switch back to `'google'`.

---

## 5. Step 4 — Put the code on GitHub

```bash
cd justlife-teleconsultation
git init
git add .
git commit -m "Justlife Teleconsultation"
git branch -M main
git remote add origin https://github.com/<your-org>/justlife-teleconsultation.git   # create it first, Private
git push -u origin main
```

`.gitignore` already excludes `.env*`, `node_modules`, `.next`. Never commit the service-account JSON file.

---

## 6. Step 5 — Deploy on Vercel

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New… → Project** → import `justlife-teleconsultation`. Framework: **Next.js** (auto). Leave build settings as they are.
2. Before clicking Deploy, open **Environment Variables** and add the required ones from §1. For the first deploy use `https://<project-name>.vercel.app` for `NEXTAUTH_URL` and `APP_URL`.
3. **Deploy**. When it's done, note the real URL; if it differs, fix `NEXTAUTH_URL`/`APP_URL`, the Google redirect URI (§4) and **Redeploy**.
4. Open `https://<your-app>/admin` → **Continue with Google** → you're in. The sheet now has all its tabs.

**Custom domain** (e.g. `teleconsult.justlife.com`): Vercel → Settings → Domains → add it → create the DNS record shown → update `NEXTAUTH_URL`, `APP_URL`, the Google origin + redirect URI → Redeploy.

**Vercel plan**: Hobby (free) works for testing; its cron runs only once a day, which is why the Apps Script runs reminders hourly (§7). Hobby is meant for non-commercial use — use **Pro** for production at Justlife.

---

## 7. Step 6 — Apps Script (reminders, reports, backup)

`app-script/Code.gs` lives inside the sheet and adds a **Justlife** menu:
*Refresh Bookings view & Monthly summary* · *Run reminders now* · *Backup to Drive* · *Compact (remove deleted rows)* · *Check setup* · *Install triggers*.

1. In the sheet: **Extensions → Apps Script** → replace the contents of `Code.gs` with `app-script/Code.gs` → **Save**.
2. **Project Settings (⚙) → Script Properties** → add:

   | Property | Value |
   |---|---|
   | `APP_URL` | `https://<your-app>.vercel.app` (no trailing slash) |
   | `CRON_SECRET` | same as the Vercel env var |
   | `APP_SECRET` | *only for Plan B or Drive storage* — long random string (≥ 24 chars), same as Vercel `APPS_SCRIPT_SECRET` |
   | `DRIVE_FOLDER_ID` | *only for Drive storage* — id of a **private** Drive folder (the part after `/folders/` in its link) |

3. Reload the sheet → **Justlife → Install triggers** → approve the permissions. This creates: hourly reminders, a daily 06:00 (Dubai) report refresh, and a weekly backup copy on Friday night.
4. *Only for Plan B / Drive storage:* **Deploy → New deployment** → type **Web app** → *Execute as:* **Me** → *Who has access:* **Anyone** → **Deploy** → copy the URL ending in `/exec` into `config/config.js` ▸ `APPS_SCRIPT_URL`. ("Anyone" is needed so Vercel can reach it; every request must carry `APP_SECRET` or it is refused.) After editing `Code.gs` later, use **Deploy → Manage deployments → Edit → New version**.

The *Bookings view* tab is the friendly one for CX and managers: doctor and client names instead of ids, Dubai dates and times, upsells and GMV per booking.

---

## 8. Test checklist after deploying

1. `/admin` with your @justlife.com account → works. In a private window, a Gmail account → *Access restricted*.
2. **Doctors → Add doctor**, set working hours, upload a photo, set a portal password. Check the *Doctors* and *DoctorSchedules* tabs filled in.
3. Sign in at `/doctor` in a private window with the doctor's email + password.
4. **Booking links → Create Booking Link → Copy Link**, open it on your phone, book a slot, attach a PDF.
5. The booking appears in **Bookings**, the **Calendar**, the doctor's portal and the *Appointments* tab; the confirmation email appears in **Email log**.
6. Drag the booking to another hour in the calendar → a new version `…-R1` appears, the old one becomes *Rescheduled*.
7. Double-booking stress test (use a link set to *Never expires*):
   ```bash
   BASE_URL=https://<your-app> TOKEN=<link-token> npm run test:double-booking
   ```
   Expected `booked: 1 · rejected (409): 19` and `PASS`. Cancel the test booking afterwards.
8. Justlife menu → **Run reminders now** → the *Script log* tab shows the result.

---

## 9. Creating doctors

Admin → **Doctors → Add doctor**:
1. Name, email (= doctor portal login), specialty, experience, languages, bio, phone/WhatsApp, consultation duration (default 1 hour), status.
2. Optional portal password (≥ 10 characters) — or set it later on the doctor page.
3. Open the doctor → **Working hours**: per-day periods (add a second period for split shifts), tick **Weekly off** days, *Copy Monday to Tue–Fri*.
4. **Leave & holidays**: add a date or range — those dates disappear from client availability immediately. **Block part of a day** for meetings.
5. **Upload photo**: automatically square-cropped, resized to 480×480 and converted to WebP (typically 20–40 KB).
6. Status **Inactive** or **On Leave** hides the doctor from clients without deleting history.

If a schedule change or leave conflicts with existing bookings, the admin is told how many bookings need rescheduling.

---

## 10. Generating client booking links

Admin → **Booking links → Create Booking Link**:
- Optional Justlife booking reference (pre-fills the client form) and an internal label (never shown to the client).
- Validity: **Can only be used once** (default), **Expires after a date**, or **Never expires**.
- The link (`/book/<12-character random token>`) is copied automatically; **Copy Link** is available on every row. Status shows **Active / Expired / Used / Cancelled**; links can be cancelled or reactivated.

The token reveals nothing about the client. Booking and reschedule pages send `Referrer-Policy: no-referrer` and `noindex` so tokens never leak to other sites or search engines.

Every confirmed booking also gets its own **reschedule link** (in the email; *Copy Reschedule Link* on the admin booking page). It always points to the latest version of the appointment.

---

## 11. Email & notifications

Events: **Booking confirmed**, **Rescheduled** ("Your previous appointment has been rescheduled"), **Cancelled**, **Reminder** (configurable, default 24 h and 2 h before), and **Doctor assigned** (to the doctor).

- **Providers** (`lib/notifications/providers/`): `resend` (recommended — set `RESEND_API_KEY`, verify the sending domain), `smtp` (Google Workspace, SES, SendGrid… via `SMTP_URL`), `console` (dev). Adding another provider is one small file exporting `send()`.
- **Templates**: Admin → Settings → Email templates — edit subject/body, enable/disable, preview with sample data, reset to default. Variables: `{{clientName}}`, `{{doctorName}}`, `{{appointmentDate}}`, `{{appointmentStartTime}}`, `{{appointmentEndTime}}`, `{{contactMethod}}`, `{{bookingReference}}`, `{{rescheduleLink}}`, plus `{{appointmentId}}`, `{{timeWindow}}`, `{{cancelLink}}`, `{{supportEmail}}`, `{{supportPhone}}`, `{{previous…}}` and more (listed in the editor). Optional sections: `{{#if cancelLink}}…{{/if}}`. Values are HTML-escaped automatically.
- **Email log** (Admin → Email log, stored in the *EmailLog* tab): client, booking, type, sent time, status **Sent / Delivered / Failed / Pending**, error text and a **Retry** button. For *Delivered* status, point your Resend webhook at `https://<domain>/api/webhooks/email?secret=<EMAIL_WEBHOOK_SECRET>`.
- **WhatsApp / SMS / CRM later**: set `NOTIFICATION_WEBHOOK_URL` — every event is POSTed as JSON signed with HMAC-SHA256 (`X-Justlife-Signature`), ready for a WhatsApp Business API bridge, Zapier/Make, or CRM. The payload never contains clinical notes or lab results. No booking code changes are needed.

Notifications run after the booking is committed and never throw, so a provider outage can't lose a booking — failures show in the Email log with Retry.

---

## 12. How the sheet is used (please read before editing it by hand)

| Tab | Contents |
|---|---|
| Users | Admin and doctor logins (doctor passwords are bcrypt hashes) |
| Doctors · DoctorSchedules · DoctorLeaves · BlockedSlots | Doctor profiles and availability |
| Clients · BookingLinks · Appointments · Documents | Bookings (one row per appointment version) |
| ConsultationNotes · Upsells | Clinical notes and recommended services |
| EmailTemplates · Settings | Customised email templates and business settings |
| Files · FileData | Uploaded lab results / photos (only with `FILE_STORAGE: 'sheet'`) |
| AuditLog · EmailLog | Logs |
| Bookings view · Monthly summary · Script log | Written by the Apps Script — safe to read, sort and filter |

- Row 1 of each data tab holds the column names. The app matches columns **by name**, so you may reorder columns or add your own columns on the right.
- **Do not sort, insert or delete rows in the data tabs.** To look at a subset use **Data → Filter views** (they don't change the sheet for others). Changing a cell's value is fine — e.g. fixing a client's name.
- Timestamps are stored in UTC ISO format (`2026-11-10T06:00:00.000Z` = 10:00 Dubai); the *Bookings view* shows Dubai time.
- When the app deletes something (e.g. an upsell), the row becomes `#deleted` instead of disappearing, so row positions never shift. **Justlife → Compact** removes those rows; run it when nobody is using the app.
- *Settings* tab values are JSON: `5`, `true`, `"text"`, `[{"hours":24,"enabled":true}]`. An invalid value is ignored (the default from `config/config.js` is used).
- Version history (**File → Version history**) lets you restore the whole sheet; the Apps Script also makes a weekly backup copy.

---

## 13. How double booking is prevented

Google Sheets has no transactions or locks, so the booking engine (`lib/booking.js`) uses an **append → verify → earliest row wins** protocol:

1. **Availability engine** — clients only ever see free slots (working periods − weekly off − leave − bookings − blocked time − inactive doctors − notice period − beyond horizon).
2. **Re-check** — just before writing, all of those rules are re-validated against **live** sheet data (no cache).
3. **Append** — the new appointment is added as a new row. Google applies additions to one spreadsheet strictly one after another, so **row order = arrival order**.
4. **Verify** — the app re-reads the *Appointments* tab live. If another active appointment for the same doctor and overlapping time sits **above** its row, it lost the race: its row is removed and the client sees *"Sorry, this time slot has just been booked by another client. Please select another available time."* Otherwise it keeps the slot — and anyone who appends after it will see it in their own verify step.

Reschedules and calendar drag-and-drop always create a **new** row (the old one becomes *Rescheduled*), so the same rule covers them. Single-use links use the same rule (the first booking row wins).

Stress-tested with 20 simultaneous bookings for one slot (with simulated network delay): 14 requests got past the pre-check and wrote a row, and the verify step rejected all but the earliest → **1 booked, 19 rejected**, slot gone from availability. Same result through the service-account and Apps Script connections.

---

## 14. Limits, speed & security

**Google quota.** The Sheets API allows about **60 reads and 60 writes per minute** for the app. The app keeps sheet data in memory for `SHEET_CACHE_SECONDS` (default 5 s), reads all needed tabs in one request, and retries automatically when Google says "slow down". A booking costs about 5 reads and 6 writes (measured), so the app comfortably handles a teleconsultation team's volume (several bookings per minute at peak). It is not designed for thousands of bookings per hour — at that point move to a database.

**Size.** A Google Sheet holds up to 10 million cells. Expect ~30 columns × 2 rows per booking (incl. logs) — tens of thousands of bookings fit. With `FILE_STORAGE: 'sheet'` uploaded files live in the *FileData* tab: fine for doctor photos (≈30 KB) and occasional lab results; for regular lab-result uploads switch to **`'drive'`** (a private Drive folder via the Apps Script) or `'s3'`.

**Speed.** Pages load in about 0.3–1 s (each fresh sheet read takes ~200–500 ms). Admin pages refresh data at most every 5 seconds.

**Security.**
- **The sheet is the database**: share it only with the service account and the few people who own the data. Sheet editors can read all client data and notes.
- Secrets only in Vercel env vars; `config/config.js` holds no secrets.
- **Role-based access**: Admin (Google @justlife.com), Doctor (password), Client (unguessable link tokens). Enforced in middleware, server layouts and again in **every** API route. Deactivating a user takes effect within seconds.
- **Doctors only see their own appointments**; other doctors' appointments and files return 404.
- **Lab results are never public** — streamed only via `/api/files/:id` to admins or the assigned doctor, each view audit-logged, `Cache-Control: private, no-store`. File type is verified from the file's **content** (magic bytes), size limited.
- Values are written to the sheet as **plain text** (never as formulas), so client input like `=IMPORTXML(...)` can't execute in the sheet.
- CSRF same-origin checks, `SameSite=Lax` `HttpOnly` `Secure` cookies, HSTS, `X-Frame-Options: DENY`, `no-referrer` + `noindex` on token pages, zod validation on every input, bcrypt (cost 12) passwords.
- **Recommended for go-live**: Vercel Pro, `FILE_STORAGE: 'drive'` or `'s3'`, an `ADMIN_EMAILS` allow-list, a data-retention policy for lab results, and a review against UAE health-data rules for storing medical data in Google Workspace.

---

## 15. KPI definitions

Period filters (Today, Yesterday, This/Last Week, This/Last Month, Custom) apply to the **appointment time** in Dubai. Weeks start Monday.

| KPI | Definition |
|---|---|
| Total bookings | Appointments in the period, excluding superseded *Rescheduled* versions |
| Completion % | Completed ÷ total bookings |
| On-time call | Call started ≤ tolerance (default 5 min, Admin → Settings) after the window start. Calls can only be started on the appointment's day. |
| On-time calling % | On-time calls ÷ calls started |
| Average delay | Mean minutes between window start and call start |
| Upsell conversion % | Booked upsells (Booked/Completed) ÷ upsell opportunities × 100 |
| Upsell GMV | Σ booked amount (recommended amount if booked amount blank) of booked upsells |
| Client conversion % | Completed consultations with ≥ 1 booked upsell ÷ completed |
| Utilization % | Booked hours ÷ available working hours × 100 |
| Average consultation | Mean call duration (start → complete) |

The schema keeps every raw fact (call timestamps, delays, sources, upsell amounts/status, reschedule chains, client ids) so revenue, repeat rate, calling SLA, cancellation/no-show rates and consultation-to-service conversion can be analysed further — directly in the Google Sheet (pivot tables on the *Appointments* / *Upsells* tabs) or in Looker Studio.

---

## 16. Local development

Requirements: **Node.js 22+**.

```bash
npm install
cp .env.example .env.local    # fill NEXTAUTH_SECRET etc.

# Option A — against a real (test!) Google Sheet
#   set GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_SHEET_URL in .env.local
npm run sheet:setup
npm run sheet:seed:demo       # OPTIONAL demo doctors/clients/appointments (@demo.justlife.test)
npm run dev                   # http://localhost:3000

# Option B — no Google at all (data kept in .data/sheet.json)
export SHEETS_DRIVER=memory SHEETS_MEMORY_FILE=.data/sheet.json
npm run sheet:seed:demo && npm run dev
```

With `EMAIL_PROVIDER=console` emails are printed in the terminal. Demo data uses `@demo.justlife.test` emails and can be removed with `npm run sheet:seed:demo -- --reset`; the script refuses to run in production. Demo doctor password: `Demo-Doctor-2026`.

**Code map:** `lib/sheets/` is the Google Sheets data layer (`schema.js` = tabs & columns, `store.js` = read/insert/update/delete with caching, `transport.js` = service account / Apps Script / memory). `lib/booking.js` booking engine, `lib/availability.js` availability engine, `lib/analytics.js` KPIs, `lib/auth.js` sign-in. Pages in `app/`, UI in `components/`.

---

## 17. API reference

All JSON. Errors: `{ "error": "<human message>", "code": "<CODE>" }` with an appropriate HTTP status (400 validation, 401, 403, 404, 409 conflict/slot taken, 410 link expired/used, 429).

**Public (token-based)**
- `GET /api/public/links/:token` — link validity
- `GET /api/public/availability?kind=link|reschedule&t=TOKEN` — free slots per doctor
- `POST /api/public/uploads` (multipart: `kind`, `t`, `session`, `file`) · `DELETE /api/public/uploads/:id?session=`
- `POST /api/public/bookings` — `{ token, name, email, mobile, bookingReference, contactMethod, doctorId, startAt, dateOfBirth?, gender?, notes?, uploadSession?, documentIds? }`
- `GET|POST /api/public/reschedule/:token` — `{ action: 'reschedule', doctorId, startAt, contactMethod?, reason? }` or `{ action: 'cancel', reason? }`

**Admin (Google session)** — `/api/admin/...` (doctors, bookings, calendar, clients, links, analytics, settings, templates, emails, audit, users, export). Notable: `POST /api/admin/bookings/:id/move` (validated reschedule/drag), `GET /api/admin/analytics?preset=&from=&to=&doctorId=`, `GET /api/admin/export` (CSV).

**Doctor / admin** — `GET /api/appointments/:id`, `POST /api/appointments/:id/call` (`start` | `complete` | `no_show`), `PUT /api/appointments/:id/notes`, `POST|PATCH|DELETE /api/appointments/:id/upsells[/:upsellId]`.

**Machine**
- `GET /api/cron/reminders` — `Authorization: Bearer $CRON_SECRET`
- `GET /api/integrations/export?from=&to=` — `X-API-Key: $INTEGRATION_API_KEY`
- `GET /api/integrations/appointments?bookingReference=` — look up by Justlife reference (returns status and reschedule link) for the Justlife booking system / CRM

---

## 18. Troubleshooting

| Symptom | Fix |
|---|---|
| *Cannot open the Google Sheet (403/404)* | Share the sheet with the service account's `client_email` as **Editor**; check `GOOGLE_SHEET_URL` in `config/config.js`. |
| *Google rejected the service-account key* | Paste the **whole** JSON file into `GOOGLE_SERVICE_ACCOUNT_JSON`; enable the Google Sheets API in that Cloud project. |
| Sharing with the service account is blocked | Your Workspace blocks external sharing → use Plan B (`SHEETS_CONNECTION: 'apps-script'`, §3). |
| *Apps Script did not return JSON* | Re-deploy the web app with *Execute as: Me* and *Who has access: Anyone*; use the `/exec` URL. |
| `redirect_uri_mismatch` on Google sign-in | The redirect URI in Google must be exactly `<NEXTAUTH_URL>/api/auth/callback/google`. |
| *Google sign-in is not configured* | `GOOGLE_CLIENT_ID` in config or `GOOGLE_CLIENT_SECRET` in Vercel missing; redeploy. |
| A Gmail account can sign in | It can't — check `ALLOWED_ADMIN_DOMAIN` wasn't changed. |
| Slow pages / "quota" errors in Vercel logs | Raise `SHEET_CACHE_SECONDS` to 10–15, and run *Justlife → Compact* if the tabs have many `#deleted` rows. |
| Data looks wrong after editing the sheet by hand | Rows were probably sorted/inserted. Restore from **File → Version history** (see §12). |
| Emails show *Failed: No email provider configured* | Set `EMAIL_PROVIDER`, `EMAIL_FROM` and the provider key; use **Retry** in the Email log. |
| Reminders not sent | Set `APP_URL`/`CRON_SECRET` script properties and *Install triggers*; check the *Script log* tab. |
| Upload fails | Only real PDF/JPG/PNG ≤ the configured size (default 4 MB) are accepted. |
| Doctor can't log in | Admin → doctor → set/reset password, make sure the login is enabled and the doctor isn't *Inactive*. |
| A doctor isn't visible to clients | Status must be *Active*, with working hours and free slots inside the booking horizon. |
