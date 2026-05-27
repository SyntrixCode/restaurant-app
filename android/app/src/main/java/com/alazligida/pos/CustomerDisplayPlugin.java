package com.alazligida.pos;

import android.app.Presentation;
import android.content.Context;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.view.Display;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Müşteri ekranı plugin'i — iMin Swan 1 Pro vb. cihazlardaki ikincil ekrana
 * ayrı bir WebView (Presentation) içeriği basar.
 *
 * Ana app `start()` çağırınca:
 *   1. DisplayManager ikincil ekran arar
 *   2. Bulursa Presentation üzerinde WebView açar
 *   3. WebView, Capacitor'un dist'inden /customer-display route'unu yükler
 *   4. State sync BroadcastChannel ('customer-display') üzerinden ana app ile
 *
 * JS API:
 *   CustomerDisplay.start({ url? })  — ikincil ekranda /customer-display'i aç
 *   CustomerDisplay.stop()           — kapat
 *   CustomerDisplay.isAvailable()    — ikincil ekran var mı?
 */
@CapacitorPlugin(name = "CustomerDisplay")
public class CustomerDisplayPlugin extends Plugin {

    private SecondaryPresentation presentation;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        Display secondary = findSecondaryDisplay();
        ret.put("available", secondary != null);
        if (secondary != null) {
            ret.put("displayId", secondary.getDisplayId());
            ret.put("name", secondary.getName());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void start(final PluginCall call) {
        final String relativeUrl = call.getString("url", "/customer-display");
        getActivity().runOnUiThread(() -> {
            try {
                if (presentation != null) {
                    presentation.dismiss();
                    presentation = null;
                }
                Display secondary = findSecondaryDisplay();
                if (secondary == null) {
                    call.reject("Secondary display bulunamadı");
                    return;
                }
                // Capacitor app'in kendi origin'ini bul
                String baseUrl = "https://localhost"; // Android default Capacitor scheme
                String fullUrl = baseUrl + relativeUrl;

                presentation = new SecondaryPresentation(getContext(), secondary, fullUrl);
                presentation.show();

                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("url", fullUrl);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Müşteri ekranı açılamadı: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (presentation != null) {
                presentation.dismiss();
                presentation = null;
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (presentation != null) {
            try { presentation.dismiss(); } catch (Throwable ignored) {}
            presentation = null;
        }
    }

    private Display findSecondaryDisplay() {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        if (dm == null) return null;
        Display[] displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        if (displays == null || displays.length == 0) return null;
        return displays[0];
    }

    /**
     * İkincil ekrandaki tam ekran WebView container.
     */
    private static class SecondaryPresentation extends Presentation {
        private final String url;
        private WebView webView;

        SecondaryPresentation(Context outerContext, Display display, String url) {
            super(outerContext, display);
            this.url = url;
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            webView = new WebView(getContext());
            webView.setBackgroundColor(Color.BLACK);
            WebSettings s = webView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
            webView.setWebViewClient(new WebViewClient());
            webView.setWebChromeClient(new WebChromeClient());
            webView.loadUrl(url);
            webView.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
            setContentView(webView);
        }
    }
}
