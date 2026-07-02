/**
 * PotFoundry UI v3 — "Studio at Dusk" root shell.
 * Lazy-loaded via React.lazy in App.tsx; v1/v2 users pay zero bundle cost.
 */
import React from 'react';
import './tokens.css';

export const AppUIv3: React.FC = () => {
  return (
    <div className="pf3-root pf3-layout" data-theme="dark" data-testid="pf3-root">
      {/* Stage chrome + panel land here in later tasks */}
    </div>
  );
};

export default AppUIv3;
