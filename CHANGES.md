# NeoCare – logic-fix pass (14 Oct 2026)

Every change below was verified with automated checks (see "How it was verified").
No new npm packages were added.

## Security
- **Announcement links (stored XSS):** `actionUrl` is now validated with an allowlist
  (`http://`, `https://`, or a same-site path starting with a single `/`) in
  `backend/src/utils/safeUrl.js`. The old "does not start with javascript:" check could be
  bypassed with tabs/newlines/control characters. `MarqueeBanner.jsx` re-checks with
  `web-dashboard/src/utils/safeUrl.js` before rendering the link. A `null` URL no longer causes a 500.
- **Admin-room leak:** nurses and doctors no longer join `room:hospital_admin:<id>`,
  so approval queues and discharge requests reach only the Hospital In-Charge.
- **Doctor/nurse notifications** are now delivered live to that one user (`room:user:<id>`).
- **Delete events** (user, ward, incubator, patient, hospital, announcement, reject, discharge
  requests) are scoped to the owning hospital instead of broadcast to every hospital.
- **Socket handshake** also rejects suspended / unapproved accounts.

## Accounts and permissions
- `rejectUser` deletes the registered hospital only if it is an empty shell (no other users,
  wards or incubators). It can no longer wipe a real hospital.
- **Offboarding path:** a System Admin can now remove a Hospital In-Charge when no patients are
  admitted in that hospital (409 otherwise). Previously such a hospital could never be deleted.
- `assignUser` (hospital admin): cannot touch another Hospital In-Charge (no more silent demotion
  to nurse); `wardId` must belong to the admin's hospital. System admin: `hospitalId` must exist.
- `updateUser`: cannot edit another Hospital In-Charge; `wardId` must belong to the hospital;
  role changes apply to doctors/nurses only.
- `registerStaff` (admin-created) and `updateIncubator`: `wardId` must belong to the hospital.

## Alerts
- Acknowledging is atomic and first-wins: a second nurse no longer overwrites the first
  acknowledger's name and time, and no duplicate broadcast is sent. Invalid id -> 400.
- All open screens update when someone acknowledges (`alert:change` listener in the Dashboard).
- Discharging a patient closes that patient's open alerts (both direct discharge and discharge-request
  approval), so the next patient in the bed doesn't inherit old alarms.

## Data
- `deletePatient` also removes the patient's vitals, alerts and notes, and invalidates the MQTT cache.
- `GET /vitals/:id`: `limit` capped at 5000, invalid `from`/`to` return 400. `GET /vitals/:id/stats`: `hours` clamped to 1-720.

## Web dashboard
- `web-dashboard/src/utils/vitalsStatus.js` is now the single place for CRITICAL/WARNING bands and
  mirrors `alertEngine.js` exactly (checked on 483 sample values). `null`/missing readings are no
  longer shown as CRITICAL (`null < 80` is true in JavaScript), and HR/SpO2 = 0 is critical.

## Mobile app (minimum to work again with the secured backend)
- Socket now sends the saved JWT (re-read on every reconnect); `resetSocket()` added for logout.
- History and Dashboard load the user's incubator IDs from `/vitals/devices` (IDs are generated now,
  `incubator_01` no longer exists) and send the auth header. Null-safe status colours.

## Not changed (needs a decision from you)
- FCM still uses the retired legacy endpoint and no `fcmToken` is stored.
- `approveUser` still marks `isEmailVerified = true`.
- No login rate limit, password-strength or email-format validation.
- Nurse ward scope is still enforced only on list endpoints.
- Any doctor can request a discharge for any patient in their hospital.
- `/users/me` failing for any reason still logs the user out.
- Mobile app still needs a full multi-tenant rewrite (hospital/ward context, `localhost` URLs).
- `.env` files are not in this zip; keep yours, and rotate the credentials from the earlier zips.

## How it was verified
- `node --check` on every backend file; clean `npm ci` + `vite build` of the dashboard (960 modules);
  mobile files parsed with esbuild.
- 82 behavioural checks: URL allowlist (incl. the tab/newline/control-char bypasses), socket rooms and
  scoped emits, vitals bands vs backend, and the changed controllers run against in-memory fake models.
- **Not run:** the backend against a real MongoDB / MQTT broker, and the Expo app on a device.
