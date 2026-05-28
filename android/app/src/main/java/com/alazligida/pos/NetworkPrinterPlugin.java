package com.alazligida.pos;

import android.content.Context;

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
 * Bixolon (UPOS) network printer plugin — SRP-E300 vb. Ethernet termal yazıcılar.
 *
 * Her basım için BXLConfigLoader üzerinden cihazı jpos.xml'e ekler,
 * POSPrinter üzerinden açar, basar, kapatır. ESC|... escape dizileriyle
 * format kontrolü (align/bold/size) yapılır.
 *
 * JS API:
 *   NetworkPrinter.printReceipt({ ip, port?, model?, lines, cut?, feedLines? })
 *   NetworkPrinter.testPrint({ ip, port?, model? })
 */
@CapacitorPlugin(name = "NetworkPrinter")
public class NetworkPrinterPlugin extends Plugin {

    private static final int LINE_WIDTH = 42;
    private static final String ESC = new String(new byte[]{0x1b, 0x7c});

    @PluginMethod
    public void printReceipt(PluginCall call) {
        final String ip = call.getString("ip");
        final String model = call.getString("model", "SRP-E300");
        final JSArray lines = call.getArray("lines");
        final boolean cut = Boolean.TRUE.equals(call.getBoolean("cut", Boolean.TRUE));
        final int feedLines = call.getInt("feedLines", 3);

        if (ip == null || ip.isEmpty()) {
            call.reject("ip parametresi gerekli");
            return;
        }
        if (lines == null) {
            call.reject("lines parametresi gerekli (dizi)");
            return;
        }

        new Thread(() -> {
            POSPrinter printer = null;
            try {
                printer = openPrinter(model, ip);
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
            if (bmp == null) return;
            // Station + parlaklık/sıkıştırma/dither paketlenmiş int (sample'dan)
            java.nio.ByteBuffer bb = java.nio.ByteBuffer.allocate(4);
            bb.put((byte) POSPrinterConst.PTR_S_RECEIPT);
            bb.put((byte) 0); // brightness (default)
            bb.put((byte) 0); // compress
            bb.put((byte) 0); // dither
            // width: PTR_BM_ASIS (orijinal genişlik), ortala
            printer.printBitmap(bb.getInt(0), bmp, POSPrinterConst.PTR_BM_ASIS, POSPrinterConst.PTR_BM_CENTER);
        } catch (Throwable t) {
            // Logo basılamadı — fişin geri kalanı yine çıksın
        }
    }

    @PluginMethod
    public void testPrint(PluginCall call) {
        final String ip = call.getString("ip");
        final String model = call.getString("model", "SRP-E300");

        if (ip == null || ip.isEmpty()) {
            call.reject("ip parametresi gerekli");
            return;
        }

        new Thread(() -> {
            POSPrinter printer = null;
            try {
                printer = openPrinter(model, ip);
                String body =
                        ESC + "cA" + ESC + "bC" + ESC + "2hC" + ESC + "2vC" + "SyntrixPos\n"
                                + ESC + "!bC" + ESC + "1hC" + ESC + "1vC" + "TEST YAZDIRMA\n"
                                + dashes() + "\n"
                                + ESC + "lA" + "Tarih: " + new java.text.SimpleDateFormat("dd.MM.yyyy HH:mm").format(new java.util.Date()) + "\n"
                                + "Yazıcı: " + model + "\n"
                                + "IP: " + ip + "\n"
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

    private POSPrinter openPrinter(String model, String ip) throws Throwable {
        Context ctx = getContext();
        BXLConfigLoader config = new BXLConfigLoader(ctx);
        try {
            config.openFile();
        } catch (Exception e) {
            config.newFile();
        }
        List<?> entries = config.getEntries();
        for (Object entry : entries) {
            if (((JposEntry) entry).getLogicalName().equals(model)) {
                config.removeEntry(model);
                break;
            }
        }
        config.addEntry(
                model,
                BXLConfigLoader.DEVICE_CATEGORY_POS_PRINTER,
                productNameFor(model),
                BXLConfigLoader.DEVICE_BUS_ETHERNET,
                ip
        );
        config.saveFile();

        POSPrinter printer = new POSPrinter(ctx);
        printer.open(model);
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
