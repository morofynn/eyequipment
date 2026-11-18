# eyequipment Newsletter – Webflow Cloud

Separate GitHub branch `newsletter-cloud`; no changes to the site's main branch. Mount at `/newsletter-service` on the existing eyequipment Webflow site. Initial environment uses only `https://eyequipment.webflow.io` as PUBLIC_ORIGIN. Do not enable production before a complete confirmation and welcome-discount test.

## Server variables

- ENABLED: `false` until configured and tested.
- PUBLIC_ORIGIN: `https://eyequipment.webflow.io` for staging; production later uses its canonical origin.
- MOUNT_PATH: `/newsletter-service`
- SHOPIFY_ADMIN_TOKEN (secret): installed app token with read_customers and write_customers; do not use the connector's credentials.
- RATE_LIMIT_SECRET (secret): independently generated random value, at least 32 characters.
- SMTP_HOST: the actual ALL-INKL KAS server, such as the server shown in the mailbox settings; never guess the account-specific hostname.
- SMTP_USERNAME, SMTP_PASSWORD (secrets): ALL-INKL mailbox SMTP login. No KAS account password.
- MAIL_FROM: `info@eyequipment.com`, authorized for that mailbox.

Do not put any secret in GitHub, PUBLIC_ variables, frontend JavaScript or logs. ALL-INKL delivery uses TLS on port 465 through the Workers TCP socket API. This must be tested on Webflow Cloud; local Node cannot import cloudflare:sockets. No additional mail provider.

## Flow

POST api/signup accepts JSON `{email,consent:true,website:""}`. Same-origin only, durable per-IP/per-email rate limits and a honeypot. New profiles remain PENDING. Existing subscribed profiles are left unchanged; previous welcome tags are retained. Only a successful SMTP acceptance yields the acknowledgement. SMTP acceptance does not prove inbox delivery.

Confirmation tokens contain 256 random bits, are stored only as hashes in SQLite and expire after 24 hours. The email link passes the token in the URL fragment, so it is not included in server access logs. GET never changes consent (mail scanner safe); the confirmation page requires an explicit click and POST. A lease prevents concurrent confirmations, and revoked subscriptions are not silently reactivated. Shopify is updated to SUBSCRIBED/CONFIRMED_OPT_IN only after verification. Existing Shopify welcome automation must be tested with this Admin API transition.

The private data retained temporarily are the Shopify customer ID and salted hashes of email/IP, timestamps and consent version. Expired rows are deleted on signup traffic; if no more requests arrive, expired rows persist until next signup. Configure scheduled cleanup if a fixed retention deletion deadline is required.

## Release checklist

1. Connect the GitHub repository and branch in Webflow Cloud. Declare the DB binding and apply migrations.
2. Add secrets directly to the Cloud environment and redeploy. Initially disabled.
3. Build, unit tests, staging SMTP/TLS test, actual confirmation, welcome automation check, expired/reused-token checks.
4. Switch the Webflow popup from window.open to same-origin fetch. Keep 30-second timing.
5. Publish production only once the complete path is verified. No Shopify theme publication is needed.

Current state: local server build and seven unit/protocol tests pass. Shopify GraphQL operations validated against 2026-10. No production Cloud deployment, credentials or live SMTP test yet. Frontend still uses the older staging window flow until the backend is operational.
