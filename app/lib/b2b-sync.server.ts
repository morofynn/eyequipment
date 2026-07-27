const B2B_TAG = "B2B";
const MOQ_NAMESPACE = "custom";
const MOQ_KEY = "moq";
const B2B_FLAG_NAMESPACE = "custom";
const B2B_FLAG_KEY = "is-b2b";
const B2B_FLAG_VALUE = "true";
const RELATED_NAMESPACE = "shopyflow--recommendation";
const RELATED_KEY = "related_products";
import {
  inspectCatalogChanges,
  saveCatalogSnapshot,
} from "./catalog-memory.server.ts";

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

type ProductImage = {
  id: string;
  altText: string | null;
  url: string;
};

type Metafield = {
  namespace: string;
  key: string;
  type: string;
  value: string;
};

type Variant = {
  id: string;
  position: number;
  price: string;
  compareAtPrice: string | null;
  productVariantComponents: {
    nodes: Array<{ productVariant: { id: string } }>;
  };
};

type SyncProduct = {
  id: string;
  title: string;
  updatedAt: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  seo: { title: string | null; description: string | null };
  variants: { nodes: Variant[] };
  images: { nodes: ProductImage[] };
  metafields: { nodes: Metafield[] };
  sourceUpdatedAt: { value: string } | null;
  minimumOrderQuantity: { value: string } | null;
  isB2B: { value: string } | null;
  relatedProducts: { jsonValue: string[] } | null;
};

type Publication = {
  id: string;
  label: string;
};

export type B2BSyncResult = {
  checked: number;
  updated: number;
  drafted: number;
  flagged: number;
  relatedUpdated: number;
  unchanged: number;
  added: string[];
  changed: string[];
  deleted: string[];
  usedMemory: boolean;
  unconfiguredProductTypes: string[];
  missing: string[];
  missingRelated: string[];
  failed: Array<{ title: string; message: string }>;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("de-DE");
}

function priceFor(productType: string) {
  const normalized = normalize(productType);
  if (["tuch", "tücher"].includes(normalized)) return "6.00";
  if (normalized === "mäppchen") return "5.00";
  return null;
}

function minimumOrderQuantityFor(productType: string) {
  const normalized = normalize(productType);
  if (["tuch", "tücher"].includes(normalized)) return "5";
  if (normalized === "mäppchen") return "3";
  return null;
}

function isDealerAccessory(productType: string) {
  return normalize(productType) === "händlerzubehör";
}

function unconfiguredProductTypes(
  products: Array<{ productType: string; title: string; tags: string[] }>,
) {
  return [
    ...new Set(
      products
        .filter(
          (product) =>
            !priceFor(product.productType) &&
            !isDealerAccessory(product.productType) &&
            !product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)) &&
            !product.title.endsWith(" B2B"),
        )
        .map((product) => product.productType || "Nicht gesetzt"),
    ),
  ].sort((a, b) => a.localeCompare(b, "de"));
}

function assertNoErrors(operation: string, errors?: UserError[] | null) {
  if (!errors?.length) return;
  throw new Error(
    `${operation}: ${errors.map((error) => error.message).join("; ")}`,
  );
}

async function graphql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
) {
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

function publicationLabel(title: string) {
  return title.replace(/^Channel Catalog \d+ for /i, "").trim();
}

function isWantedPublication(label: string) {
  const normalized = normalize(label);
  return (
    ["online store", "onlineshop", "point of sale"].includes(normalized) ||
    normalized.includes("headless")
  );
}

async function loadCatalog(admin: AdminClient) {
  const products: SyncProduct[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page: {
      products: {
        nodes: SyncProduct[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await graphql(
      admin,
      `#graphql
        query B2BSyncCatalogPage($after: String) {
          products(first: 25, after: $after, sortKey: TITLE) {
            nodes {
              id
              title
              updatedAt
              descriptionHtml
              vendor
              productType
              tags
              status
              seo {
                title
                description
              }
              variants(first: 20) {
                nodes {
                  id
                  position
                  price
                  compareAtPrice
                  productVariantComponents(first: 10) {
                    nodes {
                      productVariant {
                        id
                      }
                    }
                  }
                }
              }
              images(first: 30) {
                nodes {
                  id
                  altText
                  url
                }
              }
              metafields(first: 50, namespace: "custom") {
                nodes {
                  namespace
                  key
                  type
                  value
                }
              }
              sourceUpdatedAt: metafield(
                namespace: "$app"
                key: "source_updated_at"
              ) {
                value
              }
              minimumOrderQuantity: metafield(namespace: "custom", key: "moq") {
                value
              }
              isB2B: metafield(namespace: "custom", key: "is-b2b") {
                value
              }
              relatedProducts: metafield(
                namespace: "shopyflow--recommendation"
                key: "related_products"
              ) {
                jsonValue
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after },
    );
    products.push(...page.products.nodes);
    hasNextPage = page.products.pageInfo.hasNextPage;
    after = page.products.pageInfo.endCursor;
  }

  const publicationData = await graphql<{
    publications: {
      nodes: Array<{ id: string; catalog: { title: string } | null }>;
    };
  }>(
    admin,
    `#graphql
      query B2BSyncPublications {
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

  return { products: { nodes: products }, publications: publicationData.publications };
}

function mediaSignature(images: ProductImage[]) {
  return images
    .map((item) => {
      const filename = item.url.split("?")[0]?.split("/").pop() ?? "";
      return `${item.altText ?? ""}|${filename}`;
    })
    .sort()
    .join("\n");
}

function componentsMatch(source: SyncProduct, target: SyncProduct) {
  const sourceByPosition = new Map(
    source.variants.nodes.map((variant) => [variant.position, variant.id]),
  );
  return target.variants.nodes.every((variant) => {
    const components = variant.productVariantComponents.nodes;
    return (
      components.length === 1 &&
      components[0]?.productVariant.id === sourceByPosition.get(variant.position)
    );
  });
}

function needsSync(source: SyncProduct, target: SyncProduct, price: string) {
  const minimumOrderQuantity = minimumOrderQuantityFor(source.productType)!;
  const expectedTags = [...new Set([...source.tags, B2B_TAG])].sort();
  const currentTags = [...target.tags].sort();
  return (
    target.sourceUpdatedAt?.value !== source.updatedAt ||
    target.minimumOrderQuantity?.value !== minimumOrderQuantity ||
    target.title !== `${source.title} B2B` ||
    target.descriptionHtml !== source.descriptionHtml ||
    target.vendor !== source.vendor ||
    target.productType !== source.productType ||
    target.status !== "ACTIVE" ||
    JSON.stringify(currentTags) !== JSON.stringify(expectedTags) ||
    target.variants.nodes.some(
      (variant) => !variant.compareAtPrice && variant.price !== price,
    ) ||
    !componentsMatch(source, target) ||
    mediaSignature(source.images.nodes) !== mediaSignature(target.images.nodes)
  );
}

function sortedReferences(product: {
  relatedProducts: { jsonValue: string[] } | null;
}) {
  return [...(product.relatedProducts?.jsonValue ?? [])].sort();
}

function relatedBundleReferences(
  source: { id: string; relatedProducts: { jsonValue: string[] } | null },
  products: Array<{
    id: string;
    title: string;
    productType: string;
    tags: string[];
    relatedProducts: { jsonValue: string[] } | null;
  }>,
) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const bundleBySourceId = new Map<string, string>();

  for (const candidate of products) {
    if (
      candidate.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)) &&
      candidate.title.endsWith(" B2B")
    ) {
      const sourceProduct = products.find(
        (product) =>
          product.title === candidate.title.slice(0, -4) &&
          !product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)),
      );
      if (sourceProduct) bundleBySourceId.set(sourceProduct.id, candidate.id);
    }
  }

  const expected: string[] = [];
  const missing: string[] = [];
  for (const relatedId of source.relatedProducts?.jsonValue ?? []) {
    const related = byId.get(relatedId);
    const bundleId = bundleBySourceId.get(relatedId);
    if (bundleId) expected.push(bundleId);
    else if (
      related &&
      (isDealerAccessory(related.productType) ||
        related.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)))
    ) {
      expected.push(related.id);
    }
    else missing.push(related?.title ?? relatedId);
  }
  return { expected: [...new Set(expected)].sort(), missing };
}

async function syncRelatedProducts(
  admin: AdminClient,
  targetId: string,
  relatedProductIds: string[],
) {
  const data = await graphql<{
    metafieldsSet: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSyncRelatedProducts($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            jsonValue
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
          ownerId: targetId,
          namespace: RELATED_NAMESPACE,
          key: RELATED_KEY,
          type: "list.product_reference",
          value: JSON.stringify(relatedProductIds),
        },
      ],
    },
  );
  assertNoErrors(
    "Verknüpfte B2B-Produkte aktualisieren",
    data.metafieldsSet.userErrors,
  );
}

async function syncProductFields(
  admin: AdminClient,
  source: SyncProduct,
  target: SyncProduct,
) {
  const data = await graphql<{
    productUpdate: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSyncProductFields($product: ProductUpdateInput!) {
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
    {
      product: {
        id: target.id,
        title: `${source.title} B2B`,
        descriptionHtml: source.descriptionHtml,
        vendor: source.vendor,
        productType: source.productType,
        tags: [...new Set([...source.tags, B2B_TAG])],
        status: "ACTIVE",
        seo: source.seo,
      },
    },
  );
  assertNoErrors("Produktdaten aktualisieren", data.productUpdate.userErrors);
}

async function draftProduct(admin: AdminClient, productId: string) {
  const data = await graphql<{
    productUpdate: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BDraftOrphanedBundle($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { product: { id: productId, status: "DRAFT" } },
  );
  assertNoErrors(
    "Verwaistes B2B-Bundle auf Entwurf setzen",
    data.productUpdate.userErrors,
  );
}

async function syncMetafields(
  admin: AdminClient,
  source: SyncProduct,
  target: SyncProduct,
) {
  const minimumOrderQuantity = minimumOrderQuantityFor(source.productType)!;
  const copied = source.metafields.nodes
    .filter(
      (metafield) =>
        metafield.namespace === "custom" &&
        !(
          (metafield.namespace === MOQ_NAMESPACE && metafield.key === MOQ_KEY) ||
          (metafield.namespace === B2B_FLAG_NAMESPACE &&
            metafield.key === B2B_FLAG_KEY)
        ),
    )
    .map((metafield) => ({
      ownerId: target.id,
      namespace: metafield.namespace,
      key: metafield.key,
      type: metafield.type,
      value: metafield.value,
    }));
  const data = await graphql<{
    metafieldsSet: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSyncMetafields($metafields: [MetafieldsSetInput!]!) {
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
        ...copied,
        {
          ownerId: target.id,
          namespace: "$app",
          key: "source_product",
          type: "product_reference",
          value: source.id,
        },
        {
          ownerId: target.id,
          namespace: "$app",
          key: "source_updated_at",
          type: "date_time",
          value: source.updatedAt,
        },
        {
          ownerId: target.id,
          namespace: MOQ_NAMESPACE,
          key: MOQ_KEY,
          type: "number_integer",
          value: minimumOrderQuantity,
        },
        {
          ownerId: target.id,
          namespace: B2B_FLAG_NAMESPACE,
          key: B2B_FLAG_KEY,
          type: "boolean",
          value: B2B_FLAG_VALUE,
        },
      ],
    },
  );
  assertNoErrors("Metafelder aktualisieren", data.metafieldsSet.userErrors);
}

async function setB2BFlag(admin: AdminClient, productId: string) {
  const data = await graphql<{
    metafieldsSet: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSetFlag($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            jsonValue
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
          namespace: B2B_FLAG_NAMESPACE,
          key: B2B_FLAG_KEY,
          type: "boolean",
          value: B2B_FLAG_VALUE,
        },
      ],
    },
  );
  assertNoErrors("B2B-Schalter setzen", data.metafieldsSet.userErrors);
}

async function syncImages(
  admin: AdminClient,
  source: SyncProduct,
  target: SyncProduct,
) {
  if (
    mediaSignature(source.images.nodes) === mediaSignature(target.images.nodes)
  ) {
    return;
  }

  const targetSignatures = new Set(
    target.images.nodes.map(
      (item) =>
        `${item.altText ?? ""}|${item.url.split("?")[0]?.split("/").pop() ?? ""}`,
    ),
  );
  const missing = source.images.nodes.filter(
    (item) =>
      !targetSignatures.has(
        `${item.altText ?? ""}|${item.url.split("?")[0]?.split("/").pop() ?? ""}`,
      ),
  );
  if (!missing.length) return;

  const data = await graphql<{
    productUpdate: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSyncImages(
        $product: ProductUpdateInput!
        $media: [CreateMediaInput!]
      ) {
        productUpdate(product: $product, media: $media) {
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
    {
      product: { id: target.id },
      media: missing.map((item) => ({
        mediaContentType: "IMAGE",
        originalSource: item.url,
        alt: item.altText,
      })),
    },
  );
  assertNoErrors("Bilder aktualisieren", data.productUpdate.userErrors);
}

async function syncVariants(
  admin: AdminClient,
  source: SyncProduct,
  target: SyncProduct,
  price: string,
) {
  const sourceByPosition = new Map(
    source.variants.nodes.map((variant) => [variant.position, variant]),
  );
  if (source.variants.nodes.length !== target.variants.nodes.length) {
    throw new Error(
      "Variantenanzahl weicht ab. Das Bundle muss für diese Produktstruktur neu erstellt werden.",
    );
  }

  for (const targetVariant of target.variants.nodes) {
    const sourceVariant = sourceByPosition.get(targetVariant.position);
    if (!sourceVariant) {
      throw new Error(`Quellvariante an Position ${targetVariant.position} fehlt.`);
    }
    const currentComponents = targetVariant.productVariantComponents.nodes.map(
      (component) => component.productVariant.id,
    );
    if (
      currentComponents.length === 1 &&
      currentComponents[0] === sourceVariant.id
    ) {
      continue;
    }

    const relationshipData = await graphql<{
      productVariantRelationshipBulkUpdate: { userErrors: UserError[] };
    }>(
      admin,
      `#graphql
        mutation B2BSyncVariantRelationship(
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
      {
        input: [
          {
            parentProductVariantId: targetVariant.id,
            productVariantRelationshipsToRemove: currentComponents,
            productVariantRelationshipsToCreate: [
              { id: sourceVariant.id, quantity: 1 },
            ],
          },
        ],
      },
    );
    assertNoErrors(
      "Bundle-Komponente aktualisieren",
      relationshipData.productVariantRelationshipBulkUpdate.userErrors,
    );
  }

  const automaticPriceVariants = target.variants.nodes
    .filter((variant) => !variant.compareAtPrice)
    .map((variant) => ({ id: variant.id, price }));
  if (!automaticPriceVariants.length) return;

  const priceData = await graphql<{
    productVariantsBulkUpdate: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSyncPrices(
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
      productId: target.id,
      variants: automaticPriceVariants,
    },
  );
  assertNoErrors("B2B-Preise aktualisieren", priceData.productVariantsBulkUpdate.userErrors);
}

async function syncPublications(
  admin: AdminClient,
  productId: string,
  publications: Publication[],
) {
  const wanted = publications.filter((publication) =>
    isWantedPublication(publication.label),
  );
  const unwanted = publications.filter(
    (publication) => !wanted.some((item) => item.id === publication.id),
  );

  if (unwanted.length) {
    const data = await graphql<{
      publishableUnpublish: { userErrors: UserError[] };
    }>(
      admin,
      `#graphql
        mutation B2BSyncUnpublish($id: ID!, $input: [PublicationInput!]!) {
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
        input: unwanted.map(({ id }) => ({ publicationId: id })),
      },
    );
    assertNoErrors("Kanäle deaktivieren", data.publishableUnpublish.userErrors);
  }

  const data = await graphql<{
    publishablePublish: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
      mutation B2BSyncPublish($id: ID!, $input: [PublicationInput!]!) {
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
      input: wanted.map(({ id }) => ({ publicationId: id })),
    },
  );
  assertNoErrors("Kanäle veröffentlichen", data.publishablePublish.userErrors);
}

export async function syncAllB2BBundles(
  admin: AdminClient,
  shop: string,
): Promise<B2BSyncResult> {
  const memory = await inspectCatalogChanges(admin, shop);
  const relevantChange = [...memory.added, ...memory.changed].some(
    (product) =>
      Boolean(priceFor(product.productType)) ||
      isDealerAccessory(product.productType) ||
      product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)),
  );
  const missingB2BFlag = memory.current.some(
    (product) =>
      (isDealerAccessory(product.productType) ||
        product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG))) &&
      product.isB2B?.value !== B2B_FLAG_VALUE,
  );
  const incorrectMinimumOrderQuantity = memory.current.some(
    (product) => {
      const expected = minimumOrderQuantityFor(product.productType);
      return (
        expected &&
        product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)) &&
        product.minimumOrderQuantity?.value !== expected
      );
    },
  );
  const relevantDeletion = memory.deleted.some((product) =>
    Boolean(priceFor(product.productType)),
  );
  const sourceCount = memory.current.filter(
    (product) =>
      priceFor(product.productType) &&
      !product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)) &&
      !product.title.endsWith(" B2B"),
  ).length;
  const memorySources = memory.current.filter(
    (product) =>
      priceFor(product.productType) &&
      !product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)) &&
      !product.title.endsWith(" B2B"),
  );
  const relatedNeedsSync = memorySources.some((source) => {
    const target = memory.current.find(
      (product) =>
        product.title === `${source.title} B2B` &&
        product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)),
    );
    if (!target) return false;
    const mapping = relatedBundleReferences(source, memory.current);
    return (
      mapping.missing.length > 0 ||
      JSON.stringify(mapping.expected) !== JSON.stringify(sortedReferences(target))
    );
  });

  if (
    memory.initialized &&
    !relevantChange &&
    !relevantDeletion &&
    !missingB2BFlag &&
    !incorrectMinimumOrderQuantity &&
    !relatedNeedsSync
  ) {
    await saveCatalogSnapshot(shop, memory.current);
    return {
      checked: sourceCount,
      updated: 0,
      drafted: 0,
      flagged: 0,
      relatedUpdated: 0,
      unchanged: sourceCount,
      added: memory.added.map((product) => product.title),
      changed: memory.changed.map((product) => product.title),
      deleted: memory.deleted.map((product) => product.title),
      usedMemory: true,
      unconfiguredProductTypes: unconfiguredProductTypes(memory.current),
      missing: [],
      missingRelated: [],
      failed: [],
    };
  }

  const catalog = await loadCatalog(admin);
  const products = catalog.products.nodes;
  const sources = products.filter(
    (product) =>
      priceFor(product.productType) &&
      !product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)) &&
      !product.title.endsWith(" B2B"),
  );
  const publications = catalog.publications.nodes
    .filter(
      (publication): publication is { id: string; catalog: { title: string } } =>
        Boolean(publication.catalog?.title),
    )
    .map((publication) => ({
      id: publication.id,
      label: publicationLabel(publication.catalog.title),
    }));
  const result: B2BSyncResult = {
    checked: sources.length,
    updated: 0,
    drafted: 0,
    flagged: 0,
    relatedUpdated: 0,
    unchanged: 0,
    added: memory.added.map((product) => product.title),
    changed: memory.changed.map((product) => product.title),
    deleted: memory.deleted.map((product) => product.title),
    usedMemory: false,
    unconfiguredProductTypes: unconfiguredProductTypes(products),
    missing: [],
    missingRelated: [],
    failed: [],
  };

  for (const product of products.filter(
    (item) =>
      (isDealerAccessory(item.productType) ||
        item.tags.some((tag) => normalize(tag) === normalize(B2B_TAG))) &&
      item.isB2B?.value !== B2B_FLAG_VALUE,
  )) {
    try {
      await setB2BFlag(admin, product.id);
      result.flagged += 1;
    } catch (error) {
      result.failed.push({
        title: product.title,
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  }

  for (const deletedSource of memory.deleted.filter((product) =>
    Boolean(priceFor(product.productType)),
  )) {
    const target = products.find(
      (product) =>
        product.title === `${deletedSource.title} B2B` &&
        product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)),
    );
    if (!target || target.status === "DRAFT") continue;
    try {
      await draftProduct(admin, target.id);
      result.drafted += 1;
    } catch (error) {
      result.failed.push({
        title: `${deletedSource.title} B2B`,
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  }

  for (const source of sources) {
    const target = products.find(
      (product) =>
        product.title === `${source.title} B2B` &&
        product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)),
    );
    if (!target) {
      result.missing.push(source.title);
      continue;
    }
    const price = priceFor(source.productType)!;
    const related = relatedBundleReferences(source, products);
    for (const title of related.missing) {
      result.missingRelated.push(`${source.title} → ${title}`);
    }
    const relatedChanged =
      JSON.stringify(related.expected) !==
      JSON.stringify(sortedReferences(target));
    if (!needsSync(source, target, price)) {
      if (!relatedChanged) result.unchanged += 1;
      else {
        try {
          await syncRelatedProducts(admin, target.id, related.expected);
          result.relatedUpdated += 1;
        } catch (error) {
          result.failed.push({
            title: target.title,
            message:
              error instanceof Error ? error.message : "Unbekannter Fehler",
          });
        }
      }
      continue;
    }

    try {
      await syncProductFields(admin, source, target);
      await syncMetafields(admin, source, target);
      await syncImages(admin, source, target);
      await syncVariants(admin, source, target, price);
      await syncPublications(admin, target.id, publications);
      if (relatedChanged) {
        await syncRelatedProducts(admin, target.id, related.expected);
        result.relatedUpdated += 1;
      }
      result.updated += 1;
    } catch (error) {
      result.failed.push({
        title: target.title,
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  }

  const verification = await graphql<{
    products: {
      nodes: Array<{
        title: string;
        productType: string;
        tags: string[];
        minimumOrderQuantity: { jsonValue: number } | null;
        isB2B: { jsonValue: boolean } | null;
      }>;
    };
  }>(
    admin,
    `#graphql
      query B2BVerifyMetadata {
        products(first: 250) {
          nodes {
            title
            productType
            tags
            minimumOrderQuantity: metafield(namespace: "custom", key: "moq") {
              jsonValue
            }
            isB2B: metafield(namespace: "custom", key: "is-b2b") {
              jsonValue
            }
          }
        }
      }
    `,
  );
  const invalidMoq = verification.products.nodes.filter(
    (product) => {
      const expected = minimumOrderQuantityFor(product.productType);
      return (
        expected &&
        product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG)) &&
        product.minimumOrderQuantity?.jsonValue !== Number(expected)
      );
    },
  );
  if (invalidMoq.length) {
    result.failed.push({
      title: "Mindestbestellmenge",
      message: `MOQ ist nicht korrekt bei: ${invalidMoq.map((product) => product.title).join(", ")}`,
    });
  }
  const invalidB2BFlag = verification.products.nodes.filter(
    (product) =>
      (isDealerAccessory(product.productType) ||
        product.tags.some((tag) => normalize(tag) === normalize(B2B_TAG))) &&
      product.isB2B?.jsonValue !== true,
  );
  if (invalidB2BFlag.length) {
    result.failed.push({
      title: "B2B-Schalter",
      message: `„ist B2B“ ist nicht aktiv bei: ${invalidB2BFlag
        .map((product) => product.title)
        .join(", ")}`,
    });
  }

  if (!result.failed.length) {
    const refreshed = await inspectCatalogChanges(admin, shop);
    await saveCatalogSnapshot(shop, refreshed.current);
  }

  return result;
}
