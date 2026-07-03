import React from 'react';
import { AppSettingsButton } from '../../settings/AppSettingsButton';
import { UserMenu } from '../../auth/UserMenu';
import { GlassSurface } from '../primitives/GlassSurface';
import './AccountChip.css';

/** Top-right account chip — hosts gear + user menu in a GlassSurface pill. Always visible (zen-safe). */
export const AccountChip: React.FC = () => (
  <div className="pf3-account" data-testid="pf3-account-chip">
    <GlassSurface className="pf3-account__pill">
      <AppSettingsButton />
      <UserMenu />
    </GlassSurface>
  </div>
);
