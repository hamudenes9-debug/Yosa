# 📞 Yosa AI — Sesli Telefon Araması Yapan, Google News Özetleyen ve Ödev Kaydeden Yapay Zeka (Android APK + Web)

**Yosa AI**, hiçbir klavye girişi olmadan **tamamen sesle ve dokunmatik arama kontrolleriyle** çalışan kişisel mobil yapay zeka asistanıdır.

## ✨ Özellikler

- **📲 Gerçek Telefon Araması Deneyimi & Zil Sesleri**:
  - **Anında Gelen Arama ("Yosa Beni Arasın")**: Seçtiğin zil sesi ve telefon titreşimiyle tam ekran gerçekçi gelen arama başlatır (**Cevapla** / **Reddet** / **1 Dk Ertele**).
  - **Zamanlı & Hatırlatıcı Aramalar**: Tek dokunuşla (`5 sn`, `15 sn`, `30 sn`, `1 dk`, `5 dk`) veya sesle (*"2 dakika sonra ödevim için beni ara"*) arama kurabilirsin. Süre dolduğunda Android `AlarmManager` ve tam ekran bildirimle telefonun çalar.
  - **5 Farklı Zil Sesi Seçeneği**: *Yosa İmza Zili*, *Klasik Ahize Zili*, *Kristal Melodi*, *Gece Ritmi*, *Dijital Nabız*.
- **⚽ Canlı Google News Haber & Maç Özeti**:
  - Görüşme sırasında sesli olarak *"Galatasaray maçını özetle"*, *"Fenerbahçe son durum ne?"*, *"Bugün gündemde ne var?"* gibi sorular sorduğunda canlı **Google News Türkiye (`hl=tr&gl=TR`)** haberlerini çekip doğal Türkçe konuşmayla özetler.
- **📚 Sesle Ödev Kaydetme & Takip**:
  - *"Matematik ödevimi kaydet Cuma gününe sayfa 48 çözülecek"* dediğinde dersi, teslim gününü ve konuyu otomatik ayıklayıp kaydeder.
  - *"Ödevlerimi oku"*, *"Matematik ödevimi bitirdim"* veya *"Matematik ödevini sil"* komutlarıyla sesli yönetilir.
- **🗣️ 6 Farklı Türkçe Ses Seçeneği**:
  - **Elif** (Sıcak Kadın), **Mert** (Tok Erkek), **Zeynep** (Enerjik), **Kerem** (Sakin Rehber), **Ada** (Haber Spikeri), **Nova** (Modern AI) + konuşma hızı ayarı (*Yavaş / Normal / Akıcı*).
- **🚫 Sıfır Klavye**: Uygulamanın hiçbir ekranında metin giriş kutusu veya klavye bulunmaz.
- **🆓 Tamamen Ücretsiz & Hazır**: Herhangi bir API anahtarı gerektirmez.

## 📱 Android APK Kurulumu

1. Repo kök dizinindeki imzalı **`Yosa-AI.apk`** dosyasını (veya canlı önizlemedeki **📲 APK İndir** butonunu) Android telefonuna indir.
2. Dosyaya dokunarak kurulumu tamamla ve ilk açılışta **Mikrofon** ile **Bildirim** izinlerini onayla.

## 🛠️ Geliştirme & Yeniden Derleme

```bash
# Canlı önizleme sunucusunu başlat (0.0.0.0:3000)
npm run start

# İkonları, zil seslerini ve imzalı Yosa-AI.apk dosyasını baştan derle
npm run build:apk
```
