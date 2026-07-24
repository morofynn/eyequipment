import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const store = process.argv[2];
if (!store?.endsWith(".myshopify.com")) {
  throw new Error("Usage: node scripts/run-b2b-bundles.mjs <store>.myshopify.com");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shopify = path.join(root, "node_modules", ".bin", "shopify");
const executionEnvironment = {
  ...process.env,
  SHOPIFY_CLI_AGENT_INFO: "n:codex|v:1.0|p:openai",
  SHOPIFY_CLI_AGENT_IDS: "r:b2b-store-20260723|i:root",
};

const inventoryQuery = `query B2BBatchInventory {
  products(first: 250, sortKey: TITLE) {
    nodes {
      id
      title
      productType
      tags
      status
      variants(first: 250) {
        nodes { id position sku }
      }
    }
  }
  publications(first: 100) {
    nodes { id catalog { title } }
  }
  collections(first: 10, query: "title:B2B") {
    nodes { id title ruleSet { appliedDisjunctively } }
  }
}`;

const duplicateMutation = `mutation DuplicateB2B(
  $productId: ID!
  $newTitle: String!
) {
  productDuplicate(
    productId: $productId
    newTitle: $newTitle
    includeImages: true
    newStatus: ACTIVE
    synchronous: true
  ) {
    newProduct {
      id
      title
      variants(first: 250) {
        nodes { id position sku }
      }
    }
    userErrors { field message }
  }
}`;

const configureMutation = `mutation ConfigureB2B(
  $productId: ID!
  $variants: [ProductVariantsBulkInput!]!
  $product: ProductUpdateInput!
  $relationships: [ProductVariantRelationshipUpdateInput!]!
  $unpublish: [PublicationInput!]!
  $publish: [PublicationInput!]!
) {
  prices: productVariantsBulkUpdate(
    productId: $productId
    variants: $variants
  ) {
    productVariants { id }
    userErrors { field message }
  }
  mark: productUpdate(product: $product) {
    product { id }
    userErrors { field message }
  }
  bundle: productVariantRelationshipBulkUpdate(input: $relationships) {
    parentProductVariants { id }
    userErrors { field message code }
  }
  removeChannels: publishableUnpublish(id: $productId, input: $unpublish) {
    userErrors { field message }
  }
  addChannels: publishablePublish(id: $productId, input: $publish) {
    userErrors { field message }
  }
}`;

const addToCollectionMutation = `mutation AddB2BToCollection(
  $id: ID!
  $productIds: [ID!]!
) {
  collectionAddProducts(id: $id, productIds: $productIds) {
    collection { id }
    userErrors { field message }
  }
}`;

const finalizePricesMutation = `mutation FinalizeB2BPrices(
  $productId: ID!
  $variants: [ProductVariantsBulkInput!]!
) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price }
    userErrors { field message }
  }
}`;

const setB2BFlagMutation = `mutation SetB2BFlag(
  $metafields: [MetafieldsSetInput!]!
) {
  metafieldsSet(metafields: $metafields) {
    metafields { id jsonValue }
    userErrors { field message }
  }
}`;

function execute(query, variables, allowMutations = false) {
  const args = [
    "store",
    "execute",
    "--store",
    store,
    "--query",
    query,
    "--json",
  ];
  if (variables) args.push("--variables", JSON.stringify(variables));
  if (allowMutations) args.push("--allow-mutations");

  const result = spawnSync(shopify, args, {
    cwd: root,
    env: executionEnvironment,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Shopify CLI failed");
  }
  const output = result.stdout.trim();
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Unexpected Shopify CLI response: ${output}`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

function userErrors(payload) {
  return Object.entries(payload)
    .flatMap(([name, result]) =>
      (result?.userErrors ?? []).map((error) => `${name}: ${error.message}`),
    );
}

function setB2BFlag(productId) {
  const result = execute(
    setB2BFlagMutation,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: "custom",
          key: "is-b2b",
          type: "boolean",
          value: "true",
        },
      ],
    },
    true,
  );
  const errors = result.metafieldsSet.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map(({ message }) => message).join("; "));
  }
}

function publicationLabel(publication) {
  return publication.catalog?.title
    ?.replace(/^Channel Catalog \d+ for /i, "")
    .trim();
}

function resolvePublications(publications) {
  const find = (predicate, description) => {
    const publication = publications.find((item) =>
      predicate(publicationLabel(item)?.toLocaleLowerCase("de-DE") ?? ""),
    );
    if (!publication) throw new Error(`Publication not found: ${description}`);
    return publication;
  };

  const online = find(
    (name) => ["onlineshop", "online store"].includes(name),
    "Onlineshop",
  );
  const headless = find((name) => name.includes("headless"), "Headless");
  const pos = find((name) => name === "point of sale", "Point of Sale");
  const wanted = [online, headless, pos];
  return {
    publish: wanted.map(({ id }) => ({ publicationId: id })),
    unpublish: publications
      .filter((item) => !wanted.some(({ id }) => id === item.id))
      .map(({ id }) => ({ publicationId: id })),
  };
}

function priceFor(productType) {
  const normalized = productType.trim().toLocaleLowerCase("de-DE");
  if (["tuch", "tücher"].includes(normalized)) return "6.00";
  if (normalized === "mäppchen") return "5.00";
  return null;
}

const inventory = execute(inventoryQuery);
const products = inventory.products.nodes;
const publications = resolvePublications(inventory.publications.nodes);
const b2bCollection = inventory.collections.nodes.find(
  ({ title }) => title.trim().toLocaleLowerCase("de-DE") === "b2b",
);
if (!b2bCollection) throw new Error("The B2B collection does not exist.");

const sources = products.filter((product) => {
  const price = priceFor(product.productType);
  return (
    price &&
    !product.tags.some((tag) => tag.toLocaleLowerCase("de-DE") === "b2b") &&
    !product.title.endsWith(" B2B")
  );
});

const summary = { created: [], repaired: [], skipped: 0, failed: [] };

for (const [index, source] of sources.entries()) {
  const title = `${source.title} B2B`;
  process.stdout.write(`[${index + 1}/${sources.length}] ${title} ... `);
  try {
    const existing = products.find((product) => product.title === title);
    if (
      existing?.tags.some((tag) => tag.toLocaleLowerCase("de-DE") === "b2b")
    ) {
      setB2BFlag(existing.id);
      summary.skipped += 1;
      console.log("already complete");
      continue;
    }
    let product = existing;
    if (!product) {
      const duplicate = execute(
        duplicateMutation,
        { productId: source.id, newTitle: title },
        true,
      ).productDuplicate;
      const duplicateErrors = duplicate.userErrors ?? [];
      if (duplicateErrors.length) {
        throw new Error(duplicateErrors.map(({ message }) => message).join("; "));
      }
      product = duplicate.newProduct;
      if (!product) throw new Error("Shopify returned no duplicated product.");
    }
    const sourceByPosition = new Map(
      source.variants.nodes.map((variant) => [variant.position, variant]),
    );
    const variants = product.variants.nodes.map((variant) => {
      const sourceVariant = sourceByPosition.get(variant.position);
      if (!sourceVariant) throw new Error(`Variant position ${variant.position} missing.`);
      return {
        id: variant.id,
        price: priceFor(source.productType),
      };
    });
    const relationships = product.variants.nodes.map((variant) => {
      const sourceVariant = sourceByPosition.get(variant.position);
      return {
        parentProductVariantId: variant.id,
        productVariantRelationshipsToCreate: [
          { id: sourceVariant.id, quantity: 1 },
        ],
      };
    });

    const configured = execute(
      configureMutation,
      {
        productId: product.id,
        variants,
        product: {
          id: product.id,
          status: "ACTIVE",
          tags: [...new Set([...source.tags, "B2B"])],
        },
        relationships,
        ...publications,
      },
      true,
    );
    const configurationErrors = userErrors(configured);
    if (configurationErrors.length) {
      throw new Error(configurationErrors.join("; "));
    }
    setB2BFlag(product.id);

    if (!b2bCollection.ruleSet) {
      const collectionResult = execute(
        addToCollectionMutation,
        { id: b2bCollection.id, productIds: [product.id] },
        true,
      );
      const collectionErrors =
        collectionResult.collectionAddProducts.userErrors ?? [];
      if (collectionErrors.length) {
        throw new Error(collectionErrors.map(({ message }) => message).join("; "));
      }
    }

    const destination = existing ? summary.repaired : summary.created;
    destination.push({ id: product.id, title });
    console.log(existing ? "repaired" : "created");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.failed.push({ title, message });
    console.log(`failed: ${message}`);
  }
}

console.log(JSON.stringify(summary, null, 2));

const completedInventory = execute(inventoryQuery);
const b2bProducts = completedInventory.products.nodes.filter((product) =>
  product.tags.some((tag) => tag.toLocaleLowerCase("de-DE") === "b2b") &&
  priceFor(product.productType),
);
const priceFailures = [];
for (const [index, product] of b2bProducts.entries()) {
  process.stdout.write(
    `[price ${index + 1}/${b2bProducts.length}] ${product.title} ... `,
  );
  try {
    const result = execute(
      finalizePricesMutation,
      {
        productId: product.id,
        variants: product.variants.nodes.map((variant) => ({
          id: variant.id,
          price: priceFor(product.productType),
        })),
      },
      true,
    );
    const errors = result.productVariantsBulkUpdate.userErrors ?? [];
    if (errors.length) {
      throw new Error(errors.map(({ message }) => message).join("; "));
    }
    console.log("updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    priceFailures.push({ title: product.title, message });
    console.log(`failed: ${message}`);
  }
}
console.log(JSON.stringify({ priceUpdated: b2bProducts.length, priceFailures }, null, 2));
if (summary.failed.length || priceFailures.length) process.exitCode = 1;
