// Google Play Billing bridge
// Wraps the native BillingPlugin Capacitor plugin.
// Resolves with { productId, orderId } on success.
// Rejects with 'cancelled' if user cancelled, or an error string otherwise.

function nativePurchase(productId) {
  const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Billing;
  if (!plugin) return Promise.reject('not_available');
  return plugin.purchase({ productId: productId });
}
