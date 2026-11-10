// =============================================================================
// Justlife Teleconsultation — configuration  (edit this file, then redeploy)
//
// This file is bundled into the browser, so NEVER put secrets here.
// Secrets (Google client SECRET, service-account key, NEXTAUTH_SECRET…) go in
// Vercel → Project → Settings → Environment Variables — see .env.example.
//
// Business rules below are only DEFAULTS: admins can override them at runtime
// in Admin → Settings (saved in the "Settings" tab of the Google Sheet).
// =============================================================================

const CONFIG = {
  APP_NAME: 'Justlife Teleconsultation',
  BRAND_NAME: 'Justlife Healthcare',
  PRIMARY_COLOR: '#02c2ff',

  // ===========================================================================
  // 1) GOOGLE SHEET — the database. All doctors, bookings, clients, notes,
  //    upsells, settings and logs are stored as tabs in this spreadsheet.
  //    Tabs and column headers are created automatically on first use.
  // ===========================================================================
  // Paste the full link from your browser's address bar:
  GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/PASTE_YOUR_SHEET_ID_HERE/edit',

  // How the app reaches the sheet:
  //   'service-account' (recommended, fastest) — share the sheet with the
  //       service account's email as Editor and set GOOGLE_SERVICE_ACCOUNT_JSON
  //       in Vercel. See README §3.
  //   'apps-script' — use the sheet's own Apps Script web app instead (for
  //       Workspaces that block sharing with service accounts). Paste the web
  //       app URL below and set APPS_SCRIPT_SECRET in Vercel.
  SHEETS_CONNECTION: 'service-account',
  APPS_SCRIPT_URL: '', // https://script.google.com/macros/s/…/exec

  // Where lab results & doctor photos are stored:
  //   'sheet' — inside the spreadsheet ("FileData" tab). Zero setup; fine
  //             for photos and a modest number of small PDFs.
  //   'drive' — a Google Drive folder via the Apps Script web app
  //             (recommended for production; set DRIVE_FOLDER_ID script property).
  //   's3'    — a private S3 / Cloudflare R2 bucket (S3_* env vars).
  FILE_STORAGE: 'sheet',

  // Seconds a server keeps sheet data in memory before re-reading it. Keeps
  // the app fast and under Google's quota (≈60 requests/min). Booking checks
  // always read live data, so this can never cause a double booking.
  SHEET_CACHE_SECONDS: 5,

  // ===========================================================================
  // 2) GOOGLE LOGIN — only @justlife.com accounts can open the admin console.
  // ===========================================================================
  //   'google' — normal: "Continue with Google", verified @justlife.com only.
  //   'test'   — temporary, before Google OAuth is set up: sign in with any
  //              @justlife.com address + the TEST_LOGIN_PASSWORD env variable.
  //              Switch back to 'google' before real use.
  AUTH_MODE: 'google',

  // Your Google OAuth "Web application" client ID (…apps.googleusercontent.com).
  // The matching client SECRET goes in Vercel env GOOGLE_CLIENT_SECRET.
  // Authorised redirect URI in Google Cloud: https://<your-app>/api/auth/callback/google
  // Not needed while AUTH_MODE = 'test'.
  GOOGLE_CLIENT_ID: '676386166698-m6lkakhva28q1f5h4nqdqrad0cg75cmj.apps.googleusercontent.com',

  // Only Google accounts on this domain may sign in as admin.
  ALLOWED_ADMIN_DOMAIN: '@justlife.com',
  // Optional: limit admin access to specific people (leave [] for everyone @justlife.com).
  ADMIN_EMAILS: [],

  GOOGLE_AUTH: {
    provider: 'google',
    // Asks Google to show only Justlife Workspace accounts in the picker.
    // This is a UX hint only — the domain is re-verified on the server.
    hostedDomain: 'justlife.com',
    // Callback URL is derived from NEXTAUTH_URL: <NEXTAUTH_URL>/api/auth/callback/google
    callbackPath: '/api/auth/callback/google',
  },

  // --- Region & time ----------------------------------------------------------
  TIMEZONE: 'Asia/Dubai',
  // Asia/Dubai has no daylight saving time; offset is fixed at UTC+4.
  TIMEZONE_OFFSET_MINUTES: 240,
  LOCALE: 'en-GB',
  DEFAULT_COUNTRY_CODE: '+971',
  CURRENCY: 'AED',
  WEEK_STARTS_ON: 1, // Monday

  // --- Booking rules (defaults; editable in Admin → Settings) ------------------
  CONSULTATION_DURATION_MINUTES: 60,
  BOOKING_HORIZON_DAYS: 14, // how far ahead clients can book
  MIN_BOOKING_NOTICE_MINUTES: 30, // earliest bookable slot = now + notice
  ON_TIME_TOLERANCE_MINUTES: 5,
  RESCHEDULE_CUTOFF_HOURS: 2, // online rescheduling closes N hours before start
  MAX_RESCHEDULES: 3,
  RESCHEDULE_LINK_EXPIRY_DAYS: 0, // 0 = link valid until the appointment
  ALLOW_CLIENT_CANCEL: true,
  REQUIRE_RESCHEDULE_REASON: false,
  REMINDER_HOURS: [24, 2],

  // --- Uploads ----------------------------------------------------------------
  // Vercel functions accept request bodies up to 4.5 MB, so keep per-file
  // size ≤ 4 MB unless you switch STORAGE_DRIVER to s3 (see README).
  MAX_UPLOAD_MB: 4,
  MAX_UPLOAD_FILES: 5,
  ALLOWED_UPLOAD_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
  ALLOWED_UPLOAD_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png'],

  // --- Identifiers ------------------------------------------------------------
  APPOINTMENT_PREFIX: 'JLTC-',
  TOKEN_LENGTH: 12, // booking & reschedule link tokens (base62 ≈ 71 bits)

  // --- Admin calendar ---------------------------------------------------------
  CALENDAR_START_HOUR: 7,
  CALENDAR_END_HOUR: 23,

  // --- Upsell services offered in the doctor/admin pickers --------------------
  UPSELL_SERVICES: [
    { name: 'Lab Test', defaultAmount: 250 },
    { name: 'IV Therapy', defaultAmount: 350 },
    { name: 'Follow-up Consultation', defaultAmount: 0 },
    { name: 'Doctor Home Visit', defaultAmount: 400 },
    { name: 'Physiotherapy', defaultAmount: 300 },
    { name: 'Nurse Visit', defaultAmount: 200 },
  ],

  SUPPORT_EMAIL: 'healthcare@justlife.com',
  SUPPORT_PHONE: '+971 4 000 0000',
};

export default CONFIG;
