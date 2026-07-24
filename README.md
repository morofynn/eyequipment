# eyequipment B2B bundles

Embedded Shopify app for creating a B2B bundle from an existing B2C product.

## Rules

- `Tücher`: EUR 6.00 per bundle variant
- `Mäppchen`: EUR 5.00 per bundle variant
- `Händlerzubehör`: skipped because these products are already intended for B2B
- The generated title is `<B2C title> B2B`
- Existing product data, variants, images, tags, and metafields are duplicated
- Every generated variant contains the matching B2C variant with quantity `1`
- The tag `B2B` is added
- The existing product metafield `custom.moq` is set to `10`
- The existing boolean product metafield `custom.is-b2b` is set to `true`
- The product is added to the `B2B` collection
- The product is activated and published only to:
  - `Online Store`
  - `Headless`
  - `Point of Sale`
- `Shop` and all other publications are explicitly excluded

Products are matched by the Shopify **product type**, not by their title.

## Synchronization

The app includes an **Alle prüfen und aktualisieren** action. It matches each
eligible B2C product with `<title> B2B` and synchronizes changed:

- titles, descriptions, vendor, product type, tags, SEO, and status
- product images and custom product metafields
- bundle component relationships
- fixed B2B prices and minimum order quantity
- B2B sales-channel publications

The app stores the source product and its last synchronized timestamp in
app-owned metafields. Unchanged bundles are skipped.
The related-products field `shopyflow--recommendation.related_products` is
checked as well; missing corresponding B2B bundles are reported.

The same workflows can be run locally without hosting:

```sh
pnpm b2b:create
pnpm b2b:update
```

Der Update-Befehl speichert einen lokalen Katalog-Snapshot unter
`.data/b2b-catalog-memory.json`. Unveränderte Kataloge werden über eine schnelle
Zeitstempelprüfung übersprungen. Wird ein gespeichertes B2C-Produkt vom Typ Tuch
oder Mäppchen in Shopify gelöscht, setzt der nächste Update-Lauf das zugehörige
`<Produktname> B2B` automatisch auf Entwurf.

## Setup

```sh
pnpm setup
pnpm dev
```

After changing scopes or metafield definitions, deploy the configuration and
approve the updated app permissions:

```sh
pnpm deploy
```

The app requires these Admin API scopes:

- `read_products`
- `write_products`
- `read_publications`
- `write_publications`
- `read_quick_sale`
- file and referenced-resource scopes required by Shopify for image and
  metafield synchronization

## Publication names

The default publication roles are resolved automatically:

```text
Onlineshop/Online Store, any Headless publication, Point of Sale
```

If the headless publication uses another title in the shop, set:

```sh
B2B_PUBLICATION_NAMES="Online Store,<actual headless title>,Point of Sale"
```

The workflow aborts before creating a product when a required publication
cannot be found. This prevents accidental publication to `Shop`.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm shopify app config validate --json
```
