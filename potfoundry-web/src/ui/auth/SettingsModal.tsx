/**
 * Settings Modal Component
 * 
 * A professional settings modal displaying user profile information,
 * subscription status, and account management options.
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
    X,
    User,
    Mail,
    Crown,
    Calendar,
    Download,
    Shield,
    ExternalLink,
    Loader2,
    AlertCircle,
    CheckCircle
} from 'lucide-react';
import { useAuth, useIsPro } from '../../context/AuthContext';
import './SettingsModal.css';

interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Format date for display
function formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

// Get subscription status display
function getStatusDisplay(status: string, cancelAtPeriodEnd: boolean): {
    label: string;
    className: string;
    icon: React.ReactNode;
} {
    if (cancelAtPeriodEnd) {
        return {
            label: 'Cancelling',
            className: 'warning',
            icon: <AlertCircle size={14} />
        };
    }

    switch (status) {
        case 'active':
            return { label: 'Active', className: 'active', icon: <CheckCircle size={14} /> };
        case 'trialing':
            return { label: 'Trial', className: 'trial', icon: <CheckCircle size={14} /> };
        case 'past_due':
            return { label: 'Payment Issue', className: 'warning', icon: <AlertCircle size={14} /> };
        case 'canceled':
            return { label: 'Cancelled', className: 'canceled', icon: null };
        case 'paused':
            return { label: 'Paused', className: 'paused', icon: null };
        default:
            return { label: 'Free Tier', className: 'free', icon: null };
    }
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onOpenChange }) => {
    const { state, actions } = useAuth();
    const isPro = useIsPro();
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [portalError, setPortalError] = useState<string | null>(null);

    const profile = state.profile;
    const user = state.user;

    // Open Stripe Customer Portal
    const openCustomerPortal = async () => {
        if (!user?.email) return;

        setIsLoadingPortal(true);
        setPortalError(null);

        try {
            const response = await fetch('/api/create-portal-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user.email,
                    customerId: profile?.stripeCustomerId,
                }),
            });

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                setPortalError(data.error || 'Could not open subscription portal');
            }
        } catch (error) {
            console.error('Portal error:', error);
            setPortalError('Could not connect to subscription portal');
        } finally {
            setIsLoadingPortal(false);
        }
    };

    const handleSignOut = () => {
        onOpenChange(false);
        actions.signOut();
    };

    const subscriptionStatus = profile?.subscriptionStatus || 'none';
    const cancelAtPeriodEnd = profile?.cancelAtPeriodEnd || false;
    const statusDisplay = getStatusDisplay(subscriptionStatus, cancelAtPeriodEnd);

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="settings-modal__overlay" />
                <Dialog.Content className="settings-modal__content">
                    <div className="settings-modal__header">
                        <Dialog.Title className="settings-modal__title">
                            Settings
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <button className="settings-modal__close" aria-label="Close">
                                <X size={20} />
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* Profile Section */}
                    <section className="settings-modal__section">
                        <h3 className="settings-modal__section-title">
                            <User size={16} />
                            Profile
                        </h3>
                        <div className="settings-modal__field">
                            <label className="settings-modal__label">
                                <Mail size={14} />
                                Email
                            </label>
                            <span className="settings-modal__value">{user?.email || 'N/A'}</span>
                        </div>
                        <div className="settings-modal__field">
                            <label className="settings-modal__label">
                                <User size={14} />
                                Display Name
                            </label>
                            <span className="settings-modal__value">
                                {profile?.displayName || user?.email?.split('@')[0] || 'N/A'}
                            </span>
                        </div>
                        <div className="settings-modal__field">
                            <label className="settings-modal__label">
                                <Calendar size={14} />
                                Member Since
                            </label>
                            <span className="settings-modal__value">
                                {formatDate(profile?.createdAt)}
                            </span>
                        </div>
                    </section>

                    {/* Subscription Section */}
                    <section className="settings-modal__section">
                        <h3 className="settings-modal__section-title">
                            <Crown size={16} />
                            Subscription
                        </h3>
                        <div className="settings-modal__field">
                            <label className="settings-modal__label">Current Plan</label>
                            <span className={`settings-modal__tier settings-modal__tier--${isPro ? 'pro' : 'free'}`}>
                                {isPro ? (
                                    <>
                                        <Crown size={14} />
                                        Pro
                                    </>
                                ) : (
                                    'Free Tier'
                                )}
                            </span>
                        </div>

                        {isPro && (
                            <>
                                <div className="settings-modal__field">
                                    <label className="settings-modal__label">Status</label>
                                    <span className={`settings-modal__status settings-modal__status--${statusDisplay.className}`}>
                                        {statusDisplay.icon}
                                        {statusDisplay.label}
                                    </span>
                                </div>

                                {profile?.subscriptionPeriodEnd && (
                                    <div className="settings-modal__field">
                                        <label className="settings-modal__label">
                                            {cancelAtPeriodEnd ? 'Access Until' : 'Next Billing'}
                                        </label>
                                        <span className="settings-modal__value">
                                            {formatDate(profile.subscriptionPeriodEnd)}
                                        </span>
                                    </div>
                                )}

                                <button
                                    className="settings-modal__action-btn"
                                    onClick={openCustomerPortal}
                                    disabled={isLoadingPortal}
                                >
                                    {isLoadingPortal ? (
                                        <>
                                            <Loader2 size={14} className="settings-modal__spinner" />
                                            Opening Portal...
                                        </>
                                    ) : (
                                        <>
                                            <Shield size={14} />
                                            Manage Subscription
                                            <ExternalLink size={12} />
                                        </>
                                    )}
                                </button>

                                {portalError && (
                                    <p className="settings-modal__error">
                                        <AlertCircle size={14} />
                                        {portalError}
                                    </p>
                                )}
                            </>
                        )}
                    </section>

                    {/* Usage Stats Section */}
                    <section className="settings-modal__section">
                        <h3 className="settings-modal__section-title">
                            <Download size={16} />
                            Usage
                        </h3>
                        <div className="settings-modal__stats">
                            <div className="settings-modal__stat">
                                <span className="settings-modal__stat-value">
                                    {profile?.exportsThisMonth || 0}
                                </span>
                                <span className="settings-modal__stat-label">This Month</span>
                            </div>
                            <div className="settings-modal__stat">
                                <span className="settings-modal__stat-value">
                                    {profile?.totalExports || 0}
                                </span>
                                <span className="settings-modal__stat-label">Total Exports</span>
                            </div>
                        </div>
                        {!isPro && (
                            <p className="settings-modal__limit-note">
                                Free tier: {10 - (profile?.exportsThisMonth || 0)} exports remaining this month
                            </p>
                        )}
                    </section>

                    {/* Renderer Section */}
                    <section className="settings-modal__section">
                        <h3 className="settings-modal__section-title">
                            <Shield size={16} />
                            Graphics
                        </h3>
                        <div className="settings-modal__field">
                            <label className="settings-modal__label">Renderer Engine</label>
                            <select
                                className="settings-modal__select"
                                value={typeof window !== 'undefined' ? (localStorage.getItem('pf-preferred-renderer') || 'auto') : 'auto'}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === 'auto') {
                                        localStorage.removeItem('pf-preferred-renderer');
                                    } else {
                                        localStorage.setItem('pf-preferred-renderer', value);
                                    }
                                    // Reload to reinitialize with new renderer
                                    window.location.reload();
                                }}
                            >
                                <option value="auto">Auto (WebGPU → WebGL)</option>
                                <option value="webgpu">WebGPU (High Performance)</option>
                                <option value="webgl">WebGL (Compatibility)</option>
                            </select>
                        </div>
                        <p className="settings-modal__hint">
                            Use WebGL if experiencing graphics issues on mobile.
                        </p>
                    </section>

                    {/* Actions */}
                    <div className="settings-modal__footer">
                        <button
                            className="settings-modal__signout-btn"
                            onClick={handleSignOut}
                        >
                            Sign Out
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default SettingsModal;
