# eyequipment Assistent

Buttongeführtes Webflow-Widget ohne KI-Dienst. Styles und Runtime sind durch Shadow DOM vom Shop getrennt. Die Schrift wird vom Shop übernommen.

## Einbindung

`webflow-loader.html` enthält die externe Einbindung für den globalen Webflow-Footer. Sie lädt die vollständige Datei `eyequipment-assistant.js` inklusive Styles aus dem öffentlichen Repository `morofynn/eyequipment` über jsDelivr, gebunden an eine feste Commit-ID. `webflow-footer.html` bleibt als vollständige Inline-Fassung für lokale Prüfungen und als Rückfall verfügbar. Kein privater API-Schlüssel ist erforderlich.

Alternativ `assistant.js` und `assistant.css` gemeinsam auf einem geeigneten Assethost bereitstellen und die JS-Datei nach dem Seiteninhalt einbinden. CSS wird relativ zur JS-Datei geladen.

## Automatische Datenquellen

- Shopify Storefront API 2026-07: öffentliche Produkte, Produktarten, Beschreibungen, Bilder, Verfügbarkeit und Preise. Der öffentliche Token und die Domain werden aus der vorhandenen `window.shopyflowConfig` gelesen. Es werden alle API-Seiten geladen; keine abgeschnittene 100-Produkte-Liste.
- Veröffentlichte Shopseite: echte Produktlinks über `a[sf-product][href]`, inklusive Webflow-Pagination. Es werden nur verknüpfte öffentliche Produkte angeboten; keine erratenen URLs. B2B-getaggte Produkte werden ausgeschlossen.
- Veröffentlichte FAQ-Seite: vorhandene `data-faq-section`, `.faq-topic-title`, `data-faq-question` und `data-faq-answer`. Inhalte werden beim Öffnen erneut geladen und als Text dargestellt.
- Navigation und Footer: aktuelle interne Links und Bezeichnungen. FAQ-, Kontakt-, Konto- und Händlerlinks werden anhand der Navigation gefunden. Bestehende Pfade dienen nur als Rückfall.
- Kontaktseite: das vorhandene Webflow-Kontaktformular in einem gleichursprünglichen iframe. Webflow verarbeitet den Versand einschließlich Pflichtfeldern, Datenschutzbestätigung, Turnstile und Erfolg-/Fehlerzuständen. Formularattribute, Feldnamen und Übermittlung werden nicht ersetzt. Der Kunde sendet selbst ab.

Produktdaten werden höchstens 60 Sekunden im Arbeitsspeicher zwischengespeichert. „Noch mal von vorne“ startet nur den Dialog neu; `EyequipmentAssistant.refresh()` verwirft auch den Produktcache. Nur lokale Status- und Besuchszeitmarker, keine gespeicherten Kontaktangaben, keine Übertragung des Chatverlaufs an einen Server, keine eigene Analytics.

## Verlauf und Führung

Der Einstieg hat drei Wege: „Lieblingsdesign finden“, „Eine Frage klären“ und „Mehr entdecken“. Weitere Angebote stehen in Unterdialogen. Produktarten, Muster und Farben erscheinen vollständig. Seitenlinks stehen vollständig in thematischen Gruppen mit jeweils zwei Spalten. Muster und Farben sind als kompakte Auswahlgruppe dargestellt; die Überspringen-Option ist optisch abgesetzt. Vorherige Auswahlbuttons verschwinden nach der Entscheidung; Nachrichten und Produktkacheln bleiben im Verlauf. „Zurück“ stellt den vorigen Auswahlschritt wieder her.

Der Dialog wird in `sessionStorage` unter `eyequipment-assistant-session-v3` gehalten: gewählte Dialogschritte, Produktbezug, Scrollposition und offen/geschlossen. Der Zustand bleibt im gleichen Browser-Tab bei internen Produktklicks, Seitenwechseln und Reloads erhalten; nach 30 Minuten ohne Interaktion wird er nicht mehr wiederhergestellt. Formulareingaben, Namen, Kontaktadressen, private API-Tokens und alte Preise werden nicht gespeichert.

Bei einem Seitenwechsel wird der Dialog aus den gespeicherten Auswahlschritten mit den aktuellen Daten rekonstruiert. Wiederherstellung hat keine künstlichen Dialogverzögerungen und wird erst nach dem Aufbau eingeblendet. Geschlossene Chats laden ihren Dialog erst beim erneuten Öffnen. Geänderte oder entfernte Inhalte führen zu einem sicheren Weiter-Einstieg. Blockierter Browserspeicher verhindert nicht die normale Widgetbedienung, erlaubt aber keine Wiederherstellung. „Noch mal von vorne“ überschreibt den bisherigen gespeicherten Dialog.

## Produktauswahl und Oberfläche

- „Was passt zu mir?“ führt über Produktart, Muster und Farbe zu passenden Kacheln. Muster und Farben entstehen automatisch aus den bestehenden Shopify-Tags `Muster: …` und `Farbe: …`. Es werden keine neuen Merkmale oder Definitionen angelegt. Farboptionen werden anhand der bereits gewählten Muster eingegrenzt.
- „Bestseller entdecken“ im Entdecken-Dialog verwendet das vorhandene Tag `Bestseller`. Vorschläge sortieren verfügbare Artikel zuerst.
- Die gesamte Produktkachel verlinkt zur echten Produktseite. Das separate Info-Icon zeigt die Beschreibung und ermöglicht eine Produktanfrage im Chat.
- Shoplinks übertragen die Auswahl über `eq_category`, `eq_pattern`, `eq_color` und `eq_highlight`. Das Widget auf der Zielseite übergibt den Zustand im History-Eintrag an die bestehende Filterwiederherstellung des Shops. Es führt keine konkurrierende zweite Klick-/Reset-Routine aus. Die Übergabeparameter werden danach aus der URL entfernt; der Filterzustand bleibt im History-Eintrag erhalten.
- Pulsierender Punkt, drei animierte Antwortpunkte, sanft eingeblendete Nachrichten und Auswahlbuttons. Die kurze Dialogverzögerung entfällt bei `prefers-reduced-motion`; Animationen sind dann deaktiviert.
- Mobil zeigt der geschlossene Assistent nur das Icon. Am Footer wird der geschlossene Button ausgeblendet. Er liegt unter den bestehenden Shop-Popups und der mobilen Produktleiste; bei Überdeckung durch die Produktleiste wird er ebenfalls ausgeblendet. Der geöffnete Chat liegt darüber.
- Das Kontakt-iframe bleibt bis zur fertigen Isolierung unsichtbar, bekommt eine dynamische Formularhöhe und zeigt währenddessen Antwortpunkte. Newsletter-, Warenkorb- und Lightbox-Overlays werden innerhalb des Formularframes unterdrückt. Ein permanenter „Zum Team“-Link wurde entfernt; Kontakt bleibt über Dialogoptionen erreichbar.

Normale Änderungen an Produkten, FAQ-Texten und Navigationslinks benötigen keine Botänderung. Bei grundlegend geänderter HTML-Struktur, neuer Datenplattform oder neuen Beratungsfunktionen müssen Adapter angepasst werden. Nicht veröffentlichte CMS-Änderungen sind noch nicht sichtbar. Das Widget interpretiert keine beliebigen neuen Seiteninhalte automatisch.

## B2B

Die erste Version erklärt Händlerzugang und führt zu den vorhandenen geschützten Funktionen. Sie stellt keine individuellen Händlerpreise oder Mindestmengen nach eigener Berechnung dar. Öffentliche Preise werden nur bei durch die bestehende Runtime bestätigtem B2C-Status angezeigt. Bei unbekanntem oder B2B-Status bleibt der Preis ausgeblendet; Produktattribute und Empfehlung bleiben sichtbar. Kontextänderungen verwerfen den Cache und entfernen zuvor angezeigte Preise.

## Kontaktversand: vor Freigabe prüfen

Das echte Formular wurde gefunden: Webflow-Site `6a315d387e42bab66f868cf6`, Kontaktformular `6a9fb697b49d610d826968f1`. Es erfordert derzeit Name, E-Mail, Betreff, Nachricht und Datenschutzbestätigung. Telefonnummer/Rückrufwunsch können in die Nachricht aufgenommen werden. Telefonnummer allein ist deshalb noch nicht ausreichend.

Die Webflow-Formular-Mailempfänger müssen im Dashboard kontrolliert werden: vorgesehen ist `info@eyequipment.com`. Die Connector-Antwort belegt diese Empfängerkonfiguration nicht. Browserprüfungen senden keine Nachrichten. Vor produktiver Freigabe einmal eine ausdrücklich autorisierte Testanfrage senden und Eingang im Postfach, Fehlerzustand und Turnstile überprüfen.

Die Kontaktseite lädt ihre vorhandenen Scripts im iframe. Das Widget selbst startet in eingebetteten Seiten nicht erneut. Die sichtbaren umgebenden Seitenbereiche werden nur im iframe ausgeblendet; der Formularbereich mit seinen Erfolg-/Fehleranzeigen bleibt erhalten. Bei nicht zugänglichem Formular bleibt ein direkter Kontaktlink verfügbar.

## Prüfung

`check.cjs` verwendet den installierten Chrome und das gebündelte Playwright. Es lädt den echten Webflow-Shop und fügt die vollständige lokale Footer-Einbindung zur Prüfung in die HTML-Antwort ein. Geprüft werden Verlauf nach echtem Produktklick und Reload, geschlossener Reload, Zurücknavigation, drei Einstiegsoptionen, Bestseller, Muster/Farbe, FAQ-Antworten, Shopify-Produktkarten, direkte Kachellinks, Info-Icons, Antwortpunkte, native Formularvorbefüllung ohne Aufblitzen, mobile Iconansicht, Footer-Verhalten, Filterübergabe in den echten Shop, Ebenen und API-Ausfall. `placement-check.cjs` prüft die aktive mobile Warenkorbleiste separat. `session-edge-check.cjs` prüft beschädigten, abgelaufenen und blockierten Browserspeicher sowie eine fertige visuelle Vorschau. Es erfolgt kein Formularversand.

Quellen: https://shopify.dev/docs/api/storefront/2026-07/queries/products und https://www.storesynk.com/guides/components. Die Shopify-Abfrage wurde durch den Shopify-Skill gegen das Schema validiert.

## Auswahl bearbeiten und Kombinationen

Ergebnis-Chips erlauben Muster oder Farbe direkt zu ändern; die übrigen Filter bleiben erhalten. Auch bei einer Kategorieänderung bleiben Muster und Farbe erhalten. Kacheln nennen Kategorie, Muster und Farben aus den aktuellen Tags sowie den Grund des Vorschlags.

„Passende Kombination finden“ und „Passende Kombination dazu“ kombinieren verschiedene Produktarten Tücher/Mäppchen. Die bestehenden Shopify-Zuordnungen `shopyflow--recommendation.related_products` werden bevorzugt, danach gleicher Produkttitel und gemeinsame Muster/Farben. Es werden nur verfügbare Partner angeboten; ohne Gemeinsamkeit wird keine Kombination behauptet. Der Grund unterscheidet die hinterlegte eyequipment-Zuordnung von einem Treffer über Titel oder gemeinsame Attribute. Nicht öffentlich lesbare oder fehlende Zuordnungen werden nicht behauptet. Bei mehreren Vorschlägen wird zuerst explizit das Ausgangsprodukt gewählt; jede Kachel hat zusätzlich einen eigenen Gegenstück-Button. „Andere Kombination finden“ beginnt eine neue Auswahl. Beide Karten verlinken einzeln zur Produktseite.

## Kontext auf Produktseiten

Ein abgesetzter Bereich oberhalb des Dialogs bezieht sich auf den aktuellen `.product-container[sf-product]`: passende Ergänzung, Produktfrage, Warenkorb und Wunschliste. Die Produktfrage verwendet das aktuelle Produkt aus dem Katalog. Kontextdialogschritte speichern die öffentliche Produkt-ID, damit eine frühere Frage/Kombination auch auf einer anderen Produktseite beim Wiederherstellen denselben Bezug hat.

Warenkorb und Wunschliste klicken ausschließlich die vorhandenen nativen Controls im aktuellen Produktcontainer, mit dessen Menge und Variante. Der Chat schließt sich für die native Rückmeldung. Bereits gemerkte Produkte verlinken auf die Wunschliste. Solange die Store-Runtime nicht bereit ist, sind Commercebuttons deaktiviert. Commerceklicks sind keine gespeicherten Dialogschritte und werden bei Reload/Zurück niemals wiederholt. `context-check.cjs` prüft die Weitergabe an native Controls mit abgefangenen Klicks ohne echte Commerceänderung.

Kombinationen verlinken über „Alle Gegenstücke im Shop“ auf die gegenüberliegende Produktart, statt die Filter des Ausgangsprodukts fälschlich auf den Partner anzuwenden. Beratungsschritte während einer laufenden Antwort werden nicht parallel begonnen; Neustart bleibt möglich.

Native Komponenten: https://www.storesynk.com/docs-articles/product-container und https://www.storesynk.com/docs-articles/add-to-wishlist-button.

## Einklappbarer Produktkontext und Anfragevorlagen

Der Button am unteren Rand des Kontextfelds blendet die Optionen mit einer Aufwärtsanimation aus und wieder ein. Eingeklappte Inhalte sind auch für Tastatur/Screenreader deaktiviert; `aria-expanded` zeigt den Zustand an. Die Auswahl bleibt während der Browser-Tab-Sitzung bei Seitenwechseln/Reload erhalten.

Produktanfragen erhalten den Betreff „Produktfrage zu [Produktname]“. Die Nachricht beginnt mit einer freundlichen Anrede, enthält genau einen Produktlink und Platz für die eigentliche Frage. Allgemeine Anfragen nennen den Seitenbezug einmal. Das Thema wird nicht nochmals im Nachrichtentext wiederholt.

## Instagram, Teilen und weitere Orientierung

„Mehr entdecken“ zeigt den bestehenden Instagram-Profillink aus der Seite in der Inspirationsgruppe. Nur HTTPS-Links zu instagram.com/www.instagram.com werden akzeptiert; externe Links öffnen mit noopener/noreferrer in einem neuen Tab. Fehlt der Link auf der Seite, wird keiner erfunden. Gemerkte Designs sind direkt im Entdecken-Dialog erreichbar. Die Infoansicht der Produktkarten zeigt vorhandene Größe- und Materialtags zusätzlich zur Beschreibung.

Unter den vier Produktkontextaktionen steht ein schwarzer Teilen-Button mit SVG-Icon. `navigator.share` wird direkt im Klickhandler vor jeder asynchronen Dialogverzögerung aufgerufen; geteilt werden aktueller Titel und eine Produkt-URL ohne Query/Fragment. Benutzerabbruch löst keine automatische Kopie aus. Ohne Web Share wird Clipboard.writeText versucht, bei Sharefehler wird „Link kopieren“ angeboten; bei fehlender/gesperrter Zwischenablage bleibt ein markierbares Textfeld. Keine Share-/Copyaktion wird als Dialogschritt gespeichert. `share-check.cjs` prüft diese Fälle mit Browser-Stubs ohne echten Versand oder Änderung der Zwischenablage.

Referenz: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API und https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText.

## Match-Bezeichnungen und Wishlist-Status

Die Beratungsbuttons nennen die Kombination durchgängig „Match“. Alte gespeicherte Bezeichnungen werden beim Lesen auf die neuen Dialoglabels abgebildet, damit bestehende Verläufe weiterlaufen. Alle Kontextbutton-Texte sind zentriert. Die tatsächliche geladene Storesynk-Wishlist-Runtime 1.0.1 verwendet `sf-active` als Zustandsklasse; `sf-wishlist-active` wird zusätzlich unterstützt. Bereits gemerkte Produkte zeigen „♥ Gemerkt · Ansehen“ mit abgesetzter Gestaltung und führen zur Wunschliste, statt den nativen Toggle zum Entfernen auszulösen. Änderungen der Klasse im Produktcontainer aktualisieren den Button automatisch.

## Footer bauen

Die editierbaren Quellen bleiben `assistant.js` und `assistant.css`. `build.cjs` erzeugt die kompakte selbstständige Footerfassung mit Terser (lokale Variablennamen gekürzt, Kompressoroptimierung und kompakte CSS-Formatierung). Mit installiertem Terser: `node assistant/build.cjs`. Alternativ einen lokalen Terser-UMD-Bundlepfad als erstes Argument übergeben. Das fertige `webflow-footer.html` benötigt den Minifier nicht. Browserprüfungen verwenden stets diese fertige Einbindung.

## Veröffentlichung

Am 16.09.2026 wurde die vollständige Seite mit dem aktuellen Assistenten auf https://eyequipment.webflow.io veröffentlicht. Die Site hat laut Webflow aktuell keine Custom Domains. `live-check.cjs` prüft die veröffentlichte Website ohne lokale Codeinjektion.

## Fokus und Formular-Hover

Beim Öffnen erhält der Dialogcontainer den Fokus statt des Schließen-Buttons; dadurch wird das X nicht automatisch als vorausgewählte Aktion markiert. Der Schließen-Button bleibt bei echter Tab-Navigation mit sichtbarem Fokus bedienbar und hat feste quadratische Abmessungen. Im eingebetteten Kontaktformular wird das globale Grow-Hover auf Submitbuttons durch eine Farbänderung und einen kleinen Druckeffekt nach innen ersetzt, damit die Framegrenzen nichts abschneiden. `focus-form-check.cjs` prüft Fokus, Geometrie und Button-Framegrenzen ohne Versand.

## Mobile Browser-Zurücknavigation

`pageshow` entfernt die Markierung für Tastaturnavigation und setzt nach Dialogwiederherstellung den Fokus auf den Dialogcontainer. Der Rahmen am X erscheint nur nach einer expliziten Tab-Navigation, nicht aufgrund der automatischen Touch-/Browserfokuswiederherstellung. Bereits vor einer Veröffentlichung im Browsercache gehaltene ältere Dokumente behalten ihre alte Runtime, bis diese betroffene Seite einmal neu geladen wird. `back-mobile-check.cjs` prüft einen echten Browser-Zurückwechsel im mobilen Touch-Viewport.

„Lieblingsdesign finden“ ist auf der ersten Dialogebene als primärer schwarzer Button hervorgehoben.

Newsletter und Produktinfos (16.09.2026): Beim ersten Besuch erscheint nach vier Sekunden ein roter 23px-Nachrichtenindikator mit „1“, Ankunftsanimation und sanftem Pulsieren bis zum ersten Öffnen (browserlokal gespeichert). Reduzierte Bewegung deaktiviert beide Animationen. Unter „Mehr entdecken“ öffnet der feste Menüpunkt „Newsletter“ direkt das bestehende native Newsletter-Popup. Auf Seiten ohne dieses Popup führt er zur Startseite und öffnet dort die native Anmeldung; der frühere Umweg über den Konto-Login entfällt. Der Menüpunkt bleibt auch bei bekanntem Abonnement oder im Händler-Modus verfügbar; nur automatische Einladungen sind dort unterdrückt. Eine zusätzliche Einladung erscheint nach 30 Sekunden Besuchszeit, ohne den Chat automatisch zu öffnen. Bei offenem Chat wird sie direkt angehängt, bei geschlossenem Chat zeigt das Icon eine neue Nachricht. Die Besuchszeit bleibt über Seitenwechsel erhalten; ein neuer Tab oder 30 Minuten Inaktivität beginnen einen neuen Besuch. Höchstens eine Einladung pro Besuch und 24 Stunden Pause nach Hinweis bzw. Antwort. Der neue Cooldown-Key v2 übernimmt die früheren langen Sperren nicht. Das alte Popup-Cooldown blockiert den Bot nicht mehr. Solange ein Newsletter-Popup geöffnet ist oder ein Kontaktformular/Antwortvorgang aktiv ist, wird die fällige Einladung zurückgestellt und danach erneut geprüft. Ein noch ungelesener Newsletter-Hinweis bleibt während der Browsersitzung bei Seitenwechseln erhalten. Bekannte angemeldete bzw. auf E-Mail-Bestätigung wartende Nutzer und B2B-Kunden werden nicht eingeladen. Bei eingeloggten Nutzern mit unbekanntem Status wird vorsichtshalber keine Einladung angezeigt. Anonyme Nutzer lassen sich ohne Login nicht einer bestehenden Newsletter-Anmeldung zuordnen. Keine zusätzlichen Kundenabfragen oder eigene Subscription-Endpunkte.

Produktinfos verwenden `descriptionHtml` aus Shopify und rendern ausschließlich extrahierten Text in eigenen Abschnitten und Listen. Größen-, Material-, Farb- und Muster-Tags ergänzen fehlende Angaben. HTML-Skripte und eingebettete Inhalte werden nicht übernommen. `newsletter-info-check.cjs` prüft Willkommenspunkt, Einladung, Pause, Login-Status und die echte Bloom-HTML-Struktur als lokale Fixture; keine Anmeldung wird abgesendet. Der Footer wird mit Terser komprimiert und bleibt unter dem Webflow-Budget.

Live-Check: `newsletter-info-live-check.cjs` prüft die veröffentlichte mobile Seite einschließlich Beginn der Produktinfos an der Beschreibung, echter Bloom-Abschnitte und Übergabe an das vorhandene Newsletter-Popup. Der Test sendet keine Anmeldung.

Code-Ablage: Die editierbaren Quellen sind `assistant/assistant.js` und `assistant/assistant.css` im öffentlichen Repository https://github.com/morofynn/eyequipment. `assistant/build.cjs` erzeugt daraus die eigenständige Root-Datei `eyequipment-assistant.js` einschließlich Logik und Styles sowie die lokale Inline-Prüffassung `assistant/webflow-footer.html`. Live lädt der Webflow-Footer die Root-Datei über jsDelivr. Das B2B-Script bleibt separat als `eyequipment-b2b-site.js` im gleichen Repository. `notification-timing-check.cjs` prüft mit kontrollierter Browser-Uhr den verzögerten Hinweis, Zeitübernahme bei Navigation, offenen Chat, tägliche Pause, neue Besuche und die Popup-Koordination.

`notification-live-check.cjs` prüft den veröffentlichten 23px-Indikator und den echten 30-Sekunden-Timer ohne Beschleunigung. Es öffnet keine Kundenanmeldung und sendet kein Formular.

## Zufällige Vorschläge

Jeder neue Aufruf einer Vorschlagsauswahl mischt die passenden Produkte neu. Verfügbare Produkte erscheinen zuerst; innerhalb der Verfügbarkeitsgruppen ist die Reihenfolge zufällig. Bestseller- und Muster-/Farbfilter bleiben unverändert. Die einmal gemischte Liste wird beim Weiterblättern übernommen. Ein nicht personenbezogener Zufallswert pro Dialogschritt wird mit dem lokalen Chatverlauf gespeichert, damit Reload und Zurück dieselben Karten in derselben Reihenfolge und mit demselben Produktbezug rekonstruieren. Hinterlegte Match-Zuordnungen behalten ihre fachliche Priorität. `random-order-check.cjs` prüft wechselnde Vorschläge, doppelfreie Pagination, Replay und Produktinfos sowie passende gefilterte Ergebnisse.

## Händlerantrag im Assistenten

Unter „Mehr entdecken“ → „Für Händler“ öffnet der Button „Händler werden“ das vorhandene native Formular der Händlerseite im Assistenten. „Infos für Händler“ bleibt als Seitenlink verfügbar. Es wird nur der Formularbereich mit den originalen Feldern, Pflichtprüfungen, Datenschutzbestätigung, Turnstile und Webflow-Erfolg-/Fehleranzeigen eingeblendet. „Interesse“ wird auf die vorhandene Auswahl „Händler werden“ gesetzt; alle persönlichen Angaben und die Einwilligung bleiben zur Eingabe durch den Nutzer. Der Versand bleibt beim bestehenden Webflow-Formular. Datenschutzlinks öffnen in einem neuen Tab, sodass die Eingaben im Formular erhalten bleiben. Der Dialog kann beim Reload wiederhergestellt werden, Formularinhalte werden vom Bot nicht gespeichert. `dealer-form-check.cjs` prüft den realen Antrag mobil und den bisherigen Händlerkontakt ohne Versand. Die Inline-Fassung dient nur dem Test/Backup und unterliegt nicht dem Größenbudget des kleinen externen Live-Loaders.

Shopfilter-Korrektur (16.09.2026): Highlight-Radios erhalten genau einen Finsweet-Feldträger am Label. Das Widget entfernt nach dem DOMContentLoaded-Setup des Shops die doppelte Feldzuweisung am Input, bevor die datengesteuerte Filterinitialisierung startet. So entstehen bei vorausgewählten Bestsellern keine zusätzlichen Boolean-Filter. `highlight-newsletter-check.cjs` prüft die echte Bestseller-Übergabe, passende Treffer und Reload sowie das native Newsletter-Popup ohne Versand; `--live` prüft die veröffentlichte Fassung.

Produktkopf (16.09.2026): Auf Produktseiten ersetzt der aktuelle Produktname die Markenüberschrift im Kopf, mit „Das siehst du dir gerade an.“ und dem echten Produktbild rechts hinter einem Verlauf. Die redundante Produktzeile und Mengen-/Variantenhinweise entfallen. Der Klappbutton richtet Text und SVG-Pfeil horizontal mittig aus; der Kopf bleibt eingeklappt sichtbar. Auf anderen Seiten bleibt der Standardkopf bestehen.

Animation und Navigation (16.09.2026): Der Assistent blendet beim Schließen über 240 ms sanft nach unten aus. Der logisch geschlossene Zustand wird sofort gespeichert und der Dialog während des Ausblendens inert; erneutes Öffnen bricht die alte Schließverzögerung ab. Bei reduzierter Bewegung schließt er sofort. Das X hat auch im Produktkopf einen dunklen Hover-Zustand. Zurück und Neustart besitzen dekorative SVG-Icons sowie Hover-/Druckzustände bei unveränderten zugänglichen Beschriftungen.

Match gemeinsam kaufen (16.09.2026): Bei genau zwei angezeigten Match-Produkten erscheint ein optisch getrennter Bereich mit beiden Namen, Mengen und schwarzem „Beide in den Warenkorb“-Button mit Warenkorb-Icon. Native Storesynk-Produkte werden über `fetchNew()` geladen, Varianten bei Bedarf explizit auswählbar. Ein einzelner `addToCart({lineItems,useShopifyId:true,getNewCart:false})` ergänzt beide Varianten im bestehenden Warenkorb. Händler-Mindestmengen und Schritte kommen über die bestehende Kontextabfrage des B2B-Scripts und werden vor dem Hinzufügen erneut geprüft; geänderte Mengen führen zu einer erneuten Auswahl statt einer stillen Erhöhung. Erfolg wird anhand der Warenkorbzeilen bestätigt. Klicks werden nicht als Chat-Schritte gespeichert oder bei Wiederherstellung ausgeführt; Doppel-Klicks sind gesperrt. Bei unbestätigtem Ergebnis führt der Button zur Warenkorbprüfung statt einer automatischen Wiederholung. `match-cart-check.cjs` prüft echte Produktdaten, Batch-Aufruf, Mengen und Fehlerzustände mit simulierter SDK-Warenkorb-Methode; Händler-Status und -Mengen werden im Test kontrolliert gesetzt. Es wird kein realer Händler-Login oder echter Warenkorbversand im Test ausgeführt.

Visuelle Designauswahl (17.09.2026): „Was passt zu mir?“ ist eine schwarze Hauptaktion. Produktarten werden konsistent mit Tücher vor Mäppchen sortiert, auch beim Ändern der Kategorie. Kategoriebuttons zeigen zufällig ausgewählte Produktvorschaubilder aus ihrer jeweiligen Kategorie, bevorzugt verfügbare Produkte. Die Auswahl verwendet den gespeicherten Seed des Dialogschritts: neue Aufrufe zeigen wechselnde Beispiele, Reload und Wiederherstellung behalten die aktuellen Bilder bei. Buttons zur konkreten Design-/Match-Auswahl zeigen das jeweilige Shopify-Produktbild und den Namen. Bilder sind dekorativ (leerer Alternativtext); zugängliche Buttonnamen und gespeicherte Dialogschritte bleiben unverändert. Fehlgeschlagene Bilder entfallen zugunsten des Textbuttons.
