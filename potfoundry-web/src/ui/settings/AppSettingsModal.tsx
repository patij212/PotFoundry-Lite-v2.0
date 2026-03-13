import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Palette, Monitor, Sun, Moon, SunMoon, Smartphone, Terminal } from 'lucide-react';
import { useAppStore, useUIActions } from '../../state';
import { useColorMode, type ColorMode } from '../v2/hooks/useColorMode';
import { useConsoleStore } from '../debug/hooks/useConsoleStore';
import './AppSettings.css';

interface AppSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RENDERER_KEY = 'pf-preferred-renderer';

const COLOR_MODE_OPTIONS: Array<{ mode: ColorMode; label: string; icon: React.ReactNode }> = [
  { mode: 'system', label: 'System', icon: <SunMoon size={14} /> },
  { mode: 'light',  label: 'Light',  icon: <Sun size={14} /> },
  { mode: 'dark',   label: 'Dark',   icon: <Moon size={14} /> },
];

export function AppSettingsModal({ open, onOpenChange }: AppSettingsModalProps) {
  const uiTheme = useAppStore((s) => s.ui.uiTheme);
  const hapticsEnabled = useAppStore((s) => s.ui.hapticsEnabled);
  const { setUITheme, setHapticsEnabled } = useUIActions();
  const { colorMode, setColorMode } = useColorMode();

  // Renderer pref is standalone localStorage — read on render, write + reload on change
  const [rendererPref, setRendererPref] = useState<string>(() => {
    try { return localStorage.getItem(RENDERER_KEY) || 'auto'; }
    catch { return 'auto'; }
  });

  const handleRendererChange = (value: string) => {
    if (value === 'auto') {
      localStorage.removeItem(RENDERER_KEY);
    } else {
      localStorage.setItem(RENDERER_KEY, value);
    }
    setRendererPref(value);
    // Defer reload so the user sees the selection change
    setTimeout(() => window.location.reload(), 300);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="app-settings-overlay" />
        <Dialog.Content
          className="app-settings-content"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="app-settings-header">
            <Dialog.Title className="app-settings-title">
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="app-settings-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* UI Theme Section */}
          <section className="app-settings-section">
            <h3 className="app-settings-section-title">
              <Palette size={15} />
              UI Theme
            </h3>
            <div className="app-settings-toggle-group" role="radiogroup" aria-label="UI Theme">
              {(['classic', 'v2'] as const).map((theme) => (
                <button
                  key={theme}
                  role="radio"
                  aria-checked={uiTheme === theme}
                  className={`app-settings-toggle ${uiTheme === theme ? 'app-settings-toggle--active' : ''}`}
                  onClick={() => setUITheme(theme)}
                >
                  {theme === 'classic' ? 'Classic' : 'v2'}
                </button>
              ))}
            </div>
          </section>

          {/* Renderer Section */}
          <section className="app-settings-section">
            <h3 className="app-settings-section-title">
              <Monitor size={15} />
              Renderer
            </h3>
            <select
              className="app-settings-select"
              value={rendererPref}
              onChange={(e) => handleRendererChange(e.target.value)}
              aria-label="Renderer preference"
            >
              <option value="auto">Auto (WebGPU → WebGL)</option>
              <option value="webgpu">WebGPU (High Performance)</option>
              <option value="webgl">WebGL (Compatibility)</option>
            </select>
            <p className="app-settings-hint">
              Page will reload when changed.
            </p>
          </section>

          {/* Color Mode Section — v2 only */}
          {uiTheme === 'v2' && (
            <section className="app-settings-section">
              <h3 className="app-settings-section-title">
                <Sun size={15} />
                Color Mode
              </h3>
              <div className="app-settings-toggle-group" role="radiogroup" aria-label="Color mode">
                {COLOR_MODE_OPTIONS.map(({ mode, label, icon }) => (
                  <button
                    key={mode}
                    role="radio"
                    aria-checked={colorMode === mode}
                    className={`app-settings-toggle ${colorMode === mode ? 'app-settings-toggle--active' : ''}`}
                    onClick={() => setColorMode(mode)}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Dev Console Section */}
          <section className="app-settings-section">
            <h3 className="app-settings-section-title">
              <Terminal size={15} />
              Dev Console
            </h3>
            <button
              className="app-settings-toggle app-settings-toggle--action"
              onClick={() => {
                useConsoleStore.getState().setVisible(true);
                onOpenChange(false);
              }}
            >
              Open Dev Console
            </button>
            <p className="app-settings-hint">
              Shows logs, errors, and GPU diagnostics. Useful for mobile debugging.
            </p>
          </section>

          {uiTheme === 'v2' && (
            <section className="app-settings-section">
              <h3 className="app-settings-section-title">
                <Smartphone size={15} />
                Haptics
              </h3>
              <div className="app-settings-toggle-group" role="radiogroup" aria-label="Haptics">
                <button
                  role="radio"
                  aria-checked={hapticsEnabled}
                  className={`app-settings-toggle ${hapticsEnabled ? 'app-settings-toggle--active' : ''}`}
                  onClick={() => setHapticsEnabled(true)}
                >
                  On
                </button>
                <button
                  role="radio"
                  aria-checked={!hapticsEnabled}
                  className={`app-settings-toggle ${!hapticsEnabled ? 'app-settings-toggle--active' : ''}`}
                  onClick={() => setHapticsEnabled(false)}
                >
                  Off
                </button>
              </div>
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
