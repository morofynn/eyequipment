const B2B_TAG = "B2B";
const B2B_COLLECTION_TITLE = "B2B";
const DEFAULT_PUBLICATIONS = ["online-store", "headless", "point-of-sale"];

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type UserError = {
  field?: string[] | null;
  message: string;
  code?: string | null;
};

type Variant = {
  id: string;
  position: number;
  sku?: string | null;
};

type SourceProduct = {
  id: string;
  title: string;
  updatedAt: string;
  handle: string;
  productType: string;
  tags: string[];
  variants: { nodes: Variant[] };
};

type Publication = {
  id: string;
  name: string;
};

export type B2BBundleResult = {
  productId: string;
  title: string;
  price: string;
  publicationNames: string[];
  collectionTitle: string;
  sourceProductId: string;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("de-DE");
}

function priceFor(product: SourceProduct) {
  const productType = normalize(product.productType);

  if (productType === "händlerzubehör") {
    throw new Error(
      "Händlerzubehör ist bereits für Händler bestimmt und wird nicht als B2B-Bundle dupliziert.",
    );
  }
  if (["tuch", "tücher"].includes(productType)) return "7.14";
  if (["mäppchen"].includes(productType)) return "5.95";

  throw new Error(
    `Produkttyp „${product.productType || "nicht gesetzt"}“ ist noch nicht für B2B konfiguriert. Bitte zuerst B2B-Preis und Mindestbestellmenge festlegen.`,
  );
}

function minimumOrderQuantityFor(product: SourceProduct) {
  const productType = normalize(product.productType);
  if (["tuch", "tücher"].includes(productType)) return "5";
  if (productType === "mäppchen") return "3";
  throw new Error(
    `Produkttyp „${product.productType || "nicht gesetzt"}“ hat keine konfigurierte Mindestbestellmenge.`,
  );
}

function targetPublicationNames() {
  const configured = process.env.B2B_PUBLICATION_NAMES?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_PUBLICATIONS;
}

function publicationLabel(name: string) {
  return name.replace(/^Channel Catalog \d+ for /i, "").trim();
}

function publicationMatches(publication: Publication, target: string) {
  const label = normalize(publicationLabel(publication.name));
  const normalizedTarget = normalize(target);

  if (normalizedTarget === "online-store") {
    return ["online store", "onlineshop"].includes(label);
  }
  if (normalizedTarget === "headless") return label.includes("headless");
  if (normalizedTarget === "point-of-sale") return label === "point of sale";
  return label === normalizedTarget;
}

function assertNoUserErrors(operation: string, errors?: UserError[] | null) {
  if (!errors?.length) return;
  throw new Error(
    `${operation}: ${errors.map((error) => error.message).join("; ")}`,
  );
}

async function graphql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }
  if (!body.data) throw new Error("Shopify hat keine Daten zurückgegeben.");
  return body.data;
}

async function getSourceProduct(admin: AdminClient, productId: string) {
  const data = await graphql<{ product: SourceProduct | null }>(
    admin,
    `#graphql
      query B2BSourceProduct($id: ID!) {
        product(id: $id) {
          id
          title
          updatedAt
          handle
          productType
          tags
          variants(first: 250) {
            nodes {
              id
              position
              sku
            }
          }
        }
      }
    `,
    { id: productId },
  );

  if (!data.product) throw new Error("Das ausgewählte Produkt wurde nicht gefunden.");
  if (data.product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG))) {
    throw new Error("Das ausgewählte Produkt ist bereits als B2B gekennzeichnet.");
  }
  if (data.product.title.trim().toLocaleUpperCase("de-DE").endsWith(" B2B")) {
    throw new Error("Das ausgewählte Produkt ist bereits eine B2B-Version.");
  }
  if (!data.product.variants.nodes.length) {
    throw new Error("Das ausgewählte Produkt besitzt keine Varianten.");
  }

  return data.product;
}

async function getPublications(admin: AdminClient) {
  const data = await graphql<{
    publications: {
      nodes: Array<{ id: string; catalog: { title: string } | null }>;
    };
  }>(
    admin,
    `#graphql
      query B2BPublications {
        publications(first: 100) {
          nodes {
            id
            catalog {
              title
            }
          }
        }
      }
    `,
  );
  return data.publications.nodes
    .filter(
      (publication): publication is { id: string; catalog: { title: string } } =>
        Boolean(publication.catalog?.title),
    )
    .map((publication) => ({
      id: publication.id,
      name: publication.catalog.title,
    }));
}

async function duplicateProduct(
  admin: AdminClient,
  source: SourceProduct,
  price: string,
) {
  const title = `${source.title} B2B`;
  const data = await graphql<{
    productDuplicate: {
      newProduct: {
        id: string;
        title: string;
        variants: { nodes: Variant[] };
      } | null;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
      mutation B2BDuplicateProduct(
        $productId: ID!
        $newTitle: String!
        $includeImages: Boolean!
        $newStatus: ProductStatus!
      ) {
        productDuplicate(
          productId: $productId
          newTitle: $newTitle
          includeImages: $includeImages
          newStatus: $newStatus
          synchronous: true
        ) {
          newProduct {
            id
            title
            variants(first: 250) {
              nodes {
                id
                position
                sku
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      productId: source.id,
      newTitle: title,
      includeImages: true,
      newStatus: "ACTIVE",
    },
  );
  assertNoUserErrors("Produkt duplizieren", data.productDuplicate.userErrors);
  const duplicate = data.productDuplicate.newProduct;
  if (!duplicate) throw new Error("Das B2B-Produkt konnte nicht erstellt werden.");

  const sourceByPosition = new Map(
    source.variants.nodes.map((variant) => [variant.position, variant]),
  );
  const variantUpdates = duplicate.variants.nodes.map((variant) => {
    const sourceVariant = sourceByPosition.get(variant.position);
    if (!sourceVariant) {
      throw new Error(`Keine B2C-Variante für Position ${variant.position} gefunden.`);
    }
    return {
      id: variant.id,
      price,
      compareAtPrice: null,
    };
  });

  const updateData = await graphql<{
    productVariantsBulkUpdate: {
      productVariants: Array<{ id: string }>;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
      mutation B2BUpdateVariantPrices(
        $productId: ID!
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { productId: duplicate.id, variants: variantUpdates },
  );
  assertNoUserErrors(
    "B2B-Preise setzen",
    updateData.productVariantsBulkUpdate.userErrors,
  );

  return duplicate;
}

async function markProduct(
  admin: AdminClient,
  productId: string,
  source: SourceProduct,
) {
  const minimumOrderQuantity = minimumOrderQuantityFor(source);
  const tags = Array.from(new Set([...source.tags, B2B_TAG]));
  const updateData = await graphql<{
    productUpdate: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BMarkProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { product: { id: productId, tags, status: "ACTIVE" } },
  );
  assertNoUserErrors("B2B-Produkt markieren", updateData.productUpdate.userErrors);

  const metafieldData = await graphql<{
    metafieldsSet: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSetSourceMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: "$app",
          key: "source_product",
          type: "product_reference",
          value: source.id,
        },
        {
          ownerId: productId,
          namespace: "$app",
          key: "source_updated_at",
          type: "date_time",
          value: source.updatedAt,
        },
        {
          ownerId: productId,
          namespace: "custom",
          key: "moq",
          type: "number_integer",
          value: minimumOrderQuantity,
        },
        {
          ownerId: productId,
          namespace: "custom",
          key: "is-b2b",
          type: "boolean",
          value: "true",
        },
      ],
    },
  );
  assertNoUserErrors("Quellprodukt speichern", metafieldData.metafieldsSet.userErrors);
}

async function createVariantRelationships(
  admin: AdminClient,
  source: SourceProduct,
  duplicateVariants: Variant[],
) {
  const sourceByPosition = new Map(
    source.variants.nodes.map((variant) => [variant.position, variant]),
  );
  const input = duplicateVariants.map((variant) => {
    const sourceVariant = sourceByPosition.get(variant.position);
    if (!sourceVariant) {
      throw new Error(`Keine B2C-Variante für Position ${variant.position} gefunden.`);
    }
    return {
      parentProductVariantId: variant.id,
      productVariantRelationshipsToCreate: [
        { id: sourceVariant.id, quantity: 1 },
      ],
    };
  });

  const data = await graphql<{
    productVariantRelationshipBulkUpdate: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BCreateBundleRelationships(
        $input: [ProductVariantRelationshipUpdateInput!]!
      ) {
        productVariantRelationshipBulkUpdate(input: $input) {
          parentProductVariants {
            id
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    { input },
  );
  assertNoUserErrors(
    "Bundle-Komponenten verknüpfen",
    data.productVariantRelationshipBulkUpdate.userErrors,
  );
}

async function setBundlePrices(
  admin: AdminClient,
  productId: string,
  variants: Variant[],
  price: string,
) {
  const data = await graphql<{
    productVariantsBulkUpdate: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BFinalizeVariantPrices(
        $productId: ID!
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      productId,
      variants: variants.map((variant) => ({ id: variant.id, price })),
    },
  );
  assertNoUserErrors(
    "Finale B2B-Preise setzen",
    data.productVariantsBulkUpdate.userErrors,
  );
}

async function addToB2BCollection(admin: AdminClient, productId: string) {
  const queryData = await graphql<{
    collections: {
      nodes: Array<{ id: string; title: string; ruleSet: unknown | null }>;
    };
  }>(
    admin,
    `#graphql
      query B2BCollection {
        collections(first: 10, query: "title:B2B") {
          nodes {
            id
            title
            ruleSet {
              appliedDisjunctively
            }
          }
        }
      }
    `,
  );
  const collection = queryData.collections.nodes.find(
    (item) => normalize(item.title) === normalize(B2B_COLLECTION_TITLE),
  );

  if (!collection) {
    const createData = await graphql<{
      collectionCreate: { collection: { id: string } | null; userErrors: UserError[] };
    }>(
      admin,
      `#graphql
        mutation B2BCreateCollection($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        input: {
          title: B2B_COLLECTION_TITLE,
          ruleSet: {
            appliedDisjunctively: false,
            rules: [{ column: "TAG", relation: "EQUALS", condition: B2B_TAG }],
          },
        },
      },
    );
    assertNoUserErrors(
      "B2B-Kollektion erstellen",
      createData.collectionCreate.userErrors,
    );
    return;
  }

  if (collection.ruleSet) return;

  const addData = await graphql<{
    collectionAddProducts: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BAddToCollection($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          collection {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: collection.id, productIds: [productId] },
  );
  assertNoUserErrors(
    "Zur B2B-Kollektion hinzufügen",
    addData.collectionAddProducts.userErrors,
  );
}

async function setPublications(
  admin: AdminClient,
  productId: string,
  publications: Publication[],
) {
  const wantedNames = targetPublicationNames();
  const wanted = publications.filter((publication) =>
    wantedNames.some((name) => publicationMatches(publication, name)),
  );
  const missing = wantedNames.filter(
    (name) => !publications.some((publication) => publicationMatches(publication, name)),
  );
  if (missing.length) {
    throw new Error(
      `Vertriebskanal nicht gefunden: ${missing.join(", ")}. Verfügbare Kanäle: ${publications.map((item) => item.name).join(", ")}`,
    );
  }

  const unwanted = publications.filter(
    (publication) => !wanted.some((item) => item.id === publication.id),
  );
  if (unwanted.length) {
    const unpublishData = await graphql<{
      publishableUnpublish: { userErrors: UserError[] };
    }>(
      admin,
      `#graphql
        mutation B2BUnpublishOtherChannels(
          $id: ID!
          $input: [PublicationInput!]!
        ) {
          publishableUnpublish(id: $id, input: $input) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        id: productId,
        input: unwanted.map((publication) => ({
          publicationId: publication.id,
        })),
      },
    );
    assertNoUserErrors(
      "Andere Vertriebskanäle deaktivieren",
      unpublishData.publishableUnpublish.userErrors,
    );
  }

  const publishData = await graphql<{
    publishablePublish: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BPublishChannels($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: productId,
      input: wanted.map((publication) => ({ publicationId: publication.id })),
    },
  );
  assertNoUserErrors(
    "B2B-Produkt veröffentlichen",
    publishData.publishablePublish.userErrors,
  );

  return wanted.map((publication) => publicationLabel(publication.name));
}

async function verifyResult(
  admin: AdminClient,
  productId: string,
  expectedMinimumOrderQuantity: number,
) {
  const data = await graphql<{
    product: {
      id: string;
      title: string;
      sourceProduct: { jsonValue: string } | null;
      minimumOrderQuantity: { jsonValue: number } | null;
      isB2B: { jsonValue: boolean } | null;
    } | null;
  }>(
    admin,
    `#graphql
      query B2BVerifyProduct($id: ID!) {
        product(id: $id) {
          id
          title
          sourceProduct: metafield(namespace: "$app", key: "source_product") {
            jsonValue
          }
          minimumOrderQuantity: metafield(namespace: "custom", key: "moq") {
            jsonValue
          }
          isB2B: metafield(namespace: "custom", key: "is-b2b") {
            jsonValue
          }
        }
      }
    `,
    { id: productId },
  );
  if (
    !data.product?.sourceProduct ||
    data.product.minimumOrderQuantity?.jsonValue !== expectedMinimumOrderQuantity ||
    data.product.isB2B?.jsonValue !== true
  ) {
    throw new Error("Die abschließende Prüfung des B2B-Produkts ist fehlgeschlagen.");
  }
  return data.product;
}

export async function createB2BBundle(
  admin: AdminClient,
  sourceProductId: string,
): Promise<B2BBundleResult> {
  const [source, publications] = await Promise.all([
    getSourceProduct(admin, sourceProductId),
    getPublications(admin),
  ]);
  const price = priceFor(source);

  const requiredNames = targetPublicationNames();
  const missing = requiredNames.filter(
    (name) => !publications.some((publication) => publicationMatches(publication, name)),
  );
  if (missing.length) {
    throw new Error(
      `Vertriebskanal nicht gefunden: ${missing.join(", ")}. Verfügbare Kanäle: ${publications.map((item) => item.name).join(", ")}`,
    );
  }

  const duplicate = await duplicateProduct(admin, source, price);
  await markProduct(admin, duplicate.id, source);
  await createVariantRelationships(admin, source, duplicate.variants.nodes);
  await setBundlePrices(admin, duplicate.id, duplicate.variants.nodes, price);
  await addToB2BCollection(admin, duplicate.id);
  const publicationNames = await setPublications(
    admin,
    duplicate.id,
    publications,
  );
  const verified = await verifyResult(
    admin,
    duplicate.id,
    Number(minimumOrderQuantityFor(source)),
  );

  return {
    productId: verified.id,
    title: verified.title,
    price,
    publicationNames,
    collectionTitle: B2B_COLLECTION_TITLE,
    sourceProductId: source.id,
  };
}
