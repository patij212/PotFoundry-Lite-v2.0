/// <reference types="@cloudflare/workers-types" />

/**
 * Create Stripe Customer Portal Session
 * 
 * Creates a portal session for the authenticated user to manage their subscription.
 * Returns the portal URL for frontend redirect.
 * 
 * POST /api/create-portal-session
 * Body: { email: string }
 * Returns: { url: string } or { error: string }
 */

interface Env {
    STRIPE_SECRET_KEY: string;
    SUPABASE_URL?: string;
    VITE_SUPABASE_URL?: string;
    SUPABASE_SERVICE_KEY: string;
}

interface RequestBody {
    email?: string;
    customerId?: string;
}

// Get Stripe customer ID from email (lookup in Supabase)
async function getCustomerIdFromEmail(
    email: string,
    supabaseUrl: string,
    serviceKey: string
): Promise<string | null> {
    try {
        const url = `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=stripe_customer_id`;

        const response = await fetch(url, {
            headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
            },
        });

        if (!response.ok) return null;

        const data: any = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            return data[0].stripe_customer_id || null;
        }
        return null;
    } catch {
        return null;
    }
}

// Create or get Stripe customer by email
async function getOrCreateStripeCustomer(
    email: string,
    stripeKey: string
): Promise<string | null> {
    try {
        // First, search for existing customer
        const searchResponse = await fetch(
            `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
            {
                headers: {
                    'Authorization': `Bearer ${stripeKey}`,
                },
            }
        );

        if (searchResponse.ok) {
            const searchData: any = await searchResponse.json();
            if (searchData.data && searchData.data.length > 0) {
                return searchData.data[0].id;
            }
        }

        // Create new customer if not found
        const createResponse = await fetch('https://api.stripe.com/v1/customers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `email=${encodeURIComponent(email)}`,
        });

        if (createResponse.ok) {
            const customer: any = await createResponse.json();
            return customer.id;
        }

        return null;
    } catch {
        return null;
    }
}

// Update Supabase profile with Stripe customer ID
async function saveCustomerIdToProfile(
    email: string,
    customerId: string,
    supabaseUrl: string,
    serviceKey: string
): Promise<void> {
    try {
        const url = `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`;

        await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ stripe_customer_id: customerId }),
        });
    } catch {
        // Non-critical, continue
    }
}

// Create Stripe Customer Portal session
async function createPortalSession(
    customerId: string,
    stripeKey: string,
    returnUrl: string
): Promise<{ url: string } | { error: string }> {
    try {
        const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `customer=${encodeURIComponent(customerId)}&return_url=${encodeURIComponent(returnUrl)}`,
        });

        const data: any = await response.json();

        if (!response.ok) {
            console.error('[Portal] Stripe error:', data);
            return { error: data.error?.message || 'Failed to create portal session' };
        }

        return { url: data.url };
    } catch (error) {
        console.error('[Portal] Error:', error);
        return { error: 'Failed to create portal session' };
    }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    console.log('[Portal] Creating portal session...');

    // Validate environment
    if (!env.STRIPE_SECRET_KEY) {
        return jsonResponse({ error: 'Stripe not configured' }, 500);
    }

    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
        return jsonResponse({ error: 'Database not configured' }, 500);
    }

    // Parse request body
    let body: RequestBody;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { email, customerId: providedCustomerId } = body;

    if (!email && !providedCustomerId) {
        return jsonResponse({ error: 'Email or customerId required' }, 400);
    }

    // Get or create Stripe customer ID
    let finalCustomerId: string | null | undefined = providedCustomerId;

    if (!finalCustomerId && email) {
        // First check our database
        finalCustomerId = await getCustomerIdFromEmail(email, supabaseUrl, env.SUPABASE_SERVICE_KEY);

        // If not in database, search/create in Stripe
        if (!finalCustomerId) {
            finalCustomerId = await getOrCreateStripeCustomer(email, env.STRIPE_SECRET_KEY);

            // Save to our database for future lookups
            if (finalCustomerId) {
                await saveCustomerIdToProfile(email, finalCustomerId, supabaseUrl, env.SUPABASE_SERVICE_KEY);
            }
        }
    }

    if (!finalCustomerId) {
        return jsonResponse({ error: 'Could not find or create customer' }, 404);
    }

    console.log('[Portal] Customer ID:', finalCustomerId);

    // Determine return URL
    const origin = request.headers.get('origin') || 'https://potfoundry-pro.pages.dev';
    const returnUrl = `${origin}/`;

    // Create portal session
    const result = await createPortalSession(finalCustomerId, env.STRIPE_SECRET_KEY, returnUrl);

    if ('error' in result) {
        return jsonResponse(result, 400);
    }

    console.log('[Portal] Session created, URL:', result.url);
    return jsonResponse(result, 200);
};

// Helper for JSON responses
function jsonResponse(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

// Handle CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
};
