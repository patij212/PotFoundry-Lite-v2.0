/**
 * Stripe Pricing Configuration
 * 
 * Defines the pricing tiers and their features for PotFoundry.
 */

// Stripe Price IDs from your Stripe Dashboard
export const STRIPE_PRICES = {
    PRO_MONTHLY: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY || 'price_1SbUl22cFuSfaBApwICMpw8g',
    PRO_YEARLY: import.meta.env.VITE_STRIPE_PRICE_PRO_YEARLY || 'price_1SbUl22cFuSfaBApOL2Z18gM',
};

export interface PricingTier {
    id: 'free' | 'pro';
    name: string;
    description: string;
    price: {
        monthly: number;
        yearly: number;
        currency: string;
        symbol: string;
    };
    features: string[];
    limitations?: string[];
    highlighted?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
    {
        id: 'free',
        name: 'Free',
        description: 'Perfect for trying out PotFoundry',
        price: {
            monthly: 0,
            yearly: 0,
            currency: 'GBP',
            symbol: '£',
        },
        features: [
            'Basic 5 styles',
            '10 exports per month',
            'Standard resolution (84×42)',
            'Community support',
        ],
        limitations: [
            '3D watermark on exports',
            'No custom presets',
            'Limited parameters',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        description: 'Unlimited creative freedom',
        price: {
            monthly: 0.99,
            yearly: 5.99,
            currency: 'GBP',
            symbol: '£',
        },
        features: [
            'All current & future styles',
            'Unlimited exports',
            'Maximum resolution',
            'No watermark',
            'Save custom presets',
            'All advanced parameters',
            'Priority support',
        ],
        highlighted: true,
    },
];

// Feature comparison for pricing table
export const FEATURE_COMPARISON = [
    { feature: 'Artistic Styles', free: '5 basic', pro: 'All (including new)' },
    { feature: 'Monthly Exports', free: '10', pro: 'Unlimited' },
    { feature: 'Resolution', free: '84×42 (~30k triangles)', pro: 'Unlimited' },
    { feature: 'Watermark', free: 'Yes (3D on pot)', pro: 'None' },
    { feature: 'Custom Presets', free: '❌', pro: '✓' },
    { feature: 'Advanced Parameters', free: '❌', pro: '✓' },
    { feature: 'Support', free: 'Community', pro: 'Priority email' },
];
