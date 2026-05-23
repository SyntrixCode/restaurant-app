package com.alazligida.pos;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.imin.printerlib.IminPrintUtils;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * iMin termal yazıcı için Capacitor plugin.
 *
 * JS tarafından çağrılan API:
 *   IminPrinter.isAvailable() — yazıcı başlatıldı mı
 *   IminPrinter.printReceipt({ lines, cut, feedLines }) — fiş bas
 *
 * `lines` formatı:
 *   { type: 'text', text: '...', align?: 'left'|'center'|'right', size?: 28, bold?: false, italic?: false }
 *   { type: 'divider', char?: '-' }   // 32 karakter genişlikte ayırıcı
 *   { type: 'feed', lines?: 1 }       // boş satır
 *   { type: 'qr', data: '...', align?: 'center' }
 *
 * Cihazda iMin SDK yoksa (örn. tarayıcı/normal Android) plugin available=false döner,
 * JS tarafı `window.print()` fallback'ine düşer.
 */
@CapacitorPlugin(name = "IminPrinter")
public class IminPrinterPlugin extends Plugin {

    private IminPrintUtils printer;
    private boolean initialized = false;
    private String initError = null;

    @Override
    public void load() {
        try {
            Context context = getContext();
            printer = IminPrintUtils.getInstance(context);
            // SPI = Swan 1 / Swan 1 Pro built-in printer
            printer.initPrinter(IminPrintUtils.PrintConnectType.SPI);
            initialized = true;
        } catch (Throwable t) {
            initialized = false;
            initError = t.getClass().getSimpleName() + ": " + t.getMessage();
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
            call.reject("Yazıcı başlatılamadı: " + (initError != null ? initError : "bilinmeyen"));
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
            for (int i = 0; i < lines.length(); i++) {
                JSONObject line = lines.getJSONObject(i);
                String type = line.optString("type", "text");
                renderLine(type, line);
            }

            // Sondaki boşluk (kağıt kesilirken metnin görünür kalması için)
            StringBuilder pad = new StringBuilder();
            for (int j = 0; j < feedLines; j++) pad.append("\n");
            printer.printText(pad.toString());

            // Kağıdı kes (donanım desteklemiyorsa sessizce yutulur)
            if (Boolean.TRUE.equals(cut)) {
                try {
                    printer.partialCut();
                } catch (Throwable ignored) {
                    // Bazı modeller cutter'sız; problem değil
                }
            }

            call.resolve();
        } catch (JSONException e) {
            call.reject("Fiş içeriği hatalı: " + e.getMessage());
        } catch (Throwable t) {
            call.reject("Yazdırma hatası: " + t.getMessage());
        }
    }

    private void renderLine(String type, JSONObject line) throws JSONException {
        switch (type) {
            case "text": {
                printer.setAlignment(parseAlign(line.optString("align", "left")));
                printer.setTextSize(line.optInt("size", 28));
                int style = 0;
                if (line.optBoolean("bold", false)) style += 1;
                if (line.optBoolean("italic", false)) style += 2;
                printer.setTextStyle(style);
                String text = line.optString("text", "");
                printer.printText(text + "\n");
                break;
            }
            case "divider": {
                String ch = line.optString("char", "-");
                printer.setAlignment(1);
                printer.setTextSize(28);
                printer.setTextStyle(0);
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < 32; i++) sb.append(ch);
                printer.printText(sb.toString() + "\n");
                break;
            }
            case "feed": {
                int n = line.optInt("lines", 1);
                StringBuilder sb = new StringBuilder();
                for (int j = 0; j < n; j++) sb.append("\n");
                printer.printText(sb.toString());
                break;
            }
            case "qr": {
                String data = line.optString("data", "");
                if (data.isEmpty()) return;
                try {
                    printer.setAlignment(parseAlign(line.optString("align", "center")));
                    // SDK'da imza: printQrCode(String) ya da (String, int alignment)
                    printer.printQrCode(data);
                } catch (Throwable t) {
                    // QR desteklenmezse geç
                }
                break;
            }
            default:
                // Bilinmeyen tipi yoksay
                break;
        }
    }

    private int parseAlign(String s) {
        if ("center".equalsIgnoreCase(s)) return 1;
        if ("right".equalsIgnoreCase(s)) return 2;
        return 0;
    }
}
