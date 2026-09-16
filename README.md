# eyequipment website scripts

Public browser scripts for the eyequipment Webflow / Storesynk storefront.

- `eyequipment-b2b-site.js`: existing B2B storefront integration.
- `eyequipment-assistant.js`: generated assistant bundle, including styles.
- `assistant/assistant.js` and `assistant/assistant.css`: editable assistant sources.

## Build the assistant

Use Node.js and install the pinned build dependency:

```sh
npm install
npm run build:assistant
```

Alternatively pass a local Terser UMD bundle path to `node assistant/build.cjs`.
The build writes `eyequipment-assistant.js` in the repository root and an inline
preview/fallback in `assistant/webflow-footer.html`.

## Webflow integration

Load the B2B file in the head and the assistant file in the footer using jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/gh/morofynn/eyequipment@COMMIT/eyequipment-b2b-site.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/morofynn/eyequipment@COMMIT/eyequipment-assistant.js"></script>
```

Replace `COMMIT` with the tested full commit SHA. This keeps releases reproducible
and prevents caches from mixing versions. After changing a script, commit and
push it, test the new CDN URL, update the corresponding Webflow script URL, and
publish Webflow. Previously pinned versions remain available for rollback.

The assistant starts its newsletter invitation after 30 seconds of visit time,
retains time across internal page navigation, and waits 24 hours after an offer
or answer. Known subscribers, pending email confirmations and B2B customers are
excluded. No chat/contact data is stored in this repository or sent to GitHub;
GitHub/jsDelivr only deliver the public browser code. Storefront configuration
is read from the existing page runtime. Never commit private tokens or local
credentials.

The repository was renamed from `morofynn/eyequipment-b2b` to
`morofynn/eyequipment`; the B2B script filename and existing history are preserved.
