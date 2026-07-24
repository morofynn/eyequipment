import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type CatalogProductMemory = {
  id: string;
  title: string;
  productType: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isB2B: { value: string } | null;
};

export type CatalogChanges = {
  initialized: boolean;
  current: CatalogProductMemory[];
  added: CatalogProductMemory[];
  changed: CatalogProductMemory[];
  deleted: Array<{ id: string; title: string; productType: string }>;
};

type StoredCatalog = Record<string, CatalogProductMemory[]>;

const memoryDirectory = path.resolve(process.cwd(), ".data");
const memoryFile = path.join(memoryDirectory, "b2b-catalog-memory.json");

async function readMemory(): Promise<StoredCatalog> {
  try {
    return JSON.parse(await readFile(memoryFile, "utf8")) as StoredCatalog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
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

export async function inspectCatalogChanges(
  admin: AdminClient,
  shop: string,
): Promise<CatalogChanges> {
  const current: CatalogProductMemory[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page: {
      products: {
        nodes: CatalogProductMemory[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await graphql(
      admin,
      `#graphql
        query B2BCatalogMemory($after: String) {
          products(first: 100, after: $after, sortKey: ID) {
            nodes {
              id
              title
              productType
              tags
              createdAt
              updatedAt
              isB2B: metafield(namespace: "custom", key: "is-b2b") {
                value
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
    current.push(...page.products.nodes);
    hasNextPage = page.products.pageInfo.hasNextPage;
    after = page.products.pageInfo.endCursor;
  }

  const memory = await readMemory();
  const previous = memory[shop] ?? [];
  const previousById = new Map(previous.map((product) => [product.id, product]));
  const currentIds = new Set(current.map((product) => product.id));
  const added = current.filter((product) => !previousById.has(product.id));
  const changed = current.filter((product) => {
    const saved = previousById.get(product.id);
    const savedTags = [...(saved?.tags ?? [])].sort();
    const currentTags = [...product.tags].sort();
    return (
      saved &&
      (saved.title !== product.title ||
        saved.productType !== product.productType ||
        JSON.stringify(savedTags) !== JSON.stringify(currentTags) ||
        saved.updatedAt !== product.updatedAt ||
        saved.isB2B?.value !== product.isB2B?.value)
    );
  });
  const deleted = previous
    .filter((product) => !currentIds.has(product.id))
    .map((product) => ({
      id: product.id,
      title: product.title,
      productType: product.productType,
    }));

  return {
    initialized: previous.length > 0,
    current,
    added,
    changed,
    deleted,
  };
}

export async function saveCatalogSnapshot(
  shop: string,
  products: CatalogProductMemory[],
) {
  const memory = await readMemory();
  memory[shop] = products;
  await mkdir(memoryDirectory, { recursive: true });
  const temporaryFile = `${memoryFile}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  await rename(temporaryFile, memoryFile);
}
