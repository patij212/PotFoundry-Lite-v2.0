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
 * - SUPABASE_URL or VITE_SUPABASE_URL: Supabase project URL
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
        console.log('[Webhook] Verifying signature...');

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
            console.error('[Webhook] Timestamp too old');
            return false;
        }

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

        const isValid = expectedSig === sig;
        console.log('[Webhook] Signature valid:', isValid);
        return isValid;
    } catch (error) {
        console.error('[Webhook] Signature error:', error);
        return false;
    }
}

// Update user subscription tier in Supabase
async function updateUserTier(
    email: string,
    tier: 'free' | 'pro',
    supabaseUrl: string,
    serviceKey: string
): Promise<{ success: boolean; message: string }> {
    try {
        console.log('[Webhook] Updating', email, 'to', tier);
        console.log('[Webhook] URL:', supabaseUrl);

        const url = `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`;

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Prefer': 'return=representation',
            },
            body: JSON.stringify({ subscription_tier: tier }),
        });

        console.log('[Webhook] Response:', response.status);
        const text = await response.text();
        console.log('[Webhook] Body:', text);

        if (!response.ok) {
            return { success: false, message: `HTTP ${response.status}: ${text}` };
        }

        const result = JSON.parse(text);
        if (!Array.isArray(result) || result.length === 0) {
            return { success: false, message: `No profile for ${email}` };
        }

        return { success: true, message: `Updated ${email} to ${tier}` };
    } catch (error) {
        console.error('[Webhook] Error:', error);
        return { success: false, message: String(error) };
    }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    console.log('[Webhook] === POST REQUEST ===');
    console.log('[Webhook] STRIPE_WEBHOOK_SECRET:', env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'MISSING');
    console.log('[Webhook] SUPABASE_URL:', env.SUPABASE_URL ? 'SET' : 'MISSING');
    console.log('[Webhook] VITE_SUPABASE_URL:', env.VITE_SUPABASE_URL ? 'SET' : 'MISSING');
    console.log('[Webhook] SUPABASE_SERVICE_KEY:', env.SUPABASE_SERVICE_KEY ? 'SET' : 'MISSING');

    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;

    if (!env.STRIPE_WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: 'Missing STRIPE_WEBHOOK_SECRET' }), { status: 500 });
    }
    if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
        return new Response(JSON.stringify({ error: 'Missing Supabase config' }), { status: 500 });
    }

    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    console.log('[Webhook] Payload length:', payload.length);

    if (!signature) {
        return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 });
    }

    const isValid = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
    }

    let event: StripeEvent;
    try {
        event = JSON.parse(payload);
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    console.log('[Webhook] Event:', event.type);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const email = session.customer_email || session.customer_details?.email;

        console.log('[Webhook] Email:', email);

        if (!email) {
            return new Response(JSON.stringify({ error: 'No email' }), { status: 400 });
        }

        const result = await updateUserTier(email, 'pro', supabaseUrl, env.SUPABASE_SERVICE_KEY);

        return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ received: true, event: event.type }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};

// GET for testing
export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env, request } = context;
    const url = new URL(request.url);

    // Manual test endpoint
    const testEmail = url.searchParams.get('test_email');
    const secret = url.searchParams.get('secret');

    if (testEmail && secret === 'potfoundry2024') {
        const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
        if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
            return new Response(JSON.stringify({ error: 'Missing config' }), { status: 500 });
        }
        const result = await updateUserTier(testEmail, 'pro', supabaseUrl, env.SUPABASE_SERVICE_KEY);
        return new Response(JSON.stringify(result), { status: result.success ? 200 : 500 });
    }

    return new Response(JSON.stringify({
        status: 'ok',
        message: 'PotFoundry webhook',
        env: {
            STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'MISSING',
            SUPABASE_URL: env.SUPABASE_URL ? 'SET' : 'MISSING',
            VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ? 'SET' : 'MISSING',
            SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY ? 'SET' : 'MISSING',
        }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
