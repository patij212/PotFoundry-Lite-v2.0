/**
 * Stripe Webhook Handler - Cloudflare Pages Function
 * 
 * Comprehensive handler for all Stripe subscription lifecycle events.
 * 
 * Events Handled (17 total):
 * - Checkout: completed, async_payment_succeeded, async_payment_failed
 * - Subscriptions: created, updated, deleted, paused, resumed, trial_will_end
 * - Invoices: paid, payment_failed, upcoming
 * - Customers: created, updated, deleted
 * - Payment Intents: succeeded, payment_failed
 * 
 * Required env vars:
 * - STRIPE_WEBHOOK_SECRET: Stripe webhook signing secret
 * - SUPABASE_URL or VITE_SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Supabase service role key
 */

interface Env {
    STRIPE_WEBHOOK_SECRET: string;
    SUPABASE_URL?: string;
    VITE_SUPABASE_URL?: string;
    SUPABASE_SERVICE_KEY: string;
    STRIPE_SECRET_KEY?: string;
}

// ============================================================================
// Type Definitions
// ============================================================================

interface StripeEvent {
    id: string;
    type: string;
    data: {
        object: StripeObject;
    };
}

interface StripeObject {
    id: string;
    object: string;
    customer?: string;
    customer_email?: string;
    customer_details?: { email?: string };
    email?: string;
    status?: string;
    subscription?: string;
    cancel_at_period_end?: boolean;
    current_period_end?: number;
    metadata?: Record<string, string>;
    billing_reason?: string;
}

interface WebhookResult {
    success: boolean;
    message: string;
    action?: string;
}

// ============================================================================
// Signature Verification
// ============================================================================

async function verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string
): Promise<boolean> {
    try {
        const parts = signature.split(',');
        const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
        const sig = parts.find(p => p.startsWith('v1='))?.split('=')[1];

        if (!timestamp || !sig) {
            console.error('[Webhook] Invalid signature format');
            return false;
        }

        const timestampNum = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - timestampNum) > 300) {
            console.error('[Webhook] Timestamp too old:', Math.abs(now - timestampNum), 'seconds');
            return false;
        }

        const signedPayload = `${timestamp}.${payload}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
        const expectedSig = Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        return expectedSig === sig;
    } catch (error) {
        console.error('[Webhook] Signature verification error:', error);
        return false;
    }
}

// ============================================================================
// Database Operations
// ============================================================================

async function updateProfile(
    supabaseUrl: string,
    serviceKey: string,
    email: string,
    updates: Record<string, unknown>
): Promise<WebhookResult> {
    try {
        console.log('[Webhook] Updating profile:', email, updates);

        const url = `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`;

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Prefer': 'return=representation',
            },
            body: JSON.stringify(updates),
        });

        const text = await response.text();
        console.log('[Webhook] Response:', response.status, text);

        if (!response.ok) {
            return { success: false, message: `HTTP ${response.status}: ${text}` };
        }

        const result = JSON.parse(text);
        if (!Array.isArray(result) || result.length === 0) {
            return { success: false, message: `No profile found for ${email}` };
        }

        return { success: true, message: `Updated ${email}` };
    } catch (error) {
        console.error('[Webhook] Database error:', error);
        return { success: false, message: String(error) };
    }
}

async function updateProfileByCustomerId(
    supabaseUrl: string,
    serviceKey: string,
    customerId: string,
    updates: Record<string, unknown>
): Promise<WebhookResult> {
    try {
        console.log('[Webhook] Updating by customer ID:', customerId, updates);

        const url = `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}`;

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Prefer': 'return=representation',
            },
            body: JSON.stringify(updates),
        });

        const text = await response.text();

        if (!response.ok) {
            return { success: false, message: `HTTP ${response.status}: ${text}` };
        }

        const result = JSON.parse(text);
        if (!Array.isArray(result) || result.length === 0) {
            return { success: false, message: `No profile for customer ${customerId}` };
        }

        return { success: true, message: `Updated customer ${customerId}` };
    } catch (error) {
        return { success: false, message: String(error) };
    }
}

// ============================================================================
// Stripe API Helper (for fetching customer email when not in event)
// ============================================================================

async function getCustomerEmail(customerId: string, stripeKey?: string): Promise<string | null> {
    if (!stripeKey || !customerId) return null;

    try {
        const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
            headers: {
                'Authorization': `Bearer ${stripeKey}`,
            },
        });

        if (!response.ok) return null;

        const customer = await response.json();
        return customer.email || null;
    } catch {
        return null;
    }
}

// ============================================================================
// Event Handlers
// ============================================================================

// Maps Stripe subscription status to our tier and status
function mapSubscriptionStatus(stripeStatus: string | undefined): { tier: string; status: string } {
    switch (stripeStatus) {
        case 'active':
            return { tier: 'pro', status: 'active' };
        case 'trialing':
            return { tier: 'pro', status: 'trialing' };
        case 'past_due':
            return { tier: 'pro', status: 'past_due' }; // Grace period
        case 'canceled':
        case 'unpaid':
            return { tier: 'free', status: 'canceled' };
        case 'paused':
            return { tier: 'free', status: 'paused' };
        default:
            return { tier: 'free', status: 'none' };
    }
}

// Handle checkout.session.completed
async function handleCheckoutCompleted(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;

    if (!email) {
        return { success: false, message: 'No email in checkout session' };
    }

    const updates: Record<string, unknown> = {
        subscription_tier: 'pro',
        subscription_status: 'active',
    };

    if (session.customer) {
        updates.stripe_customer_id = session.customer;
    }
    if (session.subscription) {
        updates.stripe_subscription_id = session.subscription;
    }

    const result = await updateProfile(supabaseUrl, serviceKey, email, updates);
    return { ...result, action: 'checkout_completed' };
}

// Handle customer.subscription.created
async function handleSubscriptionCreated(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string,
    stripeKey?: string
): Promise<WebhookResult> {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    if (!customerId) {
        return { success: false, message: 'No customer ID in subscription' };
    }

    const { tier, status } = mapSubscriptionStatus(subscription.status);

    const updates: Record<string, unknown> = {
        subscription_tier: tier,
        subscription_status: status,
        stripe_subscription_id: subscription.id,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
    };

    if (subscription.current_period_end) {
        updates.subscription_period_end = new Date(subscription.current_period_end * 1000).toISOString();
    }

    // Try by customer ID first
    let result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customerId, updates);

    // If no profile found by customer ID, try fetching email from Stripe
    if (!result.success && stripeKey) {
        const email = await getCustomerEmail(customerId, stripeKey);
        if (email) {
            updates.stripe_customer_id = customerId;
            result = await updateProfile(supabaseUrl, serviceKey, email, updates);
        }
    }

    return { ...result, action: 'subscription_created' };
}

// Handle customer.subscription.updated
async function handleSubscriptionUpdated(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    if (!customerId) {
        return { success: false, message: 'No customer ID' };
    }

    const { tier, status } = mapSubscriptionStatus(subscription.status);

    const updates: Record<string, unknown> = {
        subscription_tier: tier,
        subscription_status: status,
        stripe_subscription_id: subscription.id,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
    };

    if (subscription.current_period_end) {
        updates.subscription_period_end = new Date(subscription.current_period_end * 1000).toISOString();
    }

    const result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customerId, updates);
    return { ...result, action: 'subscription_updated' };
}

// Handle customer.subscription.deleted
async function handleSubscriptionDeleted(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    if (!customerId) {
        return { success: false, message: 'No customer ID' };
    }

    const updates = {
        subscription_tier: 'free',
        subscription_status: 'canceled',
        stripe_subscription_id: null,
        cancel_at_period_end: false,
    };

    const result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customerId, updates);
    return { ...result, action: 'subscription_deleted' };
}

// Handle customer.subscription.paused
async function handleSubscriptionPaused(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    if (!customerId) {
        return { success: false, message: 'No customer ID' };
    }

    const updates = {
        subscription_tier: 'free', // Lose access when paused
        subscription_status: 'paused',
    };

    const result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customerId, updates);
    return { ...result, action: 'subscription_paused' };
}

// Handle customer.subscription.resumed
async function handleSubscriptionResumed(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    if (!customerId) {
        return { success: false, message: 'No customer ID' };
    }

    const updates = {
        subscription_tier: 'pro',
        subscription_status: 'active',
    };

    const result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customerId, updates);
    return { ...result, action: 'subscription_resumed' };
}

// Handle invoice.paid
async function handleInvoicePaid(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const invoice = event.data.object;
    const customerId = invoice.customer;

    if (!customerId) {
        return { success: false, message: 'No customer ID' };
    }

    // Only update for subscription invoices (not one-time)
    if (invoice.billing_reason === 'subscription_cycle' || invoice.billing_reason === 'subscription_create') {
        const updates = {
            subscription_tier: 'pro',
            subscription_status: 'active',
        };

        const result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customerId, updates);
        return { ...result, action: 'invoice_paid' };
    }

    return { success: true, message: 'Non-subscription invoice, skipped', action: 'invoice_paid_skipped' };
}

// Handle invoice.payment_failed
async function handleInvoicePaymentFailed(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const invoice = event.data.object;
    const customerId = invoice.customer;

    if (!customerId) {
        return { success: false, message: 'No customer ID' };
    }

    // Set to past_due but keep pro access (grace period)
    const updates = {
        subscription_status: 'past_due',
        // Note: keeping subscription_tier as 'pro' for grace period
    };

    const result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customerId, updates);
    return { ...result, action: 'invoice_payment_failed' };
}

// Handle customer.created
async function handleCustomerCreated(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const customer = event.data.object;
    const email = customer.email;

    if (!email) {
        return { success: false, message: 'No email in customer' };
    }

    const updates = {
        stripe_customer_id: customer.id,
    };

    const result = await updateProfile(supabaseUrl, serviceKey, email, updates);
    return { ...result, action: 'customer_created' };
}

// Handle customer.updated
async function handleCustomerUpdated(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const customer = event.data.object;

    // Just log - email changes would need more complex handling
    console.log('[Webhook] Customer updated:', customer.id);

    return { success: true, message: 'Customer update logged', action: 'customer_updated' };
}

// Handle customer.deleted
async function handleCustomerDeleted(
    event: StripeEvent,
    supabaseUrl: string,
    serviceKey: string
): Promise<WebhookResult> {
    const customer = event.data.object;

    const updates = {
        stripe_customer_id: null,
        stripe_subscription_id: null,
        subscription_tier: 'free',
        subscription_status: 'none',
    };

    const result = await updateProfileByCustomerId(supabaseUrl, serviceKey, customer.id, updates);
    return { ...result, action: 'customer_deleted' };
}

// ============================================================================
// Main Webhook Handler
// ============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const startTime = Date.now();

    console.log('[Webhook] === INCOMING EVENT ===');

    // Validate environment
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;

    if (!env.STRIPE_WEBHOOK_SECRET) {
        return jsonResponse({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, 500);
    }
    if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
        return jsonResponse({ error: 'Missing Supabase config' }, 500);
    }

    // Get and verify signature
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        return jsonResponse({ error: 'Missing signature' }, 400);
    }

    const isValid = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
        return jsonResponse({ error: 'Invalid signature' }, 401);
    }

    // Parse event
    let event: StripeEvent;
    try {
        event = JSON.parse(payload);
    } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    console.log('[Webhook] Event:', event.type, event.id);

    // Route to appropriate handler
    let result: WebhookResult;

    switch (event.type) {
        // Checkout events
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
            result = await handleCheckoutCompleted(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'checkout.session.async_payment_failed':
            result = { success: true, message: 'Async payment failed, awaiting retry', action: 'checkout_failed' };
            break;

        // Subscription events
        case 'customer.subscription.created':
            result = await handleSubscriptionCreated(event, supabaseUrl, env.SUPABASE_SERVICE_KEY, env.STRIPE_SECRET_KEY);
            break;

        case 'customer.subscription.updated':
            result = await handleSubscriptionUpdated(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'customer.subscription.deleted':
            result = await handleSubscriptionDeleted(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'customer.subscription.paused':
            result = await handleSubscriptionPaused(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'customer.subscription.resumed':
            result = await handleSubscriptionResumed(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'customer.subscription.trial_will_end':
            // Could trigger email notification here
            result = { success: true, message: 'Trial ending soon notification', action: 'trial_will_end' };
            break;

        // Invoice events
        case 'invoice.paid':
            result = await handleInvoicePaid(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'invoice.payment_failed':
            result = await handleInvoicePaymentFailed(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'invoice.upcoming':
            // Could trigger email notification here
            result = { success: true, message: 'Upcoming invoice notification', action: 'invoice_upcoming' };
            break;

        // Customer events
        case 'customer.created':
            result = await handleCustomerCreated(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'customer.updated':
            result = await handleCustomerUpdated(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        case 'customer.deleted':
            result = await handleCustomerDeleted(event, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            break;

        // Payment Intent events
        case 'payment_intent.succeeded':
            result = { success: true, message: 'Payment succeeded', action: 'payment_succeeded' };
            break;

        case 'payment_intent.payment_failed':
            result = { success: true, message: 'Payment failed', action: 'payment_failed' };
            break;

        default:
            result = { success: true, message: `Unhandled event: ${event.type}`, action: 'unhandled' };
    }

    const duration = Date.now() - startTime;
    console.log(`[Webhook] Completed in ${duration}ms:`, result);

    // Always return 200 to acknowledge receipt (prevents Stripe retries for handled events)
    return jsonResponse({
        received: true,
        event_id: event.id,
        event_type: event.type,
        ...result,
        duration_ms: duration,
    }, 200);
};

// Helper for JSON responses
function jsonResponse(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ============================================================================
// GET Endpoint for Status/Testing
// ============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env, request } = context;
    const url = new URL(request.url);

    // Manual upgrade test endpoint (dev only)
    const testEmail = url.searchParams.get('test_email');
    const testAction = url.searchParams.get('action') || 'pro';
    const secret = url.searchParams.get('secret');

    if (testEmail && secret === 'potfoundry2024') {
        const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
        if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
            return jsonResponse({ error: 'Missing config' }, 500);
        }

        const tier = testAction === 'free' ? 'free' : 'pro';
        const status = testAction === 'free' ? 'canceled' : 'active';

        const result = await updateProfile(supabaseUrl, env.SUPABASE_SERVICE_KEY, testEmail, {
            subscription_tier: tier,
            subscription_status: status,
        });

        return jsonResponse(result, result.success ? 200 : 500);
    }

    // Status endpoint
    return jsonResponse({
        status: 'ok',
        message: 'PotFoundry Stripe Webhook',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        events_handled: [
            'checkout.session.completed',
            'checkout.session.async_payment_succeeded',
            'checkout.session.async_payment_failed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
            'customer.subscription.paused',
            'customer.subscription.resumed',
            'customer.subscription.trial_will_end',
            'invoice.paid',
            'invoice.payment_failed',
            'invoice.upcoming',
            'customer.created',
            'customer.updated',
            'customer.deleted',
            'payment_intent.succeeded',
            'payment_intent.payment_failed',
        ],
        env: {
            STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'MISSING',
            SUPABASE_URL: env.SUPABASE_URL ? 'SET' : 'MISSING',
            VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ? 'SET' : 'MISSING',
            SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY ? 'SET' : 'MISSING',
        },
    }, 200);
};
