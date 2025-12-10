/**
 * Pricing Modal Component
 * 
 * Displays subscription options with a beautiful pricing comparison.
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check, Crown, Zap, Loader2 } from 'lucide-react';
import { PRICING_TIERS } from '../../services/stripe';
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

    // Stripe Payment Link URLs for different billing periods
    const STRIPE_PAYMENT_LINKS: Record<BillingPeriod, string> = {
        yearly: 'https://buy.stripe.com/test_aFa5kD1Jzdg06Xa2wtaEE01',
        monthly: 'https://buy.stripe.com/test_00w28rdshek46Xa2wtaEE02',
    };

    const handleUpgrade = async () => {
        if (!state.user) {
            // User needs to sign in first - show alert
            alert('Please sign in first to upgrade to Pro!');
            return;
        }

        setLoading(true);

        try {
            // Get the correct payment link based on selected billing period
            const paymentLink = STRIPE_PAYMENT_LINKS[billingPeriod];

            // Add customer email to the payment link for prefilling
            const email = state.user.email || '';
            const checkoutUrl = email
                ? `${paymentLink}?prefilled_email=${encodeURIComponent(email)}`
                : paymentLink;

            // Redirect to Stripe Checkout
            window.location.href = checkoutUrl;
        } catch (error) {
            console.error('Upgrade error:', error);
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
