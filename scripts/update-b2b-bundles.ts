import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { syncAllB2BBundles } from "../app/lib/b2b-sync.server.ts";

const store = process.argv[2] ?? "k4csqj-h1.myshopify.com";
if (!store.endsWith(".myshopify.com")) {
  throw new Error("Bitte eine gültige *.myshopify.com-Domain angeben.");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shopify = path.join(root, "node_modules", ".bin", "shopify");
const executionEnvironment = {
  ...process.env,
  SHOPIFY_CLI_AGENT_INFO: "n:codex|v:1.0|p:openai",
  SHOPIFY_CLI_AGENT_IDS: "r:b2b-local-update|i:command-line",
};

function extractJson(output: string) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Unerwartete Shopify-Antwort: ${output}`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

const admin = {
  async graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) {
    const args = [
      "store",
      "execute",
      "--store",
      store,
      "--query",
      query,
      "--json",
    ];
    if (options?.variables) {
      args.push("--variables", JSON.stringify(options.variables));
    }
    if (/\bmutation\b/.test(query)) args.push("--allow-mutations");

    const result = spawnSync(shopify, args, {
      cwd: root,
      env: executionEnvironment,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "Shopify CLI failed");
    }
    const data = extractJson(result.stdout);
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  },
};

console.log(`Prüfe B2B-Bundles in ${store} ...`);
const result = await syncAllB2BBundles(admin, store);

console.log(`Geprüft: ${result.checked}`);
console.log(`Aktualisiert: ${result.updated}`);
console.log(`Auf Entwurf gesetzt: ${result.drafted}`);
console.log(`Als B2B markiert: ${result.flagged}`);
console.log(`Unverändert: ${result.unchanged}`);
console.log(
  `Katalog: ${result.added.length} neu, ${result.changed.length} geändert, ${result.deleted.length} gelöscht`,
);
if (result.added.length) console.log(`Neu: ${result.added.join(", ")}`);
if (result.changed.length) console.log(`Geändert: ${result.changed.join(", ")}`);
if (result.deleted.length) console.log(`Gelöscht: ${result.deleted.join(", ")}`);
if (result.usedMemory) console.log("Schnellprüfung: keine Detailabfrage erforderlich.");
if (result.unconfiguredProductTypes.length) {
  console.log(
    `Noch nicht konfigurierte Produkttypen: ${result.unconfiguredProductTypes.join(", ")}`,
  );
}
if (result.missing.length) {
  console.log(`Fehlende B2B-Bundles: ${result.missing.join(", ")}`);
}
if (result.failed.length) {
  for (const failure of result.failed) {
    console.error(`${failure.title}: ${failure.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Update erfolgreich abgeschlossen.");
}
