# Plan budowy aplikacji „TyWygrywasz.pl”

Dokument strategiczny i techniczny opracowany na podstawie `AGENTS.md`, `START.md`, `QUICKSTART.md` oraz dokumentacji w katalogu `docs/`.

---

## 1. Cel i zasady kardynalne projektu

1. **Local-first i suwerenność danych:**
   - Dokumenty, OCR, ekstrakcje, prywatne indeksy, szkice pism i klucze szyfrujące pozostają wyłącznie na urządzeniu użytkownika.
   - Domyślny tryb działania nie przesyła żadnych danych do chmury.
   - Brak telemetrii, analityki treści i logowania danych poufnych.

2. **Niemutowalność dowodów:**
   - Zaimportowane pliki i ich bajty nigdy nie są nadpisywane.
   - Każda operacja (OCR, korekta użytkownika, szkic pisma, eksport) tworzy nową wersję dowodu powiązaną z unikalną sumą kontrolną SHA-256 oryginału.

3. **Wiedza prawna oparta na zweryfikowanych źródłach:**
   - Rozróżnienie faktów udokumentowanych, twierdzeń obywatela, propozycji OCR i norm prawnych.
   - Każda teza prawna musi posiadać zweryfikowane źródło z oficjalnego publikatora (ELI / Dziennik Ustaw / CBOSA).
   - Nieznane fakty (np. brak potwierdzonej daty doręczenia) pozostają ze statusem `unknown` – model ani aplikacja nie mogą zgadywać daty ani pozorować biegu terminu.

4. **Deterministyczne reguły terminów:**
   - Wyliczanie terminów (np. 14 dni na odwołanie wg art. 129 § 2 w zw. z art. 57 KPA) realizuje deterministyczny moduł reguł z uwzględnieniem polskich dni ustawowo wolnych od pracy oraz sobót (art. 57 § 4 KPA).

5. **AI i MCP wyłącznie opcjonalne i za świadomą zgodą:**
   - W pierwszym etapie Gemini API oraz zewnętrzne MCP są wyłączone.
   - Pisma to projekty do osobistego przeglądu – brak automatycznego wysyłania (no auto-submit).

---

## 2. Etapy realizacji (Roadmap)

### Etap 1: Lokalny przebieg pionowy na danych syntetycznych (Zrealizowano)
- Inicjalizacja środowiska i konfiguracji TypeScript, Vitest, Next.js.
- Implementacja domeny:
  - `LocalVault`: Niemutowalny sejf dokumentów, sumy kontrolne SHA-256, drzewo wersji, wykrywanie duplikatów.
  - `ProceduralDeadlines`: Deterministyczny kalkulator KPA art. 57 (obsługa świąt ruchomych, sobót, braku daty `unknown`).
  - `Extractor`: Ekstrakcja pól ze skanu/tekstu oraz neutralizacja prób prompt injection.
  - `LegalKnowledge`: Baza zweryfikowanych źródeł (ELI/CBOSA) i dossier sprawy administracyjnej.
  - `LetterEngine`: Generator projektów odwołań, checklista przed wysłaniem, stemplowanie eksportu SHA-256.
  - `WebCrypto`: Szyfrowanie kontenera AES-GCM-256 z PBKDF2 oraz bezpieczne odtwarzanie (restore).
- Zestaw testów automatycznych: 19 testów w 5 plikach (100% zaliczonych).
- Interaktywny interfejs użytkownika w Next.js realizujący pełen cykl od kroku 1 do 8.

### Etap 2: Baza danych IndexedDB i File System Access API
- Przeniesienie stanu pamięciowego do trwałej lokalnej bazy IndexedDB w przeglądarce.
- Integracja z Origin Private File System (OPFS) dla wydajnego przechowywania dużych plików PDF i skanów.
- Obsługa cofnięcia uprawnień do plików i weryfikacja integralności przy ponownym otwarciu.

### Etap 3: Zaawansowany lokalny worker OCR
- Uruchomienie lokalnego silnika OCR (np. Tesseract.js / WebAssembly) w osobnym Web Workerze z polskim słownikiem, bez łączności sieciowej.
- Wizualny podgląd skanu obok odczytanego tekstu z podświetlaniem fragmentów źródłowych (bounding boxes).

### Etap 4: Rozszerzenie procedur urzędowych
- Moduł wniosków o dostęp do informacji publicznej (UDIP) i ponagleń na bezczynność.
- Moduł skarg i petycji (Dział VIII KPA, Ustawa o petycjach).
- Obsługa postępowań podatkowych (Ordynacja podatkowa) i ZUS jako osobnych trybów proceduralnych.

### Etap 5: Opcjonalna synchronizacja szyfrowana (E2EE) i adapter Gemini
- Opcjonalna synchronizacja struktury spraw na serwer PostgreSQL wyłącznie w postaci zaszyfrowanej po stronie klienta (Zero-Knowledge).
- Opcjonalny adapter Gemini z jawnym oknem podglądu danych (disclosure), zgodą na operację i budżetem zapytań.
