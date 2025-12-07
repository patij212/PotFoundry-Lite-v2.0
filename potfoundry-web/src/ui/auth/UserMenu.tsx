/**
 * User Menu Component
 * 
 * Displays user avatar and dropdown menu when logged in,
 * or a login button when logged out.
 */

import React, { useState } from 'react';
import { User, LogOut, Crown, Settings, CreditCard } from 'lucide-react';
import { useAuth, useIsAuthenticated, useIsPro } from '../../context/AuthContext';
import { AuthModal } from './AuthModal';
import { PricingModal } from '../pricing';
import './UserMenu.css';

export const UserMenu: React.FC = () => {
    const { state, actions } = useAuth();
    const isAuthenticated = useIsAuthenticated();
    const isPro = useIsPro();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showPricingModal, setShowPricingModal] = useState(false);

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

                    <div className="user-menu__divider" />

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

                    <button
                        className="user-menu__item"
                        onClick={() => {
                            setShowDropdown(false);
                            alert(
                                `Profile Settings\n\n` +
                                `Email: ${state.user?.email}\n` +
                                `Display Name: ${state.profile?.displayName || 'Not set'}\n` +
                                `Tier: ${isPro ? 'Pro' : 'Free'}\n` +
                                `Exports This Month: ${state.profile?.exportsThisMonth || 0}\n\n` +
                                `(Full settings page coming soon!)`
                            );
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
        </div>
    );
};

export default UserMenu;

