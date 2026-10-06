# 0012 — lokalne oryginały oddzielone według właściciela

Data: 2026-10-06. Status: wdrożone w warstwie magazynu.

## Powód

Dotychczas nazwa IndexedDB zależała wyłącznie od `vaultId`. Kopia odtworzona
w koncie B może zawierać `vaultId` konta A na tej samej przeglądarce. Zastąpienie
snapshotu B nie może wtedy zmienić oryginałów A. Zgoda na odtworzenie dotyczy
aktywnego sejfu, a nie pozostałych właścicieli na urządzeniu.

## Decyzja

`createOwnedDocumentStorage` tworzy magazyn dla jednoznacznej pary technicznych
identyfikatorów `[ownerId, vaultId]`. Dla sejfu bez konta `ownerId` to `local`,
dla konta jest to techniczny ID użytkownika. Nazwa bazy i znacznik migracji
nie zawierają nazwy dokumentu, prywatnego hashu, e-maila ani treści sprawy.
Szyfrowanie, klucz i kontekst AES-GCM pozostają bez zmian: backup jest nadal
przenośny, a granica fizycznego zapisu obejmuje dodatkowo właściciela.

Odblokowanie korzysta z `openOwnedDocumentStorage`. Przy pierwszym otwarciu
kopiuje szyfrogramy ze starego magazynu do pustego magazynu właściciela.
Sprawdzenie pustego magazynu i kopiowanie odbywają się w jednej transakcji
IndexedDB, więc migracja nie zastępuje rekordów zapisanych przez inną kartę.
Stary magazyn nie jest usuwany. Znacznik oznacza zakończenie migracji także
gdy stary magazyn był pusty; usunięte później rekordy nie wracają automatycznie.

Migracja nie odszyfrowuje dokumentów. Pomija wpisy bez poprawnej składni,
zachowuje syntaktycznie poprawne szyfrogramy także po naruszeniu ich tagu
uwierzytelniającego. Taki dokument jest niedostępny przy zwykłym odczycie,
zamiast blokować poprawnie odblokowany manifest. Błąd odczytu lub kopiowania
legacy nie zapisuje znacznika i nie uniemożliwia odblokowania; stary magazyn
pozostaje do ponowienia migracji lub wskazania właściwego oryginału.

Odtwarzanie kopii używa synchronicznego factory bez migracji. Dopiero po
udanym zapisie snapshotu, koperty i manifestu wywołuje
`markOwnedDocumentStorageInitialized`. Obejmuje to pustą kopię, aby kolejne
odblokowanie nie dołączyło oryginałów ze starej bazy do celowo pustego sejfu.
Znacznik w localStorage jest techniczny; nie jest dowodem istnienia backupu.
Błąd jego zapisu podczas jawnego restore jest przekazywany do skoordynowanego
rollback; podczas odblokowania nie blokuje manifestu ani zachowanych oryginałów.

## Sprawdzenie i ograniczenia

Testy warstwy domenowej sprawdzają odtworzenie B z `vaultId` A i innym
kluczem, niejednoznaczne separatory ID, jednorazową migrację, zachowanie
starej bazy, uszkodzone wpisy, ponowienie po błędzie oraz pusty restore.
Testy używają backendu pamięciowego z routingiem według rzeczywistej nazwy
namespace. Produkcyjny IndexedDB wymaga osobnego przebiegu w przeglądarce.

Przestrzeń właściciela ogranicza zakres zapisu i przypadkowego zastąpienia.
Wspólne pochodzenie webowe nadal udostępnia bazę zaufanemu kodowi aplikacji;
nie stanowi osobnej granicy przed XSS lub przejętym klientem. Zachowana baza
legacy pozostaje zaszyfrowaną kopią lokalną i zużywa miejsce. Jej późniejsze
usunięcie wymaga osobnej decyzji po potwierdzeniu migracji i pełnego backupu.
