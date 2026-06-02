package com.tileroyale.game;

import android.app.Activity;
import com.android.billingclient.api.*;
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
                    handlePurchase(purchase);
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

    // Recover any purchases that were completed but not yet consumed (e.g. app crash)
    private void recoverPendingPurchases() {
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build(),
                (result, purchases) -> {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (Purchase purchase : purchases) {
                            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                                handlePurchase(purchase);
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

    private void handlePurchase(Purchase purchase) {
        ConsumeParams consumeParams = ConsumeParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build();

        billingClient.consumeAsync(consumeParams, (result, token) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && pendingCall != null) {
                JSObject ret = new JSObject();
                ret.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
                ret.put("orderId", purchase.getOrderId() != null ? purchase.getOrderId() : "");
                pendingCall.resolve(ret);
                pendingCall = null;
            } else if (pendingCall != null) {
                pendingCall.reject("consume_failed");
                pendingCall = null;
            }
        });
    }
}
