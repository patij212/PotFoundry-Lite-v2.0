/**
 * Pricing Modal Component
 * 
 * Displays subscription options with a beautiful pricing comparison.
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check, Crown, Zap, Loader2 } from 'lucide-react';
import { PRICING_TIERS, STRIPE_PRICES } from '../../services/stripe';
import { useAuth, useIsPro } from '../../context/AuthContext';
import './PricingModal.css';

interface PricingModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type BillingPeriod = 'monthly' | 'yearly';

export const PricingModal: React.FC<PricingModalProps> = ({ open, onOpenChange }) => {
    const { state } = useAuth();
    const isPro = useIsPro();
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('yearly');
    const [loading, setLoading] = useState(false);

    const handleUpgrade = async () => {
        if (!state.user) {
            // Should show auth modal first
            return;
        }

        setLoading(true);

        try {
            // Call Cloudflare Worker to create Stripe Checkout session
            const response = await fetch('/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: state.user.id,
                    email: state.user.email,
                    priceId: billingPeriod === 'monthly'
                        ? STRIPE_PRICES.PRO_MONTHLY
                        : STRIPE_PRICES.PRO_YEARLY,
                }),
            });

            const data = await response.json();

            if (data.url) {
                // Redirect to Stripe Checkout
                window.location.href = data.url;
            } else {
                console.error('Failed to create checkout session:', data.error);
            }
        } catch (error) {
            console.error('Upgrade error:', error);
        } finally {
            setLoading(false);
        }
    };

    const yearlyDiscount = Math.round((1 - (5.99 / (0.99 * 12))) * 100);

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="pricing-modal__overlay" />
                <Dialog.Content className="pricing-modal__content">
                    <div className="pricing-modal__header">
                        <Dialog.Title className="pricing-modal__title">
                            <Crown className="pricing-modal__crown" />
                            Upgrade to Pro
                        </Dialog.Title>
                        <Dialog.Description className="pricing-modal__description">
                            Unlock unlimited creative freedom
                        </Dialog.Description>
                        <Dialog.Close asChild>
                            <button className="pricing-modal__close" aria-label="Close">
                                <X size={20} />
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* Billing Toggle */}
                    <div className="pricing-modal__billing-toggle">
                        <button
                            className={`pricing-modal__billing-btn ${billingPeriod === 'monthly' ? 'active' : ''}`}
                            onClick={() => setBillingPeriod('monthly')}
                        >
                            Monthly
                        </button>
                        <button
                            className={`pricing-modal__billing-btn ${billingPeriod === 'yearly' ? 'active' : ''}`}
                            onClick={() => setBillingPeriod('yearly')}
                        >
                            Yearly
                            <span className="pricing-modal__discount-badge">
                                Save {yearlyDiscount}%
                            </span>
                        </button>
                    </div>

                    {/* Price Display */}
                    <div className="pricing-modal__price">
                        <span className="pricing-modal__price-amount">
                            £{billingPeriod === 'monthly' ? '0.99' : '5.99'}
                        </span>
                        <span className="pricing-modal__price-period">
                            /{billingPeriod === 'monthly' ? 'month' : 'year'}
                        </span>
                    </div>

                    {billingPeriod === 'yearly' && (
                        <p className="pricing-modal__price-breakdown">
                            That's just 50p/month billed annually
                        </p>
                    )}

                    {/* Features */}
                    <ul className="pricing-modal__features">
                        {PRICING_TIERS[1].features.map((feature, i) => (
                            <li key={i} className="pricing-modal__feature">
                                <Check size={18} className="pricing-modal__feature-icon" />
                                {feature}
                            </li>
                        ))}
                    </ul>

                    {/* CTA Button */}
                    {isPro ? (
                        <div className="pricing-modal__current">
                            <Crown size={18} />
                            You're already Pro!
                        </div>
                    ) : (
                        <button
                            className="pricing-modal__cta"
                            onClick={handleUpgrade}
                            disabled={loading || !state.user}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="pricing-modal__spinner" />
                                    Processing...
                                </>
                            ) : !state.user ? (
                                'Sign in to upgrade'
                            ) : (
                                <>
                                    <Zap size={18} />
                                    Upgrade Now
                                </>
                            )}
                        </button>
                    )}

                    {/* Guarantee */}
                    <p className="pricing-modal__guarantee">
                        30-day money-back guarantee • Cancel anytime
                    </p>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default PricingModal;
