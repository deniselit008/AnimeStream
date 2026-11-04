package com.animestream.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.text.format.Formatter;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout customViewContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View mCustomView;
    private WebViewAssetLoader assetLoader;

    public class AndroidBridge {
        private Context mContext;

        AndroidBridge(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void saveServerUrl(String url) {
            SharedPreferences.Editor editor = getSharedPreferences("animestream_prefs", MODE_PRIVATE).edit();
            editor.putString("server_url", url != null ? url.trim() : "");
            editor.apply();
        }

        @JavascriptInterface
        public String getServerUrl() {
            return getSharedPreferences("animestream_prefs", MODE_PRIVATE).getString("server_url", "");
        }

        @JavascriptInterface
        public String getDeviceWifiIp() {
            try {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (wm != null) {
                    int ip = wm.getConnectionInfo().getIpAddress();
                    return Formatter.formatIpAddress(ip);
                }
            } catch (Exception e) {}
            return "";
        }

        @JavascriptInterface
        public void connectToServer(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveServerUrl(url);
                    if (webView != null) {
                        webView.loadUrl(url);
                    }
                }
            });
        }

        @JavascriptInterface
        public void resetServer() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveServerUrl("");
                    if (webView != null) {
                        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html");
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dark Status & Navigation Bar
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#07090e"));
        window.setNavigationBarColor(Color.parseColor("#07090e"));

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.main_webview);
        customViewContainer = findViewById(R.id.custom_view_container);

        // Initialize WebViewAssetLoader to resolve local assets safely without CORS restrictions
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Expose Native Android Bridge to Web JavaScript
        webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (assetLoader != null && request != null) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    Uri failingUri = request.getUrl();
                    if (failingUri != null && !"appassets.androidplatform.net".equals(failingUri.getHost())) {
                        webView.post(new Runnable() {
                            @Override
                            public void run() {
                                String redirectUrl = "https://appassets.androidplatform.net/assets/public/index.html?error=unreachable&server=" + Uri.encode(failingUri.toString());
                                webView.loadUrl(redirectUrl);
                            }
                        });
                    }
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (mCustomView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                mCustomView = view;
                customViewCallback = callback;
                customViewContainer.addView(view);
                customViewContainer.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            }

            @Override
            public void onHideCustomView() {
                if (mCustomView == null) return;
                customViewContainer.removeView(mCustomView);
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
                mCustomView = null;
            }
        });

        // Determine default URL (check saved host or default local bundled assets)
        SharedPreferences prefs = getSharedPreferences("animestream_prefs", MODE_PRIVATE);
        String serverUrl = prefs.getString("server_url", "");

        if (serverUrl != null && !serverUrl.isEmpty() && serverUrl.startsWith("http") && !serverUrl.contains("appassets")) {
            webView.loadUrl(serverUrl);
        } else {
            webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html");
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mCustomView != null) {
                // Exit fullscreen video
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
                return true;
            }
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
