# Badge-Finder

Mobile Web-App für einen gemeinsam genutzten Tür-Badge. Sie zeigt live, wer den Badge hat und ob er sich bei GLZ, youpj oder ausserhalb befindet.

Geplante öffentliche URL: <https://m-wirth.github.io/royal-rangers-badge/>

## Einrichtung

1. Ein kostenloses Supabase-Projekt erstellen.
2. `supabase-schema.sql` im SQL Editor ausführen.
3. Project URL und den öffentlichen `anon`/`publishable` Key aus den API-Einstellungen nach `config.js` kopieren.
4. Ein Push auf `main` veröffentlicht die App automatisch über GitHub Actions und GitHub Pages.

Es werden keine geheimen Schlüssel im Frontend verwendet. Anonyme Besucher dürfen Daten lesen und nur über die beiden validierten Funktionen `claim_badge` und `release_badge` verändern.

## Lokal starten

Da JavaScript-Module verwendet werden, über einen lokalen HTTP-Server öffnen, zum Beispiel:

```sh
python3 -m http.server 4173
```
