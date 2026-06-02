package com.tileroyale.game;

import android.app.Activity;
import com.android.billingclient.api.*;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin {

    private BillingClient billingClient;
    private volatile PluginCall pendingCall;

    private final PurchasesUpdatedListener purchasesUpdatedListener = (result, purchases) -> {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) {
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    resolvePurchaseCall(purchase);
                }
            }
        } else if (pendingCall != null) {
            int code = result.getResponseCode();
            String msg = (code == BillingClient.BillingResponseCode.USER_CANCELED) ? "cancelled" : "error_" + code;
            pendingCall.reject(msg);
            pendingCall = null;
        }
    };

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(purchasesUpdatedListener)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
                )
                .build();
        connect();
    }

    private void connect() {
        if (billingClient.isReady()) return;
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    recoverPendingPurchases();
                }
            }
            @Override
            public void onBillingServiceDisconnected() {
                connect();
            }
        });
    }

    // On billing client connect: if a purchase() call is pending, resolve it.
    // Does NOT auto-consume — the JS layer handles consume after server verification.
    private void recoverPendingPurchases() {
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build(),
                (result, purchases) -> {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (Purchase purchase : purchases) {
                            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED
                                    && pendingCall != null) {
                                resolvePurchaseCall(purchase);
                            }
                        }
                    }
                }
        );
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId_required");
            return;
        }
        if (!billingClient.isReady()) {
            call.reject("billing_not_ready");
            return;
        }

        pendingCall = call;

        List<QueryProductDetailsParams.Product> productList = Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
        );

        billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(productList).build(),
                (result, detailsList) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || detailsList.isEmpty()) {
                        if (pendingCall != null) {
                            pendingCall.reject("product_not_found");
                            pendingCall = null;
                        }
                        return;
                    }

                    List<BillingFlowParams.ProductDetailsParams> params = Collections.singletonList(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(detailsList.get(0))
                                    .build()
                    );

                    BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(params)
                            .build();

                    Activity activity = getActivity();
                    if (activity != null) {
                        activity.runOnUiThread(() ->
                                billingClient.launchBillingFlow(activity, flowParams)
                        );
                    }
                }
        );
    }

    // Resolves the pending JS call with purchase data — does NOT consume.
    // The JS layer sends the token to the server for verification, then calls consume().
    private void resolvePurchaseCall(Purchase purchase) {
        if (pendingCall == null) return;
        JSObject ret = new JSObject();
        ret.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
        ret.put("orderId", purchase.getOrderId() != null ? purchase.getOrderId() : "");
        ret.put("purchaseToken", purchase.getPurchaseToken());
        pendingCall.resolve(ret);
        pendingCall = null;
    }

    // Consume a purchase token after server has verified and granted the reward.
    @PluginMethod
    public void consume(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null || token.isEmpty()) {
            call.reject("purchaseToken_required");
            return;
        }
        if (!billingClient.isReady()) {
            call.reject("billing_not_ready");
            return;
        }
        ConsumeParams params = ConsumeParams.newBuilder()
                .setPurchaseToken(token)
                .build();
        billingClient.consumeAsync(params, (result, consumedToken) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } else {
                call.reject("consume_failed_" + result.getResponseCode());
            }
        });
    }

    // Returns all unconsumed INAPP purchases held by Google Play for this user.
    // Used by the JS restore-purchases flow on startup and when user taps "Restore".
    @PluginMethod
    public void queryPurchases(PluginCall call) {
        if (!billingClient.isReady()) {
            call.reject("billing_not_ready");
            return;
        }
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build(),
                (result, purchases) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("query_failed_" + result.getResponseCode());
                        return;
                    }
                    JSArray arr = new JSArray();
                    for (Purchase purchase : purchases) {
                        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            JSObject p = new JSObject();
                            p.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
                            p.put("orderId", purchase.getOrderId() != null ? purchase.getOrderId() : "");
                            p.put("purchaseToken", purchase.getPurchaseToken());
                            arr.put(p);
                        }
                    }
                    JSObject ret = new JSObject();
                    ret.put("purchases", arr);
                    call.resolve(ret);
                }
        );
    }
}
