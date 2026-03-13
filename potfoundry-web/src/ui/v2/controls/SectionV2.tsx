import React from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import './SectionV2.css';

export interface SectionV2Props {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  sectionIndex?: number;
}

export const SectionV2: React.FC<SectionV2Props> = ({
  title,
  icon,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
  sectionIndex = 0,
}) => {
  return (
    <Collapsible.Root
      className={clsx('pf2-section', className)}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      style={{ '--section-index': sectionIndex } as React.CSSProperties}
    >
      <Collapsible.Trigger className="pf2-section__trigger pf2-focus-ring">
        <div className="pf2-section__header">
          {icon && <span className="pf2-section__icon">{icon}</span>}
          <h3 className="pf2-section__title pf2-text-label">{title}</h3>
        </div>
        <ChevronRight className="pf2-section__chevron" size={14} />
      </Collapsible.Trigger>

      <Collapsible.Content className="pf2-section__body" forceMount>
        <div className="pf2-section__content">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
