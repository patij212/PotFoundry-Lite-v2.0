/**
 * Stripe Webhook Handler - Cloudflare Pages Function
 * 
 * Handles Stripe webhook events to update user subscription status in Supabase.
 * 
 * Events handled:
 * - checkout.session.completed: User completed payment
 * - customer.subscription.updated: Subscription status changed
 * - customer.subscription.deleted: Subscription cancelled
 * 
 * Required env vars:
 * - STRIPE_WEBHOOK_SECRET: Stripe webhook signing secret
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Supabase service role key (for bypassing RLS)
 */

interface Env {
    STRIPE_WEBHOOK_SECRET: string;
    SUPABASE_URL?: string;
    VITE_SUPABASE_URL?: string;
    SUPABASE_SERVICE_KEY: string;
}

interface StripeEvent {
    id: string;
    type: string;
    data: {
        object: {
            id: string;
            customer_email?: string;
            customer_details?: {
                email?: string;
            };
            customer?: string;
            status?: string;
            metadata?: Record<string, string>;
        };
    };
}

// Verify Stripe webhook signature
async function verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string
): Promise<boolean> {
    try {
        // Parse the signature header
        const parts = signature.split(',');
        const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
        const sig = parts.find(p => p.startsWith('v1='))?.split('=')[1];

        if (!timestamp || !sig) {
            console.error('[Webhook] Invalid signature format');
            return false;
        }

        // Check timestamp is within 5 minutes
        const timestampNum = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - timestampNum) > 300) {
            console.error('[Webhook] Timestamp too old');
            return false;
        }

        // Compute expected signature
        const signedPayload = `${timestamp}.${payload}`;
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const messageData = encoder.encode(signedPayload);

        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
        const expectedSig = Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        return expectedSig === sig;
    } catch (error) {
        console.error('[Webhook] Signature verification error:', error);
        return false;
    }
}

// Update user subscription tier in Supabase
async function updateUserTier(
    email: string,
    tier: 'free' | 'pro',
    supabaseUrl: string,
    serviceKey: string
): Promise<boolean> {
    try {
        console.log(`[Webhook] Updating user ${email} to tier: ${tier}`);

        // Supabase REST API uses query params for filtering
        const updateResponse = await fetch(
            `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': serviceKey,
                    'Authorization': `Bearer ${serviceKey}`,
                    'Prefer': 'return=representation',
                },
                body: JSON.stringify({
                    subscription_tier: tier,
                }),
            }
        );

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error('[Webhook] Supabase update failed:', updateResponse.status, errorText);
            return false;
        }

        const result = await updateResponse.json();
        console.log('[Webhook] Update result:', result);

        if (result.length === 0) {
            console.warn('[Webhook] No profile found for email:', email);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Webhook] Error updating user tier:', error);
        return false;
    }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    // Get Supabase URL (try both env var names)
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;

    // Validate required env vars
    if (!env.STRIPE_WEBHOOK_SECRET) {
        console.error('[Webhook] Missing STRIPE_WEBHOOK_SECRET');
        return new Response('Webhook secret not configured', { status: 500 });
    }

    if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
        console.error('[Webhook] Missing Supabase configuration');
        return new Response('Supabase not configured', { status: 500 });
    }

    // Get the raw body and signature
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        console.error('[Webhook] Missing stripe-signature header');
        return new Response('Missing signature', { status: 400 });
    }

    // Verify signature
    const isValid = await verifyStripeSignature(
        payload,
        signature,
        env.STRIPE_WEBHOOK_SECRET
    );

    if (!isValid) {
        console.error('[Webhook] Invalid signature');
        return new Response('Invalid signature', { status: 401 });
    }

    // Parse the event
    let event: StripeEvent;
    try {
        event = JSON.parse(payload);
    } catch (error) {
        console.error('[Webhook] Failed to parse payload:', error);
        return new Response('Invalid JSON', { status: 400 });
    }

    console.log(`[Webhook] Received event: ${event.type}`);

    // Handle different event types
    switch (event.type) {
        case 'checkout.session.completed': {
            // User completed checkout
            const session = event.data.object;
            const email = session.customer_email || session.customer_details?.email;

            if (!email) {
                console.error('[Webhook] No email in checkout session');
                return new Response('No email found', { status: 400 });
            }

            const success = await updateUserTier(email, 'pro', supabaseUrl, env.SUPABASE_SERVICE_KEY);

            if (success) {
                console.log(`[Webhook] Successfully upgraded ${email} to Pro`);
                return new Response(JSON.stringify({ received: true, upgraded: email }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            } else {
                console.error(`[Webhook] Failed to upgrade ${email}`);
                return new Response('Failed to update user', { status: 500 });
            }
        }

        case 'customer.subscription.updated': {
            // Subscription status changed
            const subscription = event.data.object;
            console.log('[Webhook] Subscription updated:', subscription.status);
            // We'd need to look up the customer email from Stripe API
            // For now, just acknowledge
            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        case 'customer.subscription.deleted': {
            // Subscription cancelled - would downgrade user
            console.log('[Webhook] Subscription deleted');
            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        default:
            // Acknowledge other events
            console.log(`[Webhook] Unhandled event type: ${event.type}`);
            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
    }
};

// Also handle GET for testing
export const onRequestGet: PagesFunction<Env> = async () => {
    return new Response(JSON.stringify({
        status: 'ok',
        message: 'PotFoundry Stripe webhook endpoint',
        timestamp: new Date().toISOString(),
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
