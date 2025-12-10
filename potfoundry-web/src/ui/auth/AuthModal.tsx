/**
 * Authentication Modal Component
 * 
 * A beautiful, animated login/signup modal with social OAuth options.
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Mail, Lock, User, Github, Chrome, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AuthModal.css';

interface AuthModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export const AuthModal: React.FC<AuthModalProps> = ({ open, onOpenChange }) => {
    const { state, actions } = useAuth();
    const [mode, setMode] = useState<AuthMode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        if (mode === 'signup' && password !== confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }

        let result;
        if (mode === 'signin') {
            result = await actions.signInWithEmail(email, password);
        } else if (mode === 'signup') {
            result = await actions.signUpWithEmail(email, password);
        } else if (mode === 'forgot') {
            result = await actions.resetPassword(email);
        }

        // Close modal only on success (result.success is true)
        if (result?.success) {
            onOpenChange(false);
        }
    };

    const error = localError || state.error;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="auth-modal__overlay" />
                <Dialog.Content className="auth-modal__content">
                    <div className="auth-modal__header">
                        <Dialog.Title className="auth-modal__title">
                            {mode === 'signin' && 'Welcome Back'}
                            {mode === 'signup' && 'Create Account'}
                            {mode === 'forgot' && 'Reset Password'}
                        </Dialog.Title>
                        <Dialog.Description className="auth-modal__description">
                            {mode === 'signin' && 'Sign in to unlock Pro features'}
                            {mode === 'signup' && 'Join PotFoundry to save your designs'}
                            {mode === 'forgot' && "Enter your email and we'll send a reset link"}
                        </Dialog.Description>
                        <Dialog.Close asChild>
                            <button className="auth-modal__close" aria-label="Close">
                                <X size={20} />
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* Social Login */}
                    {mode !== 'forgot' && (
                        <div className="auth-modal__social">
                            <button
                                className="auth-modal__social-btn auth-modal__social-btn--google"
                                onClick={actions.signInWithGoogle}
                                disabled={state.loading}
                            >
                                <Chrome size={18} />
                                Continue with Google
                            </button>
                            <button
                                className="auth-modal__social-btn auth-modal__social-btn--github"
                                onClick={actions.signInWithGitHub}
                                disabled={state.loading}
                            >
                                <Github size={18} />
                                Continue with GitHub
                            </button>
                        </div>
                    )}

                    {mode !== 'forgot' && (
                        <div className="auth-modal__divider">
                            <span>or</span>
                        </div>
                    )}

                    {/* Email Form */}
                    <form className="auth-modal__form" onSubmit={handleSubmit}>
                        <div className="auth-modal__field">
                            <Mail size={18} className="auth-modal__field-icon" />
                            <input
                                type="email"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        {mode !== 'forgot' && (
                            <div className="auth-modal__field">
                                <Lock size={18} className="auth-modal__field-icon" />
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                />
                            </div>
                        )}

                        {mode === 'signup' && (
                            <div className="auth-modal__field">
                                <Lock size={18} className="auth-modal__field-icon" />
                                <input
                                    type="password"
                                    placeholder="Confirm password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                />
                            </div>
                        )}

                        {error && (
                            <div className="auth-modal__error">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="auth-modal__submit"
                            disabled={state.loading}
                        >
                            {state.loading ? (
                                <>
                                    <Loader2 size={18} className="auth-modal__spinner" />
                                    Loading...
                                </>
                            ) : (
                                <>
                                    {mode === 'signin' && 'Sign In'}
                                    {mode === 'signup' && 'Create Account'}
                                    {mode === 'forgot' && 'Send Reset Link'}
                                </>
                            )}
                        </button>
                    </form>

                    {/* Mode Switcher */}
                    <div className="auth-modal__footer">
                        {mode === 'signin' && (
                            <>
                                <button
                                    type="button"
                                    className="auth-modal__link"
                                    onClick={() => setMode('forgot')}
                                >
                                    Forgot password?
                                </button>
                                <span className="auth-modal__footer-text">
                                    Don't have an account?{' '}
                                    <button
                                        type="button"
                                        className="auth-modal__link"
                                        onClick={() => setMode('signup')}
                                    >
                                        Sign up
                                    </button>
                                </span>
                            </>
                        )}
                        {mode === 'signup' && (
                            <span className="auth-modal__footer-text">
                                Already have an account?{' '}
                                <button
                                    type="button"
                                    className="auth-modal__link"
                                    onClick={() => setMode('signin')}
                                >
                                    Sign in
                                </button>
                            </span>
                        )}
                        {mode === 'forgot' && (
                            <button
                                type="button"
                                className="auth-modal__link"
                                onClick={() => setMode('signin')}
                            >
                                Back to sign in
                            </button>
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default AuthModal;
