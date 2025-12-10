/**
 * User Menu Component
 * 
 * Displays user avatar and dropdown menu when logged in,
 * or a login button when logged out.
 */

import React, { useState } from 'react';
import { User, LogOut, Crown, Settings, CreditCard, ExternalLink, Calendar, AlertCircle } from 'lucide-react';
import { useAuth, useIsAuthenticated, useIsPro } from '../../context/AuthContext';
import { AuthModal } from './AuthModal';
import { SettingsModal } from './SettingsModal';
import { PricingModal } from '../pricing';
import './UserMenu.css';

// Format date for display
function formatDate(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Get subscription status display info
function getStatusInfo(status: string, cancelAtPeriodEnd: boolean): { icon: React.ReactNode; label: string; className: string } {
    if (cancelAtPeriodEnd) {
        return {
            icon: <AlertCircle size={12} />,
            label: 'Cancels at period end',
            className: 'warning',
        };
    }

    switch (status) {
        case 'active':
            return { icon: null, label: 'Active', className: 'active' };
        case 'trialing':
            return { icon: null, label: 'Trial', className: 'trial' };
        case 'past_due':
            return { icon: <AlertCircle size={12} />, label: 'Payment failed', className: 'warning' };
        case 'canceled':
            return { icon: null, label: 'Canceled', className: 'canceled' };
        case 'paused':
            return { icon: null, label: 'Paused', className: 'paused' };
        default:
            return { icon: null, label: '', className: '' };
    }
}

export const UserMenu: React.FC = () => {
    const { state, actions } = useAuth();
    const isAuthenticated = useIsAuthenticated();
    const isPro = useIsPro();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showPricingModal, setShowPricingModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);

    // Open Stripe Customer Portal
    const openCustomerPortal = async () => {
        if (!state.user?.email) return;

        setIsLoadingPortal(true);
        try {
            const response = await fetch('/api/create-portal-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: state.user.email,
                    customerId: state.profile?.stripeCustomerId,
                }),
            });

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                console.error('Portal error:', data.error);
                alert('Could not open subscription portal. Please try again.');
            }
        } catch (error) {
            console.error('Portal error:', error);
            alert('Could not open subscription portal. Please try again.');
        } finally {
            setIsLoadingPortal(false);
        }
    };

    // If Supabase is not configured, show a disabled indicator
    if (!state.isConfigured) {
        return (
            <div className="user-menu">
                <button className="user-menu__login user-menu__login--disabled" disabled>
                    <User size={18} />
                    Auth Disabled
                </button>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="user-menu">
                <button
                    className="user-menu__login"
                    onClick={() => setShowAuthModal(true)}
                >
                    <User size={18} />
                    Sign In
                </button>
                <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
            </div>
        );
    }

    const displayName = state.profile?.displayName || state.user?.email?.split('@')[0] || 'User';
    const avatarUrl = state.profile?.avatarUrl;
    const subscriptionStatus = state.profile?.subscriptionStatus || 'none';
    const cancelAtPeriodEnd = state.profile?.cancelAtPeriodEnd || false;
    const periodEnd = state.profile?.subscriptionPeriodEnd;
    const statusInfo = getStatusInfo(subscriptionStatus, cancelAtPeriodEnd);

    return (
        <div className="user-menu">
            <button
                className="user-menu__trigger"
                onClick={() => setShowDropdown(!showDropdown)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            >
                {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="user-menu__avatar" />
                ) : (
                    <div className="user-menu__avatar-fallback">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                )}
                {isPro && (
                    <span className="user-menu__pro-badge">
                        <Crown size={10} />
                    </span>
                )}
            </button>

            {showDropdown && (
                <div className="user-menu__dropdown">
                    <div className="user-menu__user-info">
                        <span className="user-menu__display-name">{displayName}</span>
                        <span className="user-menu__email">{state.user?.email}</span>
                        {isPro ? (
                            <span className="user-menu__tier user-menu__tier--pro">
                                <Crown size={12} /> Pro
                            </span>
                        ) : (
                            <span className="user-menu__tier user-menu__tier--free">
                                Free Tier
                            </span>
                        )}
                    </div>

                    {/* Subscription Status Section (for Pro users) */}
                    {isPro && (
                        <div className="user-menu__subscription">
                            {statusInfo.label && (
                                <div className={`user-menu__status user-menu__status--${statusInfo.className}`}>
                                    {statusInfo.icon}
                                    <span>{statusInfo.label}</span>
                                </div>
                            )}
                            {periodEnd && !cancelAtPeriodEnd && (
                                <div className="user-menu__period">
                                    <Calendar size={12} />
                                    <span>Renews {formatDate(periodEnd)}</span>
                                </div>
                            )}
                            {periodEnd && cancelAtPeriodEnd && (
                                <div className="user-menu__period user-menu__period--warning">
                                    <Calendar size={12} />
                                    <span>Ends {formatDate(periodEnd)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="user-menu__divider" />

                    {/* Upgrade button for free users */}
                    {!isPro && (
                        <button
                            className="user-menu__item user-menu__item--upgrade"
                            onClick={() => {
                                setShowDropdown(false);
                                setShowPricingModal(true);
                            }}
                        >
                            <CreditCard size={16} />
                            Upgrade to Pro
                        </button>
                    )}

                    {/* Manage Subscription button for Pro users */}
                    {isPro && (
                        <button
                            className="user-menu__item user-menu__item--manage"
                            onClick={() => {
                                setShowDropdown(false);
                                openCustomerPortal();
                            }}
                            disabled={isLoadingPortal}
                        >
                            <CreditCard size={16} />
                            {isLoadingPortal ? 'Loading...' : 'Manage Subscription'}
                            <ExternalLink size={12} className="user-menu__external-icon" />
                        </button>
                    )}

                    <button
                        className="user-menu__item"
                        onClick={() => {
                            setShowDropdown(false);
                            setShowSettingsModal(true);
                        }}
                    >
                        <Settings size={16} />
                        Settings
                    </button>

                    <div className="user-menu__divider" />

                    <button
                        className="user-menu__item user-menu__item--danger"
                        onClick={() => {
                            setShowDropdown(false);
                            actions.signOut();
                        }}
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>
            )}

            {/* Pricing Modal */}
            <PricingModal open={showPricingModal} onOpenChange={setShowPricingModal} />

            {/* Settings Modal */}
            <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
        </div>
    );
};

export default UserMenu;
