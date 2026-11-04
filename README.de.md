# erase.to

Text und Dateien verschlüsselt und vorübergehend weitergeben.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (Brasil)](README.pt-BR.md)

[erase.to öffnen](https://erase.to/) · [Dokumentation](docs/README.md) · [Sicherheitsmodell](docs/threat-model.md) · [Selbst betreiben](docs/operations.md)

erase.to ist ein Werkzeug für kurzlebige Kommunikation, entwickelt von RedCamel. Ich entwickle und betreibe es als unabhängiges Einpersonenprojekt.

Privatsphäre ist keine kostenpflichtige Zusatzfunktion. Der Dienst ist kostenlos und kommt ohne Konten, Werbung oder Analysedienste aus. Die Inhalte werden vor dem Hochladen auf deinem Gerät verschlüsselt; der Server hält verschlüsselte Pakete in flüchtigem Speicher. Die Anwendung führt keine Zugriffsprotokolle oder Besucherprofile anhand von IP-Adressen. Die Oberfläche lädt keine Skripte, Schriftarten oder CDNs von Drittanbietern.

Schreibe eine Nachricht oder füge Dateien hinzu, wähle Ablaufzeit und Abruflimit und teile den erzeugten Link. Eine optionale Passphrase ist eine zusätzliche Voraussetzung. Der Editor öffnet direkt, ohne Registrierung.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/editor-dark.jpg">
  <img src="docs/images/editor-light.jpg" alt="Nachrichteneditor von erase.to auf dem Desktop">
</picture>

<details>
<summary>Mobile Ansicht</summary>

<img src="docs/images/editor-mobile.jpg" alt="Editor von erase.to auf einem Smartphone" width="390">

</details>

## Funktionen

| Funktion | Verhalten |
| --- | --- |
| Text und Dateien | Bis zu **64 MiB insgesamt**, davon bis zu **8 MiB UTF-8-Text** und **8 Dateien**. Dateinamen und Medientypen sind verschlüsselt. |
| Verschlüsselung im Client | XChaCha20-Poly1305, ein zufälliges Linkgeheimnis und eine optionale Argon2id-Passphrase. Eine falsche Passphrase verbraucht keinen Abruf. |
| Begrenzte Verfügbarkeit | Ablaufzeit und Abruflimit gelten gleichzeitig. Berechtigungsprüfung, Zähleränderung und endgültige Löschung erfolgen atomar über API-Prozesse hinweg, die dieselbe maßgebliche Valkey-Instanz nutzen. |
| Kontrolle durch den Absender | Eine unabhängige Widerrufsberechtigung entfernt die verbleibende Serverkopie. Sie ist nicht im Link für den Empfänger enthalten. |
| Lokales Leeren | Manuelles Leeren, eine Frist von fünf Minuten Inaktivität mit 30 Sekunden Vorwarnung und Leeren entschlüsselter Inhalte beim Verbergen des Tabs. |
| Zugang und Betrieb | Browser- und Kommandozeilenclients, optionaler Tor-Onion-Zugang im Tor Browser und eigener Betrieb mit Rust, Svelte und Valkey ohne Persistenz. |

## Lokal ausprobieren

Voraussetzung sind Git, Docker und Docker Compose:

```sh
git clone https://github.com/RedCamel1312/erase.to.git
cd erase.to
docker compose up --build -d
```

Öffne `http://127.0.0.1:3001`. Der Compose-Stack veröffentlicht ausschließlich diese Loopback-Adresse; Anwendung und Cache verwenden interne Netze. Beim Stoppen des Caches gehen seine Pakete verloren.

Für öffentlichen Betrieb folge der [Betriebsanleitung](docs/operations.md). Sie behandelt HTTPS beziehungsweise einen unterstützten Browserkontext für Onion-Dienste, Swap und Speicherabbilder, Proxy-Pufferung und die Prüfung des Hosts. Container allein belegen keinen ausschließlich flüchtigen Betrieb. Für die Arbeit am Quellcode gibt es die [Entwicklungsanleitung](docs/development.md). Die weiterführende technische Dokumentation ist auf Englisch.

## Grenzen, die du kennen solltest

- Ein vollständiger Link gewährt Zugriff, sofern keine zusätzliche Passphrase verlangt wird. Schütze den Link und übermittle die Passphrase getrennt, wenn diese Trennung wichtig ist.
- Das Limit zählt berechtigte Abrufe, keine Personen oder erfolgreichen Übertragungen. Ein unterbrochener letzter Abruf kann das Paket verbrauchen. Empfänger können Kopien behalten; Widerruf und lokales Leeren können sie nicht entfernen.
- Cache-Neustarts verwerfen Pakete. Große Übertragungen puffern vollständige Pakete, können ein Mehrfaches der Inhaltsgröße im Arbeitsspeicher benötigen und müssen innerhalb begrenzter Fristen abgeschlossen sein.
- Verschlüsselung verbirgt nicht alle Metadaten und schützt kein kompromittiertes Gerät. Der Server sieht Zugriffsparameter und Transportinformationen; der Browser vertraut außerdem dem ausgelieferten Code. Quellcodeprüfung und Tests sind kein unabhängiges Sicherheitsaudit und keine Anonymitätsgarantie.

Das [Bedrohungsmodell](docs/threat-model.md) erläutert diese Grenzen im Detail.

<details>
<summary>So funktionieren Protokoll und Speicherung</summary>

![Datenfluss und Vertrauensgrenzen](docs/images/architecture.svg)

Browser-Worker und CLI verwenden dasselbe versionierte Protokoll aus `shared/`. Ein zufälliges 256-Bit-Linkgeheimnis und eine 192-Bit-Nonce dienen der Verschlüsselung mit XChaCha20-Poly1305. Optionale Passphrasen verwenden Argon2id v1.3 mit 64 MiB Speicher und drei Durchläufen. Authentifizierte Metadaten binden die Regeln des Pakets an seinen Inhalt. Auffüllen auf 4-KiB-Gruppen verbirgt genaue Längen; die ungefähre Größe bleibt erkennbar.

Das Linkgeheimnis bleibt im URL-Fragment, das Browser nicht in HTTP-Anfragen mitsenden. Metadaten, Abruf und Widerruf nutzen getrennte Berechtigungen. Der Server erhält verschlüsselte Daten, öffentliche Protokollfelder, Zugriffsregeln, Berechtigungshashes und die für den jeweiligen Zugriff vorgelegte Berechtigung. Im normalen Protokoll erhält er weder Klartext noch ursprüngliche Dateinamen, Linkgeheimnis, Passphrase oder Entschlüsselungsschlüssel.

Die Rust-API prüft begrenzte Anfragen und einmalige, an das Paket gebundene Rechennachweise. Feste Valkey-Skripte koordinieren Ablauf, Verbrauch, Widerruf und Kapazität. Jedes Paket läuft ab; Persistenz und Verdrängung sind deaktiviert. Ist der Speicher voll, werden neue Uploads abgewiesen. Ein reiner API-Neustart kann Pakete erhalten, solange der Cache weiterläuft.

Genaue Formate und Begründungen stehen in der [Protokollspezifikation](docs/protocol.md) und den [Entwurfsquellen](docs/research.md).

</details>

<details>
<summary>Entwicklung, Kommandozeile und Prüfung</summary>

Verwende Node 24 und die in `package.json` festgelegte pnpm-Version:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm cli help
```

Die [Entwicklungsanleitung](docs/development.md) behandelt Rust, eine isolierte Valkey-Instanz und den Entwicklungsserver für den Browser. Die [Testanleitung](docs/testing.md) beschreibt Prüfungen mit echtem Cache, mehreren Prozessen und vollständigen Nutzungsabläufen. Tests dürfen niemals einen Produktionscache verwenden.

Die [CLI-Anleitung](docs/cli.md) erklärt Senden, Empfangen, Passphraseneingabe und Widerruf. Vollständige Links, Nachrichtentexte und Passphrasen gehören nicht in Shell-Argumente oder die Historie. Die CLI unterstützt HTTPS und lokales HTTP zur Entwicklung; Onion-Adressen weist sie ab, weil sie keinen Tor-Transport besitzt. Verwende dafür Tor Browser. Empfangene Dateien werden nie automatisch geöffnet oder als Vorschau angezeigt.

Die wichtigsten Quellverzeichnisse sind `web/` (Oberfläche), `shared/` (Protokoll und Kryptografie), `server/` (API und atomare Cache-Operationen), `cli/` und `deploy/`. Die CI prüft Anwendung, Verhalten mit echtem Cache und Produktionscontainer. Eine vollständige Übersicht bietet der [Dokumentationsindex](docs/README.md).

</details>

## Mitwirken oder ein Problem melden

Die [Hinweise zum Mitwirken](CONTRIBUTING.md) beschreiben Entwicklung und Prüfung. Melde Sicherheitslücken vertraulich über die [Sicherheitsrichtlinie](SECURITY.md). Verwende erfundene Beispiele; veröffentliche keine privaten Links, Nachrichten oder Zugriffsberechtigungen in Issues.

## Das Projekt unterstützen

Ich bezahle Server und Domain aus eigener Tasche. Wenn dir das Werkzeug hilft und du meine Arbeit sowie die laufenden Kosten unterstützen möchtest, freue ich mich über ein paar Sats. Die Nutzung bleibt kostenlos.

Bitcoin (BTC):

```text
bc1qddfz8u589nvh0gcxdqcz3yltracn9t9qq9jtm7
```

Erstellt von RedCamel. Veröffentlicht unter der [MIT-Lizenz](LICENSE). [Lizenzhinweise Dritter](THIRD_PARTY.md).
