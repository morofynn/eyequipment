import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { createB2BBundle } from "../lib/b2b-bundle.server";
import { syncAllB2BBundles } from "../lib/b2b-sync.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync-all") {
    try {
      const result = await syncAllB2BBundles(admin, session.shop);
      return { ok: true as const, kind: "sync" as const, result };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      };
    }
  }
  const productId = formData.get("productId");

  if (typeof productId !== "string" || !productId.startsWith("gid://shopify/Product/")) {
    return { ok: false as const, error: "Bitte wähle ein gültiges B2C-Produkt aus." };
  }

  try {
    const result = await createB2BBundle(admin, productId);
    return { ok: true as const, kind: "create" as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
    };
  }
};

type PickedProduct = {
  id: string;
  title: string;
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [selectedProduct, setSelectedProduct] = useState<PickedProduct | null>(
    null,
  );
  const isLoading = fetcher.state !== "idle";
  const createResult =
    fetcher.data?.ok && fetcher.data.kind === "create"
      ? fetcher.data.result
      : null;
  const syncResult =
    fetcher.data?.ok && fetcher.data.kind === "sync"
      ? fetcher.data.result
      : null;

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(
        fetcher.data.kind === "create"
          ? `${fetcher.data.result.title} wurde veröffentlicht.`
          : `${fetcher.data.result.updated} aktualisiert, ${fetcher.data.result.flagged} als B2B markiert.`,
      );
    }
  }, [fetcher.data, shopify]);

  const pickProduct = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: false,
      filter: {
        draft: false,
        archived: false,
        variants: false,
      },
    });
    const product = selection?.[0];
    if (product) setSelectedProduct({ id: product.id, title: product.title });
  };

  const createBundle = () => {
    if (!selectedProduct) return;
    fetcher.submit(
      { intent: "create", productId: selectedProduct.id },
      { method: "POST", encType: "application/x-www-form-urlencoded" },
    );
  };

  const syncAll = () => {
    fetcher.submit(
      { intent: "sync-all" },
      { method: "POST", encType: "application/x-www-form-urlencoded" },
    );
  };

  return (
    <s-page heading="B2B-Bundle erstellen">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={createBundle}
        disabled={!selectedProduct || isLoading}
        {...(isLoading ? { loading: true } : {})}
      >
        Erstellen und veröffentlichen
      </s-button>

      <s-section heading="B2C-Produkt auswählen">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Tücher werden für 6,00 €, Mäppchen für 5,00 € angelegt.
            Produkte vom Typ Händlerzubehör werden nicht dupliziert.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button onClick={pickProduct}>
              {selectedProduct ? "Auswahl ändern" : "Produkt auswählen"}
            </s-button>
            {selectedProduct && <s-text>{selectedProduct.title}</s-text>}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Automatischer Ablauf">
        <s-unordered-list>
          <s-list-item>Produktdaten, Bilder, Tags und Metafelder kopieren</s-list-item>
          <s-list-item>B2C-Varianten als Bundle-Komponenten verknüpfen</s-list-item>
          <s-list-item>Tag und Kollektion B2B zuweisen</s-list-item>
          <s-list-item>Mindestbestellmenge auf 10 setzen</s-list-item>
          <s-list-item>Metafeld „ist B2B“ aktivieren</s-list-item>
          <s-list-item>
            Nur Online Store, Headless und Point of Sale aktivieren
          </s-list-item>
          <s-list-item>Produkt direkt aktiv veröffentlichen</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Bestehende B2B-Bundles aktualisieren">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Prüft alle Tücher und Mäppchen gegen ihre B2B-Versionen und
            aktualisiert geänderte Produktdaten, Bilder, Metafelder,
            Bundle-Komponenten, Preise und Vertriebskanäle.
          </s-paragraph>
          <s-button
            onClick={syncAll}
            disabled={isLoading}
            {...(isLoading ? { loading: true } : {})}
          >
            Alle prüfen und aktualisieren
          </s-button>
        </s-stack>
      </s-section>

      {fetcher.data && !fetcher.data.ok && (
        <s-banner tone="critical" heading="Bundle konnte nicht erstellt werden">
          {fetcher.data.error}
        </s-banner>
      )}

      {createResult && (
        <s-banner tone="success" heading="B2B-Bundle wurde erstellt">
          <s-stack direction="block" gap="small">
            <s-text>
              {createResult.title} · {createResult.price} €
            </s-text>
            <s-text>
              Kanäle: {createResult.publicationNames.join(", ")}
            </s-text>
            <s-button
              onClick={() =>
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: createResult.productId,
                })
              }
              variant="tertiary"
            >
              Produkt öffnen
            </s-button>
          </s-stack>
        </s-banner>
      )}

      {syncResult && (
        <s-banner
          tone={syncResult.failed.length ? "warning" : "success"}
          heading="B2B-Prüfung abgeschlossen"
        >
          <s-stack direction="block" gap="small">
            <s-text>
              Geprüft: {syncResult.checked} · Aktualisiert: {syncResult.updated} ·
              Als B2B markiert: {syncResult.flagged} · Entwurf:{" "}
              {syncResult.drafted} · Unverändert: {syncResult.unchanged}
            </s-text>
            <s-text>
              Katalog: {syncResult.added.length} neu · {syncResult.changed.length} geändert ·{" "}
              {syncResult.deleted.length} gelöscht
              {syncResult.usedMemory ? " · Schnellprüfung" : ""}
            </s-text>
            {syncResult.missing.length > 0 && (
              <s-text>
                Fehlende B2B-Bundles: {syncResult.missing.join(", ")}
              </s-text>
            )}
            {syncResult.unconfiguredProductTypes.length > 0 && (
              <s-text>
                Noch nicht konfigurierte Produkttypen:{" "}
                {syncResult.unconfiguredProductTypes.join(", ")}
              </s-text>
            )}
            {syncResult.failed.length > 0 && (
              <s-unordered-list>
                {syncResult.failed.map((failure) => (
                  <s-list-item key={failure.title}>
                    {failure.title}: {failure.message}
                  </s-list-item>
                ))}
              </s-unordered-list>
            )}
          </s-stack>
        </s-banner>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
