import Link from 'next/link';
import type { ComponentProps } from 'react';

type DairtakLinkProps = ComponentProps<typeof Link> & {
  variant?: 'primary' | 'secondary';
};

/** Navigation stays a single native anchor: keyboard, new-tab and RSC safe. */
export function DairtakLink({ variant = 'secondary', className = '', ...props }: DairtakLinkProps) {
  return <Link {...props} className={`${variant === 'primary' ? 'dairtak-button' : 'dairtak-button-secondary'} ${className}`} />;
}
