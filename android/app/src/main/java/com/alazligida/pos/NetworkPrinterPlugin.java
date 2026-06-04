package com.alazligida.pos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.bxl.config.editor.BXLConfigLoader;

import org.json.JSONObject;

import java.util.List;

import jpos.POSPrinter;
import jpos.POSPrinterConst;
import jpos.config.JposEntry;

/**
 * Bixolon (UPOS) yazıcı plugin'i — SRP-E300 vb. termal yazıcılar.
 * Hem Ethernet (LAN, IP üstünden) hem USB Host (tablet'in USB-OTG'sine takılı) destekler.
 *
 * Her basım için BXLConfigLoader üzerinden cihazı jpos.xml'e ekler,
 * POSPrinter üzerinden açar, basar, kapatır. ESC|... escape dizileriyle
 * format kontrolü (align/bold/size) yapılır.
 *
 * `connection`:
 *   'ethernet' (default) — ip + port (9100) ile TCP/IP
 *   'usb' — Android USB Host API. Address Bixolon SDK auto-discovery ile (boş string).
 *
 * JS API:
 *   NetworkPrinter.printReceipt({ ip?, port?, model?, connection?, lines, cut?, feedLines? })
 *   NetworkPrinter.testPrint({ ip?, port?, model?, connection? })
 *   NetworkPrinter.openCashDrawer({ ip?, model?, connection? })
 *   NetworkPrinter.triggerBuzzer({ ip?, model?, connection?, pulses?, gap? })
 */
@CapacitorPlugin(name = "NetworkPrinter")
public class NetworkPrinterPlugin extends Plugin {

    private static final int LINE_WIDTH = 42;
    private static final String ESC = new String(new byte[]{0x1b, 0x7c});
    private static final String ACTION_USB_PERMISSION = "com.alazligida.pos.USB_PERMISSION";
    private static final int BIXOLON_VID = 0x1504;

    @PluginMethod
    public void printReceipt(PluginCall call) {
        final String ip = call.getString("ip");
        final String model = call.getString("model", "SRP-E300");
        final String connection = call.getString("connection", "ethernet");
        final JSArray lines = call.getArray("lines");
        final boolean cut = Boolean.TRUE.equals(call.getBoolean("cut", Boolean.TRUE));
        final int feedLines = call.getInt("feedLines", 3);

        if ("ethernet".equalsIgnoreCase(connection) && (ip == null || ip.isEmpty())) {
            call.reject("Ethernet bağlantısı için ip parametresi gerekli");
            return;
        }
        if (lines == null) {
            call.reject("lines parametresi gerekli (dizi)");
            return;
        }

        new Thread(() -> {
            POSPrinter printer = null;
            try {
                printer = openPrinter(model, ip, connection);
                // Satırları sırayla işle. 'image' satırında biriken metni flush et,
                // bitmap'i bas, sonra metne devam et (logo en üstte konumlanır).
                StringBuilder buf = new StringBuilder();
                for (int i = 0; i < lines.length(); i++) {
                    JSONObject line = lines.getJSONObject(i);
                    String lineType = line.optString("type");
                    if ("image".equals(lineType)) {
                        if (buf.length() > 0) {
                            printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, buf.toString());
                            buf.setLength(0);
                        }
                        printAssetBitmap(printer, line.optString("asset"));
                    } else if ("imageData".equals(lineType)) {
                        if (buf.length() > 0) {
                            printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, buf.toString());
                            buf.setLength(0);
                        }
                        printBase64Bitmap(printer, line.optString("base64"));
                    } else if ("qr".equals(lineType)) {
                        String data = line.optString("data", "");
                        if (!data.isEmpty()) {
                            if (buf.length() > 0) {
                                printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, buf.toString());
                                buf.setLength(0);
                            }
                            printQR(printer, data);
                        }
                    } else {
                        buf.append(renderLine(line));
                    }
                }
                for (int j = 0; j < feedLines; j++) buf.append("\n");
                if (cut) buf.append(ESC).append("90fP");
                printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, buf.toString());

                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Yazıcı hatası: " + t.getClass().getSimpleName() + " — " + t.getMessage());
            } finally {
                closeQuietly(printer);
            }
        }, "BxlNetworkPrint").start();
    }

    /**
     * QR kod basar (Bixolon SDK printBarCode, QRCODE symbology).
     */
    private void printQR(POSPrinter printer, String data) {
        try {
            printer.printBarCode(
                    POSPrinterConst.PTR_S_RECEIPT,
                    data,
                    POSPrinterConst.PTR_BCS_QRCODE,
                    180,   // height (dots)
                    180,   // width (modül boyutu — SDK QR'da yorumlar)
                    POSPrinterConst.PTR_BC_CENTER,
                    POSPrinterConst.PTR_BC_TEXT_NONE
            );
        } catch (Throwable t) {
            // QR basılamadı — fiş yine çıksın
        }
    }

    /**
     * assets/ içindeki bir PNG'yi yükleyip Bixolon yazıcıya ortalı basar.
     * Hata olursa sessizce atlar (logo basılamazsa fiş yine çıksın).
     */
    private void printAssetBitmap(POSPrinter printer, String assetName) {
        if (assetName == null || assetName.isEmpty()) return;
        try {
            android.graphics.Bitmap bmp;
            try (java.io.InputStream is = getContext().getAssets().open(assetName)) {
                bmp = android.graphics.BitmapFactory.decodeStream(is);
            }
            printBitmapCentered(printer, bmp);
        } catch (Throwable t) {
            // Logo basılamadı — fişin geri kalanı yine çıksın
        }
    }

    /**
     * Base64 PNG'yi (adisyon görseli vb.) decode edip ortalı basar.
     */
    private void printBase64Bitmap(POSPrinter printer, String base64) {
        if (base64 == null || base64.isEmpty()) return;
        try {
            byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            android.graphics.Bitmap bmp =
                    android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            printBitmapCentered(printer, bmp);
        } catch (Throwable t) {
            // Bitmap basılamadı — sessizce geç
        }
    }

    private void printBitmapCentered(POSPrinter printer, android.graphics.Bitmap bmp) throws Exception {
        if (bmp == null) return;
        // Station + parlaklık/sıkıştırma/dither paketlenmiş int (sample'dan)
        java.nio.ByteBuffer bb = java.nio.ByteBuffer.allocate(4);
        bb.put((byte) POSPrinterConst.PTR_S_RECEIPT);
        bb.put((byte) 0); // brightness (default)
        bb.put((byte) 0); // compress
        bb.put((byte) 0); // dither
        // width: PTR_BM_ASIS (orijinal genişlik), ortala
        printer.printBitmap(bb.getInt(0), bmp, POSPrinterConst.PTR_BM_ASIS, POSPrinterConst.PTR_BM_CENTER);
    }

    @PluginMethod
    public void testPrint(PluginCall call) {
        final String ip = call.getString("ip");
        final String model = call.getString("model", "SRP-E300");
        final String connection = call.getString("connection", "ethernet");

        if ("ethernet".equalsIgnoreCase(connection) && (ip == null || ip.isEmpty())) {
            call.reject("Ethernet bağlantısı için ip parametresi gerekli");
            return;
        }

        new Thread(() -> {
            POSPrinter printer = null;
            try {
                printer = openPrinter(model, ip, connection);
                String addrLine = "usb".equalsIgnoreCase(connection)
                        ? "Bağlantı: USB"
                        : "IP: " + ip;
                String body =
                        ESC + "cA" + ESC + "bC" + ESC + "2hC" + ESC + "2vC" + "SyntrixPos\n"
                                + ESC + "!bC" + ESC + "1hC" + ESC + "1vC" + "TEST YAZDIRMA\n"
                                + dashes() + "\n"
                                + ESC + "lA" + "Tarih: " + new java.text.SimpleDateFormat("dd.MM.yyyy HH:mm").format(new java.util.Date()) + "\n"
                                + "Yazıcı: " + model + "\n"
                                + addrLine + "\n"
                                + dashes() + "\n"
                                + ESC + "cA" + "Bağlantı OK ✓\n"
                                + ESC + "!bC" + "Türkçe: ıİşŞğĞüÜöÖçÇ\n\n\n"
                                + ESC + "90fP";
                printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, body);

                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Test başarısız: " + t.getClass().getSimpleName() + " — " + t.getMessage());
            } finally {
                closeQuietly(printer);
            }
        }, "BxlNetworkTest").start();
    }

    /**
     * Para kasasını açar — yazıcının DK portuna 24V solenoid darbesi gönderir.
     * Mevcut POSPrinter bağlantısı üstünden Bixolon ESC|#pP komutuyla,
     * ayrı bir UPOS CashDrawer cihazı açmadan.
     *
     * Bağlantı: Tablet → (LAN/USB) → Bixolon SRP-E300 → (RJ12/DK) → HP VB400 vb.
     * "1pP" → DK pin 1 (tek kasa varsa burası), "2pP" → DK pin 2.
     */
    @PluginMethod
    public void openCashDrawer(PluginCall call) {
        final String ip = call.getString("ip");
        final String model = call.getString("model", "SRP-E300");
        final String connection = call.getString("connection", "ethernet");

        if ("ethernet".equalsIgnoreCase(connection) && (ip == null || ip.isEmpty())) {
            call.reject("Ethernet bağlantısı için ip parametresi gerekli");
            return;
        }

        new Thread(() -> {
            POSPrinter printer = null;
            try {
                printer = openPrinter(model, ip, connection);
                // Standart kasa: Bixolon ESC|1pP (50ms pulse) — yeterli.
                printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, ESC + "1pP");
                try { Thread.sleep(200); } catch (InterruptedException ignored) {}
                printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, ESC + "2pP");
                try { Thread.sleep(200); } catch (InterruptedException ignored) {}

                // Buzzer veya yavaş solenoid için: raw ESC/POS uzun pulse
                // ESC p m t1 t2 — m=drawer (0/1), t1/t2 = pulse süresi × 2ms.
                // t1=0xFA (250) → 500ms ON, t2=0xFA → 500ms OFF.
                // Drawer 1 (pin 2) — uzun pulse
                String longDrawer1 = new String(new byte[]{0x1B, 0x70, 0x00, (byte) 0xFA, (byte) 0xFA});
                printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, longDrawer1);
                try { Thread.sleep(800); } catch (InterruptedException ignored) {}

                // Drawer 2 (pin 5) — uzun pulse (yedek, başka pin'e bağlıysa)
                String longDrawer2 = new String(new byte[]{0x1B, 0x70, 0x01, (byte) 0xFA, (byte) 0xFA});
                printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, longDrawer2);

                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Kasa açılamadı: " + t.getClass().getSimpleName() + " — " + t.getMessage());
            } finally {
                closeQuietly(printer);
            }
        }, "BxlOpenDrawer").start();
    }

    /**
     * Mutfak buzzer'ı için pattern darbe — pulses adet kısa bip, aralarında gap ms.
     * openCashDrawer'dan farklı olarak sadece bir DK pulse pattern'i yollar, ekstra
     * pin denemesi yapmaz. Sipariş tipine göre farklı pattern'ler için kullanılır:
     *   - Yeni sipariş: 1 pulse
     *   - Paket sipariş: 2 pulse, 200ms gap
     *   - Ek sipariş: 2 pulse, 100ms gap
     *   - İptal: 3 uzun pulse
     */
    @PluginMethod
    public void triggerBuzzer(PluginCall call) {
        final String ip = call.getString("ip");
        final String model = call.getString("model", "SRP-E300");
        final String connection = call.getString("connection", "ethernet");
        final int pulses = call.getInt("pulses", 1);
        final int gap = call.getInt("gap", 200);

        if ("ethernet".equalsIgnoreCase(connection) && (ip == null || ip.isEmpty())) {
            call.reject("Ethernet bağlantısı için ip parametresi gerekli");
            return;
        }

        new Thread(() -> {
            POSPrinter printer = null;
            try {
                printer = openPrinter(model, ip, connection);
                for (int i = 0; i < Math.max(1, pulses); i++) {
                    // Drawer 1 kısa pulse (Bixolon ESC|1pP = ~50ms)
                    printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, ESC + "1pP");
                    // Yedek olarak Drawer 2 de gönder — buzzer pin 5'e bağlıysa da çalsın
                    printer.printNormal(POSPrinterConst.PTR_S_RECEIPT, ESC + "2pP");
                    if (i < pulses - 1) {
                        try { Thread.sleep(Math.max(80, gap)); } catch (InterruptedException ignored) {}
                    }
                }
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Buzzer tetiklenemedi: " + t.getClass().getSimpleName() + " — " + t.getMessage());
            } finally {
                closeQuietly(printer);
            }
        }, "BxlBuzzer").start();
    }

    /**
     * USB cihazına erişim izni — Bixolon (VID 0x1504) yazıcısını bulup, izin yoksa
     * UsbManager.requestPermission ile kullanıcıdan iste, sonucu blocking bekle.
     * Intent filter sadece "tanıma" sağlar; gerçek exclusive access bunun üstüne
     * runtime permission gerektirir.
     */
    private void ensureUsbPermission() throws Exception {
        Context ctx = getContext();
        UsbManager um = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
        if (um == null) throw new Exception("USB Manager kullanılamıyor");

        UsbDevice device = null;
        for (UsbDevice d : um.getDeviceList().values()) {
            if (d.getVendorId() == BIXOLON_VID) {
                device = d;
                break;
            }
        }
        if (device == null) {
            throw new Exception("Bixolon USB yazıcı bulunamadı. Kabloyu kontrol edin.");
        }

        if (um.hasPermission(device)) return;

        final Object lock = new Object();
        final boolean[] granted = { false };
        final boolean[] received = { false };

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
                synchronized (lock) {
                    granted[0] = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                    received[0] = true;
                    lock.notifyAll();
                }
            }
        };

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(receiver, filter);
        }

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) piFlags |= PendingIntent.FLAG_MUTABLE;
        Intent intent = new Intent(ACTION_USB_PERMISSION).setPackage(ctx.getPackageName());
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, intent, piFlags);
        um.requestPermission(device, pi);

        synchronized (lock) {
            long deadline = System.currentTimeMillis() + 15000;
            while (!received[0]) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) break;
                try { lock.wait(left); } catch (InterruptedException ignored) {}
            }
        }
        try { ctx.unregisterReceiver(receiver); } catch (Throwable ignored) {}

        if (!granted[0]) {
            throw new Exception("USB izni verilmedi (popup'ı reddettiyseniz Ayarlar'dan iznini sıfırlayın)");
        }
    }

    private POSPrinter openPrinter(String model, String ip, String connection) throws Throwable {
        Context ctx = getContext();
        boolean isUsb = "usb".equalsIgnoreCase(connection);
        if (isUsb) ensureUsbPermission();
        // USB ve Ethernet için ayrı logical name — aynı modeli iki kez tanımlayabilelim
        String logicalName = isUsb ? (model + "_USB") : model;

        BXLConfigLoader config = new BXLConfigLoader(ctx);
        try {
            config.openFile();
        } catch (Exception e) {
            config.newFile();
        }
        List<?> entries = config.getEntries();
        for (Object entry : entries) {
            if (((JposEntry) entry).getLogicalName().equals(logicalName)) {
                config.removeEntry(logicalName);
                break;
            }
        }
        config.addEntry(
                logicalName,
                BXLConfigLoader.DEVICE_CATEGORY_POS_PRINTER,
                productNameFor(model),
                isUsb ? BXLConfigLoader.DEVICE_BUS_USB : BXLConfigLoader.DEVICE_BUS_ETHERNET,
                // USB için address boş — Bixolon SDK USB Host API ile cihazı kendi bulur.
                isUsb ? "" : ip
        );
        config.saveFile();

        POSPrinter printer = new POSPrinter(ctx);
        printer.open(logicalName);
        printer.claim(5000);
        printer.setDeviceEnabled(true);
        return printer;
    }

    private void closeQuietly(POSPrinter printer) {
        if (printer == null) return;
        try { if (printer.getClaimed()) printer.setDeviceEnabled(false); } catch (Throwable ignored) {}
        try { if (printer.getClaimed()) printer.release(); } catch (Throwable ignored) {}
        try { printer.close(); } catch (Throwable ignored) {}
    }

    private String productNameFor(String model) {
        // Bilinen modeller — gerekirse genişlet
        if ("SRP-E300".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_E300;
        if ("SRP-E302".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_E302;
        if ("SRP-QE300".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_QE300;
        if ("SRP-QE302".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_QE302;
        if ("SRP-380".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_380;
        if ("SRP-350III".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_350III;
        if ("SRP-350V".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_350V;
        if ("SRP-Q300".equalsIgnoreCase(model)) return BXLConfigLoader.PRODUCT_NAME_SRP_Q300;
        // varsayılan
        return BXLConfigLoader.PRODUCT_NAME_SRP_E300;
    }

    private String renderLine(JSONObject line) {
        String type = line.optString("type", "text");
        switch (type) {
            case "text": {
                String text = line.optString("text", "");
                String align = line.optString("align", "left");
                int size = line.optInt("size", 28);
                boolean bold = line.optBoolean("bold", false);
                boolean italic = line.optBoolean("italic", false); // SDK desteklemiyor — bold ile yaklaş

                StringBuilder sb = new StringBuilder();
                if ("center".equalsIgnoreCase(align)) sb.append(ESC).append("cA");
                else if ("right".equalsIgnoreCase(align)) sb.append(ESC).append("rA");
                else sb.append(ESC).append("lA");

                int scale = scaleFromSize(size);
                sb.append(ESC).append(scale).append("hC").append(ESC).append(scale).append("vC");

                if (bold || italic) sb.append(ESC).append("bC");
                sb.append(text);
                if (bold || italic) sb.append(ESC).append("!bC");
                sb.append("\n");
                return sb.toString();
            }
            case "divider": {
                String ch = line.optString("char", "-");
                StringBuilder div = new StringBuilder();
                div.append(ESC).append("lA").append(ESC).append("1hC").append(ESC).append("1vC");
                for (int i = 0; i < LINE_WIDTH; i++) div.append(ch);
                div.append("\n");
                return div.toString();
            }
            case "feed": {
                int n = line.optInt("lines", 1);
                StringBuilder feed = new StringBuilder();
                for (int j = 0; j < n; j++) feed.append("\n");
                return feed.toString();
            }
            case "qr":
                // Bu sürümde basit metin fallback — gerekirse SDK printBarcode ile QR eklenir
                String data = line.optString("data", "");
                if (data.isEmpty()) return "";
                return ESC + "cA" + data + "\n";
            default:
                return "";
        }
    }

    private int scaleFromSize(int size) {
        // iMin piksel-size'ından Bixolon ölçeğine — 80mm için muhafazakar.
        // Sadece başlık/toplam (>=32) 2x; normal gövde (28 ve altı) 1x kalır.
        if (size >= 32) return 2;
        return 1;
    }

    private String dashes() {
        StringBuilder sb = new StringBuilder();
        sb.append(ESC).append("lA").append(ESC).append("1hC").append(ESC).append("1vC");
        for (int i = 0; i < LINE_WIDTH; i++) sb.append('-');
        return sb.toString();
    }
}
