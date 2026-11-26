# MORO Kiosk Bestellungen

Die private Node-Web-App liest das Händlerformular direkt aus Webflow. Sie benötigt keine Kopie der Bestellung in einer zweiten Datenbank. Die Übersicht bietet Suche, Kennzahlen, häufig bestellte Produkte, Bestelldetails und serverseitig erzeugte PDFs.

## Webflow Cloud

Der Deployment-Branch enthält die Astro-App im Hauptverzeichnis. In Webflow Cloud ist sie auf der Site **MORO Kiosk** unter `/bestellungen` eingebunden.

- `WEBFLOW_TOKEN` als Secret hinterlegen. Der Site-Token benötigt ausschließlich `forms:read`.
- `MORO_ADMIN_PASSWORD` als Secret hinterlegen. Mindestens fünf Zeichen verwenden. Benutzername: `moro`.
- Nach der Bereitstellung `https://moro-kiosk.webflow.io/bestellungen` aufrufen. Ohne gültige Anmeldung lädt die App keine Bestelldaten. Ohne beide Secrets bleibt sie im Einrichtungszustand.

Vor der Nutzung auf der Messe den tatsächlichen Zugriff und beide PDF-Varianten im Browser prüfen. Das Dashboard bleibt außerhalb der öffentlichen Kiosk-Navigation.

## Alternativer Betrieb auf einem Node-Host

1. Auf einem Node-Host `npm install` im Verzeichnis `moro-kiosk` ausführen.
2. `WEBFLOW_TOKEN` für den MORO-Kiosk mit `forms:read` und `MORO_ADMIN_PASSWORD` mit einem zufälligen Passwort ab fünf Zeichen im Secrets-Bereich des Hosts hinterlegen.
3. `npm start` hinter einem HTTPS-Reverse-Proxy ausführen. Die App lauscht lokal auf `127.0.0.1:8788`. Den HTTPS-Zugang mit Anmeldeschutz und Anfragelimit am Proxy betreiben. Der Benutzername ist `moro`.
4. Die HTTPS-Adresse in einer eigenen internen Webflow-Seite verlinken. Ein iframe ist für `moro-kiosk.webflow.io` freigegeben. Bei Browsern, die Anmeldeabfragen in fremden Frames unterdrücken, die App über den Link im eigenen Tab öffnen.

Das Dashboard fragt Webflow bei jedem Seitenaufruf ab. Der PDF-Download nutzt die Bestelldaten im gespeicherten Beleg und sendet sie nur nach Anmeldung an den Browser. Einträge ohne gespeicherten Beleg bleiben in der Liste sichtbar.
