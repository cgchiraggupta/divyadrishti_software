package com.divyadrishti.app;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Resolves the glasses' local HTTP service without depending on .local DNS. */
@CapacitorPlugin(name = "LocalDeviceDiscovery")
public class LocalDeviceDiscoveryPlugin extends Plugin {
    private static final String SERVICE_TYPE = "_http._tcp.";
    private static final String SERVICE_NAME = "DivyaDrishti";
    private static final long DISCOVERY_TIMEOUT_MS = 3_000L;

    @PluginMethod
    public void discover(PluginCall call) {
        NsdManager nsdManager = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
        WifiManager wifiManager = (WifiManager) getContext().getApplicationContext()
            .getSystemService(Context.WIFI_SERVICE);
        if (nsdManager == null) {
            call.reject("Nearby discovery is unavailable on this phone.");
            return;
        }

        DiscoverySession session = new DiscoverySession(call, nsdManager, wifiManager,
            new Handler(Looper.getMainLooper()));
        session.start();
    }

    private static final class DiscoverySession {
        private final PluginCall call;
        private final NsdManager nsdManager;
        private final WifiManager wifiManager;
        private final Handler handler;
        private boolean completed;
        private boolean discoveryStarted;
        private WifiManager.MulticastLock multicastLock;

        private final Runnable timeout = () -> finishWithError("Glasses were not found on this Wi-Fi network.");

        DiscoverySession(PluginCall call, NsdManager nsdManager, WifiManager wifiManager, Handler handler) {
            this.call = call;
            this.nsdManager = nsdManager;
            this.wifiManager = wifiManager;
            this.handler = handler;
        }

        void start() {
            if (wifiManager != null) {
                multicastLock = wifiManager.createMulticastLock("divyadrishti-mdns");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
            }
            try {
                nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
                discoveryStarted = true;
                handler.postDelayed(timeout, DISCOVERY_TIMEOUT_MS);
            } catch (IllegalArgumentException exception) {
                finishWithError("Nearby discovery could not start.");
            }
        }

        private final NsdManager.DiscoveryListener discoveryListener = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String serviceType) { }
            @Override public void onServiceLost(NsdServiceInfo serviceInfo) { }
            @Override public void onDiscoveryStopped(String serviceType) { }

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                finishWithError("Nearby discovery could not start.");
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                finishWithError("Nearby discovery stopped unexpectedly.");
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                if (!SERVICE_NAME.equalsIgnoreCase(serviceInfo.getServiceName()) || completed) return;
                stopDiscovery();
                try {
                    nsdManager.resolveService(serviceInfo, resolveListener);
                } catch (IllegalArgumentException exception) {
                    finishWithError("Nearby glasses could not be resolved.");
                }
            }
        };

        private final NsdManager.ResolveListener resolveListener = new NsdManager.ResolveListener() {
            @Override
            public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                finishWithError("Nearby glasses could not be resolved.");
            }

            @Override
            public void onServiceResolved(NsdServiceInfo serviceInfo) {
                if (serviceInfo.getHost() == null || serviceInfo.getPort() <= 0) {
                    finishWithError("Nearby glasses returned an invalid address.");
                    return;
                }
                JSObject result = new JSObject();
                result.put("host", serviceInfo.getHost().getHostAddress());
                result.put("port", serviceInfo.getPort());
                finish(result);
            }
        };

        private void finishWithError(String message) {
            if (completed) return;
            completed = true;
            handler.removeCallbacks(timeout);
            stopDiscovery();
            releaseMulticastLock();
            call.reject(message);
        }

        private void finish(JSObject result) {
            if (completed) return;
            completed = true;
            handler.removeCallbacks(timeout);
            stopDiscovery();
            releaseMulticastLock();
            call.resolve(result);
        }

        private void stopDiscovery() {
            if (!discoveryStarted) return;
            discoveryStarted = false;
            try {
                nsdManager.stopServiceDiscovery(discoveryListener);
            } catch (IllegalArgumentException ignored) {
                // Discovery may already be stopped after a platform callback.
            }
        }

        private void releaseMulticastLock() {
            if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
        }
    }
}
