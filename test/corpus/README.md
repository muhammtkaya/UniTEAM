# Gerçek Office dosya korpusu

Bu klasöre **gerçek Microsoft Office** (ya da gerçek bir Office uygulamasıyla
üretilmiş) `.xlsx`, `.docx`, `.pptx` dosyalarını koyun. `test/corpus.js` buradaki
her dosyayı okur ve bizim okuyucularımızın (`XL.io`, `XL.docxIO`, `XL.pptxIO`)
dosyanın gerçek metin içeriğini doğru yakalayıp yakalamadığını ölçer.

- Klasör boşsa korpus testi otomatik **atlanır** (başarısız sayılmaz).
- `~$` ile başlayan Office geçici dosyaları yok sayılır.
- Çeşitlilik önemli: biçimlendirme, tablo, liste, resim, formül, çok sayfa/slayt
  içeren dosyalar ekleyin — asıl riski bunlar ortaya çıkarır.

Bu klasördeki Office dosyaları git'e **eklenmez** (bkz. `test/.gitignore`);
yalnızca yerelde test için kullanılır.
