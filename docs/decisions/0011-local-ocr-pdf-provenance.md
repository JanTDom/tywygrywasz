# Lokalny OCR i pochodzenie pól PDF

Data: 2026-10-06.

PDF.js 6.4.299 odczytuje strukturę, skompresowane strumienie i warstwę tekstową
PDF z lokalnego bufora bajtów. Regex wyszukujący napisy w całym pliku został
usunięty: metadane i napisy spoza strony nie są dowodem treści dokumentu.
Każdy odczytany fragment zachowuje rzeczywisty numer strony oraz obszar
współrzędnych względem widocznej strony, również dla obróconych stron.

Tesseract.js 7.0.0 uruchamia polski i angielski model w lokalnym workerze.
Skrypt `scripts/prepare-local-document-assets.mjs` przygotowuje przypięte
zależności w `public/ocr` i `public/pdf`: worker, WASM, modele, fonty i mapy
znaków. Ścieżki są jawnie ustawione na ten sam origin; nie stosujemy
domyślnych CDN. Worker otrzymuje bajty obrazu, nigdy URL z nazwą, hashem
lub sygnaturą. Wyłączono cache modelu Tesseract, logi payloadów i zdalną
telemetrię. Dokument ani jego OCR nie trafiają do serwera. Statyczne zasoby
muszą zostać dostępne na urządzeniu przed pracą bez sieci; same-origin
nie oznacza automatycznej dostępności po zamknięciu przeglądarki.

Każda strona PDF bez tekstu jest rasteryzowana lokalnie i rozpoznawana
osobno. W PDF mieszanym strony z tekstem zachowują swój tekst, a skanowane
strony otrzymują OCR. Obszary Tesseract normalizujemy do współrzędnych strony.
OCR tworzy odrębną wersję z hashem tekstu, hashem źródłowego oryginału,
liczbą stron i mapą fragmentów. Propozycje pól wskazują stronę i obszar,
a brak pola nie ma wymyślonej lokalizacji. Kontekst użytkownika pozostaje
poza materiałem źródłowym ekstraktora.

Podgląd renderuje faktyczne bajty PDF na canvasie lub obraz z lokalnego
Blob URL. Przed wyświetleniem porównuje SHA-256 oraz rozmiar z niezmiennym
rekordem oryginału. Brak bajtów i modyfikacja są oddzielnymi stanami.
Ponowne wskazanie pliku wymaga zgodności hasha i rozmiaru; inny dokument
trzeba zaimportować oddzielnie. Ta kontrola nie weryfikuje autentyczności,
podpisu elektronicznego ani prawdziwości treści.

Testy domenowe używają poprawnego dwustronicowego PDF z kompresją Flate,
obrotem drugiej strony i odrębnymi metadanymi. Sprawdzają rzeczywiste strony,
obszary pól, odrzucenie uszkodzonego PDF, brak importu metadanych jako dowodu
oraz odrzucenie zmienionych bajtów przy ponownym wskazaniu oryginału.
Przeglądarkowy test worker/WASM jest osobną kontrolą integracji.

Źródła decyzji i API:

- [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
- [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)
