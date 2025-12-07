/**
 * Cloudflare Worker: Stripe API Handler
 * 
 * Handles:
 * - POST /api/create-checkout - Creates Stripe Checkout session
 * - POST /api/stripe-webhook - Handles Stripe webhook events
 * - GET /api/verify-subscription - Verifies user's subscription status
 * 
 * Deploy this as a Cloudflare Pages Function by placing in:
 * potfoundry-web/functions/api/[[route]].ts
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

interface Env {
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_KEY: string;
}

// Cloudflare Pages Function handler
export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env, params } = context;
    const route = (params.route as string[])?.join('/') || '';

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Initialize clients
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

        // Route handling
        if (route === 'create-checkout' && request.method === 'POST') {
            return handleCreateCheckout(request, stripe, corsHeaders);
        }

        if (route === 'stripe-webhook' && request.method === 'POST') {
            return handleWebhook(request, env, stripe, supabase);
        }

        if (route === 'verify-subscription' && request.method === 'GET') {
            return handleVerifySubscription(request, supabase, corsHeaders);
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Worker error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
};

// Create Stripe Checkout Session
async function handleCreateCheckout(
    request: Request,
    stripe: Stripe,
    corsHeaders: Record<string, string>
) {
    const { userId, email, priceId } = await request.json() as {
        userId: string;
        email: string;
        priceId: string;
    };

    if (!userId || !email || !priceId) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const origin = request.headers.get('Origin') || 'https://potfoundry-pro.pages.dev';

    const session = await stripe.checkout.sessions.create({
        customer_email: email,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}?checkout=success`,
        cancel_url: `${origin}?checkout=cancelled`,
        metadata: { userId },
        subscription_data: {
            metadata: { userId },
        },
    });

    return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Handle Stripe Webhooks
async function handleWebhook(
    request: Request,
    env: Env,
    stripe: Stripe,
    supabase: any
) {
    const signature = request.headers.get('Stripe-Signature');
    if (!signature) {
        return new Response('Missing signature', { status: 400 });
    }

    const body = await request.text();
    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return new Response('Invalid signature', { status: 400 });
    }

    // Handle different event types
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.metadata?.userId;
            const customerId = session.customer as string;
            const subscriptionId = session.subscription as string;

            if (userId) {
                await supabase.from('profiles').update({
                    subscription_tier: 'pro',
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                }).eq('id', userId);

                console.log(`Upgraded user ${userId} to Pro`);
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            // Find user by customer ID and downgrade
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .single();

            if (profile) {
                await supabase.from('profiles').update({
                    subscription_tier: 'free',
                    stripe_subscription_id: null,
                }).eq('id', profile.id);

                console.log(`Downgraded user ${profile.id} to Free`);
            }
            break;
        }

        case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;
            const status = subscription.status;

            // Update subscription status
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .single();

            if (profile) {
                const tier = (status === 'active' || status === 'trialing') ? 'pro' : 'free';
                await supabase.from('profiles').update({
                    subscription_tier: tier,
                }).eq('id', profile.id);
            }
            break;
        }
    }

    return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

// Verify user subscription
async function handleVerifySubscription(
    request: Request,
    supabase: any,
    corsHeaders: Record<string, string>
) {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, exports_this_month')
        .eq('id', userId)
        .single();

    return new Response(JSON.stringify({
        tier: profile?.subscription_tier || 'free',
        exportsThisMonth: profile?.exports_this_month || 0,
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
