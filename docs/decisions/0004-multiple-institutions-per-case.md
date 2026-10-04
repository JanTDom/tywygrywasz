# ADR 0004: Wiele instytucji w jednej sprawie

## Decyzja

Jedna `Case` przechowuje lokalnie listę `institutions[]`. Każdy rekord ma
nazwę, typ, jedną lub wiele ról (np. organ prowadzący, organ odwoławczy,
pośrednik, adresat, świadek albo ekspert), opcjonalny adres/kanał i źródła.
Pismo zapisuje identyfikator adresata oraz identyfikator instytucji, za której
pośrednictwem jest składane. Zdarzenia, terminy i dokumenty mogą wskazywać
konkretną instytucję.

Pole `authorityOrOpponentName` pozostaje jako pole kompatybilności. Przy
odczycie manifestu 2.0 bez `institutions[]` aplikacja tworzy jedną instytucję
legacy, więc stare sejfy nie tracą danych.

## Prywatność i synchronizacja

Lista instytucji jest częścią lokalnego manifestu i podlega szyfrowaniu po
stronie klienta. Supabase nadal przechowuje wyłącznie szyfrogram `sync_records`;
nie dodajemy jawnej tabeli nazw, adresów ani ról instytucji.

## Zachowanie użytkowe

- Formularz sprawy pozwala dodawać i usuwać dowolną liczbę instytucji.
- Analiza sprawy pokazuje każdą instytucję jako osobną stronę z rolą.
- Klasyfikator dokumentów zwraca kandydatów i zadaje pytanie, gdy dokument
  pasuje do kilku spraw; nie przypisuje go automatycznie do pierwszej.
- Wspólny dokument zachowuje istniejące powiązania przy dodaniu kolejnej
  sprawy.
