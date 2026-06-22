
import Stripe from 'stripe';
let stripeClient = null;
export function getStripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY?.trim() || null;
}
export function getStripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
export function getStripePublishableKey() {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}
export function isStripeConfigured() {
    return Boolean(getStripeSecretKey());
}
export function isStripeDemoMode() {
    return !isStripeConfigured();
}
export function getStripeServerClient() {
    const secretKey = getStripeSecretKey();
    if (!secretKey) {
        return null;
    }
    if (!stripeClient) {
        stripeClient = new Stripe(secretKey, {
            appInfo: {
                name: 'TrustLand AI Network',
                version: '1.0.0',
            },
        });
    }
    return stripeClient;
}
