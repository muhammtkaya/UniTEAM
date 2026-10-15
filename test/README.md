# UniTEAM Testleri

Uçtan uca ve dosya sadakati test paketi. Gerçek bir Chrome'u `puppeteer-core`
ile başsız (headless) çalıştırır; yerleşik statik sunucu `index.html`'i servis eder.

## Kurulum

```bash
cd test
npm install
```

Chrome otomatik bulunur (Windows/macOS/Linux bilinen yollar). Bulunamazsa:

```bash
# Windows PowerShell
$env:CHROME_PATH="C:\path\to\chrome.exe"; npm test
# bash
CHROME_PATH=/path/to/chrome npm test
```

## Çalıştırma

```bash
npm test                # hepsi
npm run test:e2e        # sadece kalıcılık (IndexedDB)
npm run test:fidelity   # sadece sentetik round-trip
npm run test:corpus     # sadece gerçek Office dosyaları
```

Çıkış kodu: tüm testler geçerse `0`, aksi halde `1` (CI uyumlu).

## Test spec'leri

| Dosya | Ne ölçer |
|-------|----------|
| `e2e.js` | Veri gir → kaydet → yeniden yükle; IndexedDB kalıcılığı, formül değerleri korunuyor mu. |
| `fidelity.js` | **Sentetik** round-trip: kendi yaz→oku pipeline'ımız (xlsx/docx/pptx). |
| `corpus.js` | **Gerçek** MS Office dosyaları: `test/corpus/` içindeki dosyaları okur, ham OOXML'den bağımsız çıkarılan metnin ne kadarını yakaladığımızı ölçer. |

> **Not:** `fidelity.js` yalnızca kendi pipeline'ımızı sentetik içerikle sınar.
> Gerçek risk gerçek Office dosyalarındadır → `corpus.js` + `test/corpus/`.

## CI

`.github/workflows/test.yml` her push/PR'da Ubuntu'da Chrome kurup `npm test`
çalıştırır. Korpus dosyaları repoya girmediği için CI'da korpus testi atlanır;
gerçek dosya testi yerelde yapılır.
