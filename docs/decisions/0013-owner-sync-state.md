# 0013 — stan synchronizacji oddzielony według właściciela

Data: 2026-10-06. Status: zintegrowane w aplikacji i sprawdzone w `9c9ce03cd460e51b18f88dd44706c8d36aadd9df`.

Publikacja: 2026-10-07. Po wyraźnej zgodzie użytkownika kod opublikowano na GitHub,
a promocja sprawdzonego wdrożenia Vercel zakończyła się sukcesem. Dokumentacja
jest publikowana oddzielnie; kod aplikacji i harness zachowują wersję `9c9ce03`.
Obie własne domeny serwują tę implementację; osobna kontrola HTTP przeszła
14/14, a trzy scenariusze browser na `tywygrywasz.pl` potwierdziły lokalny przebieg.
Nie zastępuje to opisanych niżej regresji izolacji właściciela.

## Powód

Punkt powrotu przechowuje zaszyfrowany wcześniejszy manifest po wyborze
wersji synchronizacji. Podobnie jak oryginały i aktywny manifest należy do
konkretnego właściciela. Dwa niezależne sejfy mogą mieć to samo `vaultId`:
nowy sejf lokalny otrzymuje `sejf-lokalny-01`, a przenośna kopia zachowuje
identyfikator przy odtworzeniu na innym koncie.

Klucze localStorage zależne wyłącznie od `vaultId` pozwalały odtworzeniu
kopii B usunąć punkt powrotu A. Zgoda B na zastąpienie jego aktywnego sejfu
nie obejmuje poprzednich wersji pozostałych właścicieli.

## Decyzja

`syncCheckpointStorageKey(ownerId, vaultId)` i
`syncBaseStorageKey(ownerId, vaultId)` tworzą klucze z jednoznaczną parą
`JSON.stringify([ownerId, vaultId])`. Prefiksy pozostają odpowiednio
`tywygrywasz-sync-checkpoint-` i `tywygrywasz-sync-base-`. Sejf bez konta
używa właściciela `local`; konto używa technicznego ID użytkownika.

Oba identyfikatory muszą być niepustym tekstem. Helpery odrzucają również
same białe znaki i zachowują dokładny zapis poprawnych identyfikatorów.
Ramowanie JSON rozróżnia pary zawierające myślniki, dwukropki i cudzysłowy.
Główna aplikacja używa tych helperów przy każdym odczycie, zapisie,
usunięciu i sprawdzaniu obecności lokalnego stanu synchronizacji: odblokowaniu,
wysyłce, porównaniu baz, wyborze konfliktu, powrocie do punktu przywracania
i pełnym odtworzeniu kopii. Sprawdzenie integracji objęło wszystkie te wywołania.

Stare klucze zawierające wyłącznie `vaultId` pozostają nietknięte i nie są
automatycznie przyjmowane jako stan bieżącego właściciela. Nazwa takiego
zapisu nie wskazuje konta, które go utworzyło. Samo dopasowanie `vaultId`
nie wystarcza do migracji ani usunięcia. Ewentualne jawne odzyskanie starego
punktu wymaga osobnego przebiegu z ustaleniem właściciela i sprawdzeniem
odszyfrowanego manifestu; ta zmiana nie dodaje takiego przebiegu.

Zmiana dotyczy miejsca przechowywania. Nie zmienia formatu szyfrowania,
kluczy odzyskiwania, przenośnej kopii ani serwerowych rekordów synchronizacji.
Do nazw nie trafiają e-mail, nazwa dokumentu ani prywatny hash.

## Sprawdzenie i ograniczenia

Testy domenowe sprawdzają usunięcie punktu B przy zachowaniu punktu A oraz
obu starych zapisów, rozdzielenie sejfu lokalnego od konta, pary z
niejednoznacznymi separatorami oraz odrzucanie brakujących identyfikatorów.
16 testów domeny używa pamięciowej mapy odpowiadającej nazwom kluczy.
Regresja przeglądarkowa odtwarza kopię A na koncie B przy tym samym `vaultId`:
oryginały i stan punktu powrotu/bazy A, wcześniejszy stan sejfu B oraz stare
wpisy pozostają zachowane; usuwany jest tylko stan odtwarzanego celu B.
UI, localStorage, IndexedDB i kryptografia działają rzeczywiście; odpowiedzi
uwierzytelniania w lokalnym scenariuszu są mockowane. Niezależna kontrola
źródeł potwierdziła użycie helperów. To osobna weryfikacja poprawki po
zapieczętowanym skanie wcześniejszego `f3671c24`, którego raportu nie zmieniano.

Rozdzielenie kluczy chroni przed mieszaniem zapisów przez zaufany kod
aplikacji. Wspólne pochodzenie webowe nadal pozwala kodowi aplikacji czytać
localStorage; nie jest to odrębna granica ochrony przed XSS. Zachowane stare
szyfrogramy pozostają na urządzeniu i zajmują miejsce.
