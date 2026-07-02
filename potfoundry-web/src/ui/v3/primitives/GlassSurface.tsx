import React from 'react';
import './GlassSurface.css';

export const GlassSurface: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children, className,
}) => <div className={`pf3-glass-surface${className ? ` ${className}` : ''}`}>{children}</div>;
