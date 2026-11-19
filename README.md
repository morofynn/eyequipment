# eyequipment newsletter service

The Webflow popup opens after 30 seconds and submits explicit email newsletter
consent to `/newsletter-service/api/signup` on the same origin. The server calls
Shopify Storefront `customerEmailMarketingSubscribe(email:)`. Shopify creates
missing customer records, sends its original marketing opt-in notification and
owns the confirmation link. The existing Shopify welcome workflow sends the
first-purchase discount after confirmation; delivery can be delayed.

There is no SMTP transport, ALL-INKL integration, own confirmation page, Admin
customer creation, Admin consent update, popup window or theme preview fallback.
The mutation is currently only in `unstable`; it has been tested in this store
for existing and new customers. Fail closed if Shopify changes it.

## Webflow Cloud configuration

- `ENABLED=true`
- `PUBLIC_ORIGIN`: exact HTTPS origin serving popup and endpoint
- `SHOPIFY_STOREFRONT_TOKEN`: existing Storefront access with
  `unauthenticated_write_customers`; Cloud configuration only, never Git
- `RATE_LIMIT_SECRET`: random secret of at least 32 characters
- D1 binding `DB`: durable global, per-email and optional trusted IP limits
- Mount `/newsletter-service`

Remove obsolete SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, MAIL_FROM,
SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET and SHOPIFY_ADMIN_TOKEN variables.
The service no longer reads them. Historical migrations remain compatible with
existing databases; no new confirmation records are generated.

## Validation

Run `npm test` and `npm run build`. Tests cover the Storefront contract, errors,
retry, origin validation, limits, inline submission and the 30-second delay.
Publish staging first and exercise the native Webflow form against the actual
endpoint. Submission acknowledgement does not prove confirmed consent or mail
delivery. Check Shopify state after the real opt-in click, then separately check
welcome workflow execution and actual mailbox arrival.

## Existing storefront scripts

The repository also keeps the existing B2B, language and assistant browser
scripts. The assistant remains buildable with `npm run build:assistant`; its
source and integration documentation are in `assistant/README.md`. Existing
pinned CDN releases are unaffected by the newsletter service.
