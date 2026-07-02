import React, { useEffect, useState } from 'react';
import { GlassSurface } from '../primitives/GlassSurface';
import { safeStorage } from '../utils/safeStorage';
import './HintLine.css';

const KEY = 'pf3-hint-dismissed';

export const HintLine: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(() => {
    return safeStorage.get(KEY) !== '1';
  });

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      safeStorage.set(KEY, '1');
      setVisible(false);
    };
    window.addEventListener('pointerdown', dismiss, { once: true });
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [visible]);

  if (!visible) return null;
  return (
    <GlassSurface className="pf3-hint">
      <span className="pf3-hint__text">Drag to orbit · pick a starting point on the left</span>
    </GlassSurface>
  );
};
