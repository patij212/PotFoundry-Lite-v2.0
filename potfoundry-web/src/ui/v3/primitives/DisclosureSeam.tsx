import React, { useCallback, useState } from 'react';
import { safeStorage } from '../utils/safeStorage';
import './DisclosureSeam.css';

export interface DisclosureSeamProps {
  id: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const key = (id: string) => `pf3-seam-${id}`;

export const DisclosureSeam: React.FC<DisclosureSeamProps> = ({ id, summary, children, defaultOpen }) => {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = safeStorage.get(key(id));
    return stored === null ? Boolean(defaultOpen) : stored === '1';
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      safeStorage.set(key(id), prev ? '0' : '1');
      return !prev;
    });
  }, [id]);

  return (
    <div className="pf3-seam">
      <button
        type="button"
        className="pf3-seam__bar"
        aria-expanded={open}
        onClick={toggle}
        data-pf3-focusable=""
      >
        <span className="pf3-seam__line" />
        <span className="pf3-seam__text">{open ? '⌃' : '⌄'} {summary}</span>
        <span className="pf3-seam__line" />
      </button>
      {open && <div className="pf3-seam__content">{children}</div>}
    </div>
  );
};
