# Pełna kopia oryginałów i odblokowanie lokalnego sejfu

Data: 2026-10-06. Status: wdrożone; standardowe Web Crypto API pozostaje warstwą kryptograficzną.

## Problem

Kopia manifestu nie odzyskiwała binarnych oryginałów z IndexedDB. Tryb bez konta przechowywał klucz w czytelnym localStorage. Pobranie struktury z synchronizacji zastępowało lokalny manifest bez decyzji użytkownika.

## Decyzja

Format `tywygrywasz-portable-vault` 2.0 zawiera kontener AES-GCM/PBKDF2 z manifestem, kluczem oryginałów i uporządkowanymi sumami SHA-256 każdego rekordu szyfrogramu oraz snapshot wszystkich oryginałów IndexedDB. Nazwy, prywatne hashe, notatki i klucz znajdują się wyłącznie w zaszyfrowanych metadanych. Zewnętrzny plik ujawnia techniczne identyfikatory, liczbę i rozmiary szyfrogramów. To ręcznie pobierana kopia lokalna, nie automatyczny upload.

Dokumenty pozostają szyfrowane dotychczasowym kluczem i kontekstem AES-GCM wiążącym sejf, dokument i rolę. Nie implementujemy własnego algorytmu. Osobne szyfrogramy pozwalają przechować dokumenty większe niż limit kontenera manifestu 64 MB. Obowiązują limity magazynu, pojedynczego dokumentu i możliwości pamięci urządzenia; nie wyłączamy ochrony przed nieograniczonym wejściem.

Eksport weryfikuje hash i rozmiar każdego oryginału. Odtworzenie najpierw sprawdza hasło, schemat manifestu, uwierzytelnione powiązanie kompletu rekordów snapshotu, wszystkie szyfrogramy, bajty, hash, rozmiar, nazwę i relacje wersji. Dopiero potem IndexedDB zastępuje rekordy w jednej transakcji. Błąd quota/transaction zachowuje poprzedni magazyn. Błąd skoordynowanego zapisu manifestu/koperty cofa poprzedni szyfrowany snapshot. Starsze kopie manifestu pozostają obsługiwane, lecz wszystkie brakujące oryginały otrzymują jawny status.

Tryb bez konta wymaga utworzenia lokalnego hasła (12–256 znaków) lub odblokowania istniejącej koperty. Na dysku pozostaje tylko `VaultKeyEnvelope`: klucz AES-GCM opakowany kluczem z PBKDF2-SHA-256, 210 000 iteracji, osobną losową solą i nonce. Stary surowy klucz jest usuwany dopiero po poprawnym odtworzeniu manifestu i zapisaniu koperty. Odzyskiwanie dopuszcza odrębny klucz TWY; nie jest wysyłany do API. Zablokowanie sejfu zapisuje manifest, zeruje dostępne buforowe kopie klucza i czyści stan prywatny UI. JavaScript/GC nie daje gwarancji całkowitego wymazania kopii z pamięci procesu.

Pobierana struktura synchronizacji jest porównywana lokalnie po odszyfrowaniu. Różnice wymagają wyboru lokalnej lub serwerowej wersji; żadna nie jest stosowana automatycznie. Zastosowanie serwera wymaga wcześniejszego trwałego zapisania zaszyfrowanego punktu powrotu lokalnej wersji. Przełączenie punktu powrotu zachowuje drugą wersję. Synchronizacja struktury nadal nie przesyła oryginałów, dlatego przy brakujących lub rozbieżnych bajtach UI wymaga ponownego wskazania pliku lub pełnej kopii.

## Weryfikacja

`tests/vault-backup.test.ts`: odtworzenie na nowym backendzie bez pierwotnego klucza, binarne bajty, OCR i kontekst, brak czytelnych danych w archiwum, złe hasło, uszkodzenie i usunięcie oryginału, rozbieżny hash, quota bez zmiany danych, rollback klucza, kompatybilność starszych kopii, porównanie wersji z zachowaniem notatek. Dotychczasowe testy storage i sync pozostają wymagane.

## Granica ochrony

Hasło chroni klucz zamkniętego sejfu w przechowywanym profilu. Odblokowana aplikacja ma dostęp do materiału; nie obiecujemy ochrony przed XSS, malware, przejęciem przeglądarki ani złośliwą aktualizacją. Kopia i klucz odzyskiwania pozostają obowiązkiem świadomie wykonywanej operacji użytkownika.
