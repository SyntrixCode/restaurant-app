package com.alazligida.pos;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.imin.printer.PrinterHelper;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * iMin termal yazıcı (PrinterHelper, com.imin.printer.*) için Capacitor plugin.
 *
 * iMin cihazlarında (Swan 1/Pro, M2, Falcon) OS seviyesinde bir PrinterService
 * vardır. PrinterHelper bu service'e bind olur, başarısız olursa initialized=false.
 *
 * JS API:
 *   IminPrinter.isAvailable()
 *   IminPrinter.printReceipt({ lines, cut, feedLines })
 *
 * `lines` formatı:
 *   { type: 'text', text, align?, size?, bold?, italic? }
 *   { type: 'divider', char? }
 *   { type: 'feed', lines? }
 *   { type: 'qr', data, align? }
 */
@CapacitorPlugin(name = "IminPrinter")
public class IminPrinterPlugin extends Plugin {

    private static final int LINE_WIDTH = 32;
    private PrinterHelper helper;
    private boolean initialized = false;
    private String initError = null;

    @Override
    public void load() {
        try {
            Context appCtx = getContext().getApplicationContext();
            helper = PrinterHelper.getInstance();
            boolean ok = helper.initPrinterService(appCtx);
            initialized = ok;
            if (!ok) initError = "initPrinterService returned false (cihazda iMin servisi yok?)";
        } catch (Throwable t) {
            initialized = false;
            initError = t.getClass().getSimpleName() + ": " + t.getMessage();
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (initialized && helper != null) {
                helper.deInitPrinterService(getContext().getApplicationContext());
            }
        } catch (Throwable ignored) {
            // ignore
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", initialized);
        if (initError != null) ret.put("error", initError);
        call.resolve(ret);
    }

    @PluginMethod
    public void printReceipt(PluginCall call) {
        if (!initialized) {
            call.reject("Yazıcı kullanılamıyor: " + (initError != null ? initError : "bilinmeyen"));
            return;
        }
        JSArray lines = call.getArray("lines");
        if (lines == null) {
            call.reject("'lines' parametresi gerekli (dizi).");
            return;
        }
        Boolean cut = call.getBoolean("cut", Boolean.TRUE);
        Integer feedLines = call.getInt("feedLines", 3);

        try {
            // Buffer mode — komutları biriktir, sonunda tek seferde flush
            helper.enterPrinterBuffer(true);

            for (int i = 0; i < lines.length(); i++) {
                JSONObject line = lines.getJSONObject(i);
                renderLine(line);
            }

            // Son boşluk satırları (kağıt kesilince yazı görünür kalsın)
            for (int j = 0; j < feedLines; j++) {
                helper.printAndLineFeed();
            }

            // Kağıdı kes (donanım desteklemiyorsa sessizce yutulur)
            if (Boolean.TRUE.equals(cut)) {
                try {
                    helper.partialCut();
                } catch (Throwable ignored) {}
            }

            // Buffer'ı flush et + çıkış
            helper.commitPrinterBuffer();
            helper.exitPrinterBuffer(true);

            call.resolve();
        } catch (Throwable t) {
            try {
                helper.exitPrinterBuffer(false);
            } catch (Throwable ignored) {}
            call.reject("Yazdırma hatası: " + t.getMessage());
        }
    }

    private void renderLine(JSONObject line) throws JSONException {
        String type = line.optString("type", "text");
        switch (type) {
            case "text": {
                int align = parseAlign(line.optString("align", "left"));
                int size = line.optInt("size", 28);
                boolean bold = line.optBoolean("bold", false);
                boolean italic = line.optBoolean("italic", false);
                String text = line.optString("text", "");
                if (!text.endsWith("\n")) text = text + "\n";

                // Bitmap text — Türkçe karakter ve özel font desteği için
                helper.setTextBitmapSize(size);
                helper.setTextBitmapStyle(boldItalicStyle(bold, italic));
                helper.printTextBitmapWithAli(text, align, null);
                break;
            }
            case "divider": {
                String ch = line.optString("char", "-");
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < LINE_WIDTH; i++) sb.append(ch);
                sb.append("\n");
                helper.setTextBitmapSize(28);
                helper.setTextBitmapStyle(0);
                helper.printTextBitmapWithAli(sb.toString(), 1, null);
                break;
            }
            case "feed": {
                int n = line.optInt("lines", 1);
                for (int j = 0; j < n; j++) helper.printAndLineFeed();
                break;
            }
            case "qr": {
                String data = line.optString("data", "");
                if (data.isEmpty()) return;
                int align = parseAlign(line.optString("align", "center"));
                int qrSize = line.optInt("size", 6); // 1-10, default 6
                helper.setQrCodeSize(qrSize);
                helper.printQrCodeWithAlign(data, align, null);
                break;
            }
            default:
                // Bilinmeyen tip — yoksay
                break;
        }
    }

    private int boldItalicStyle(boolean bold, boolean italic) {
        if (bold && italic) return 3;
        if (bold) return 1;
        if (italic) return 2;
        return 0;
    }

    private int parseAlign(String s) {
        if ("center".equalsIgnoreCase(s)) return 1;
        if ("right".equalsIgnoreCase(s)) return 2;
        return 0;
    }
}
