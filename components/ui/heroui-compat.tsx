'use client';

import React, {
  Children,
  createContext,
  useCallback,
  useEffect,
  isValidElement,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Card as HeroCard,
  CardContent,
  CardFooter as HeroCardFooter,
  CardHeader as HeroCardHeader,
} from '@heroui/react/card';
import { Chip as HeroChip } from '@heroui/react/chip';
import { Input as HeroInput } from '@heroui/react/input';
import { Skeleton as HeroSkeleton } from '@heroui/react/skeleton';

function cx(...values: Array<string | undefined | null | false>): string {
  return values.filter(Boolean).join(' ');
}

type LegacyStyleProps = {
  className?: string;
  classNames?: Record<string, string>;
  color?: string;
  fullWidth?: boolean;
  isBordered?: boolean;
  maxWidth?: string;
  radius?: string;
  shadow?: string;
  size?: string;
  variant?: string;
};

type BoxProps = React.HTMLAttributes<HTMLDivElement> &
  LegacyStyleProps & {
    as?: React.ElementType;
  };

function Box({
  as: Component = 'div',
  children,
  className,
  classNames: _classNames,
  color: _color,
  fullWidth: _fullWidth,
  isBordered: _isBordered,
  maxWidth: _maxWidth,
  radius: _radius,
  shadow: _shadow,
  size: _size,
  variant: _variant,
  ...domProps
}: BoxProps) {
  return (
    <Component className={className} {...domProps}>
      {children}
    </Component>
  );
}

export const HeroUIProvider = Box;

type CardProps = Omit<
  React.ComponentProps<typeof HeroCard>,
  keyof LegacyStyleProps
> &
  LegacyStyleProps;
export function Card({
  children,
  className,
  shadow: _shadow,
  radius: _radius,
  variant: _variant,
  color: _color,
  size: _size,
  classNames: _classNames,
  fullWidth: _fullWidth,
  isBordered: _isBordered,
  maxWidth: _maxWidth,
  ...props
}: CardProps) {
  return (
    <HeroCard className={className} {...props}>
      {children}
    </HeroCard>
  );
}

export const CardHeader = HeroCardHeader;
export const CardBody = CardContent;
export const CardFooter = HeroCardFooter;

export function Navbar({ className, ...props }: BoxProps) {
  return <Box as="nav" className={cx('flex w-full items-center justify-between', className)} {...props} />;
}
export function NavbarBrand({ className, ...props }: BoxProps) {
  return <Box className={cx('flex items-center', className)} {...props} />;
}
export function NavbarContent({
  justify,
  className,
  ...props
}: BoxProps & { justify?: 'start' | 'center' | 'end' }) {
  return (
    <Box
      className={cx(
        'flex items-center',
        justify === 'start' && 'justify-start',
        justify === 'center' && 'justify-center',
        justify === 'end' && 'justify-end',
        className,
      )}
      {...props}
    />
  );
}
export const NavbarItem = Box;

export function Divider({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={className} {...props} />;
}

type ChipProps = Omit<
  React.ComponentProps<typeof HeroChip>,
  keyof LegacyStyleProps
> &
  LegacyStyleProps & {
    startContent?: React.ReactNode;
    endContent?: React.ReactNode;
  };
export function Chip({
  children,
  startContent,
  endContent,
  radius: _radius,
  color: _color,
  variant: _variant,
  size: _size,
  ...props
}: ChipProps) {
  return (
    <HeroChip {...props}>
      {startContent}
      {children}
      {endContent}
    </HeroChip>
  );
}

export const Skeleton = HeroSkeleton;

export function Tooltip({
  children,
  content: _content,
  color: _color,
}: {
  children: React.ReactNode;
  content?: React.ReactNode;
  color?: string;
  placement?: string;
}) {
  return <>{children}</>;
}

type LegacyImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'className'> &
  LegacyStyleProps & {
    isZoomed?: boolean;
  };
export function Image({
  src,
  alt,
  classNames,
  className,
  radius: _radius,
  isZoomed: _isZoomed,
  ...props
}: LegacyImageProps) {
  return (
    <span className={classNames?.wrapper}>
      {/* Directory images are user supplied and may not be known to Next Image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ''}
        className={cx(classNames?.img, className)}
        {...props}
      />
    </span>
  );
}

type AvatarProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'name'> &
  LegacyStyleProps & {
    name?: string;
    icon?: React.ReactNode;
  };
export function Avatar({
  src,
  name,
  icon,
  className,
  size: _size,
  radius: _radius,
  ...props
}: AvatarProps) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name || ''} className={className} {...props} />;
  }
  return <span className={className}>{icon || name?.slice(0, 1)}</span>;
}

export function Progress({
  value = 0,
  className,
  color: _color,
  size: _size,
  ...props
}: React.ProgressHTMLAttributes<HTMLProgressElement> & LegacyStyleProps) {
  return <progress value={value} max={100} className={className} {...props} />;
}

type LegacyButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'onClick'
> &
  LegacyStyleProps & {
    as?: React.ElementType;
    disabled?: boolean;
    endContent?: React.ReactNode;
    form?: string;
    href?: string;
    isDisabled?: boolean;
    isIconOnly?: boolean;
    isLoading?: boolean;
    onClick?: React.MouseEventHandler<HTMLElement>;
    onPress?: () => void;
    rel?: string;
    startContent?: React.ReactNode;
    target?: string;
  };

export function Button({
  as: Component,
  children,
  className,
  disabled,
  endContent,
  form,
  href,
  isDisabled,
  isIconOnly,
  isLoading,
  onClick,
  onPress,
  rel,
  startContent,
  target,
  type,
  color: _color,
  radius: _radius,
  size: _size,
  variant: _variant,
  ...buttonProps
}: LegacyButtonProps) {
  const blocked = Boolean(disabled || isDisabled || isLoading);
  const content = (
    <>
      {startContent}
      {isLoading ? <span aria-hidden="true">…</span> : children}
      {endContent}
    </>
  );
  const sharedClassName = cx(
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    isIconOnly && 'min-w-[44px] px-0',
    className,
  );

  if (Component) {
    return React.createElement(
      Component,
      {
        ...buttonProps,
        'aria-busy': isLoading || undefined,
        'aria-disabled': blocked || undefined,
        className: sharedClassName,
        form,
        href,
        onClick: blocked
          ? (event: React.MouseEvent<HTMLElement>) => event.preventDefault()
          : onClick || onPress,
        rel,
        tabIndex: blocked ? -1 : buttonProps.tabIndex,
        target,
        type,
      },
      content,
    );
  }

  return (
    <button
      {...buttonProps}
      type={type}
      form={form}
      className={sharedClassName}
      disabled={blocked}
      aria-busy={isLoading || undefined}
      onClick={(event) => {
        onClick?.(event);
        onPress?.();
      }}
    >
      {content}
    </button>
  );
}

type LegacyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size' | 'onChange'
> &
  LegacyStyleProps & {
    endContent?: React.ReactNode;
    isClearable?: boolean;
    isRequired?: boolean;
    label?: React.ReactNode;
    labelPlacement?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    onValueChange?: (value: string) => void;
    startContent?: React.ReactNode;
  };

export function Input({
  label,
  onValueChange,
  onChange,
  startContent,
  endContent,
  classNames,
  isClearable,
  isRequired,
  labelPlacement: _labelPlacement,
  variant: _variant,
  size: _size,
  radius: _radius,
  color: _color,
  className,
  value,
  ...props
}: LegacyInputProps) {
  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    onChange?.(event);
    onValueChange?.(event.target.value);
  };

  return (
    <label className={cx('block', className)}>
      {label && <span className={cx('mb-1.5 block text-sm font-bold text-zinc-800 dark:text-zinc-100', classNames?.label)}>{label}</span>}
      <span
        className={cx(
          'flex min-h-[50px] items-center gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-3.5 text-zinc-950 shadow-sm transition-[background-color,border-color,box-shadow] hover:border-zinc-300 hover:bg-white focus-within:border-zinc-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus-within:border-zinc-400 dark:focus-within:ring-white/15',
          classNames?.inputWrapper,
        )}
      >
        {startContent}
        <HeroInput
          {...props}
          value={value}
          required={isRequired}
          className={cx(
            'h-full min-h-[48px] min-w-0 flex-1 border-0 !bg-transparent p-0 text-base font-medium text-inherit !shadow-none outline-none placeholder:font-normal placeholder:text-zinc-400 focus:outline-none focus:ring-0 sm:text-sm',
            classNames?.input,
          )}
          onChange={handleChange}
        />
        {isClearable && value && onValueChange ? (
          <button
            type="button"
            aria-label="مسح الحقل"
            className="flex size-11 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-200/70 focus-visible:ring-2 focus-visible:ring-zinc-950"
            onClick={() => onValueChange('')}
          >
            ×
          </button>
        ) : (
          endContent
        )}
      </span>
    </label>
  );
}

type LegacyTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange'
> &
  LegacyStyleProps & {
    isRequired?: boolean;
    label?: React.ReactNode;
    labelPlacement?: string;
    minRows?: number;
    onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
    onValueChange?: (value: string) => void;
  };

export function Textarea({
  label,
  onValueChange,
  onChange,
  classNames,
  isRequired,
  labelPlacement: _labelPlacement,
  variant: _variant,
  minRows,
  className,
  ...props
}: LegacyTextareaProps) {
  return (
    <label className={cx('block', className)}>
      {label && <span className={cx('mb-1.5 block text-sm font-bold text-zinc-800 dark:text-zinc-100', classNames?.label)}>{label}</span>}
      <textarea
        {...props}
        required={isRequired}
        rows={minRows}
        className={cx(
          'min-h-28 w-full resize-y rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5 text-base font-medium text-zinc-950 outline-none shadow-sm transition-[background-color,border-color,box-shadow] placeholder:font-normal placeholder:text-zinc-400 hover:border-zinc-300 hover:bg-white focus:border-zinc-500 focus:bg-white focus:ring-4 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400 dark:focus:ring-white/15 sm:text-sm',
          classNames?.inputWrapper,
          classNames?.input,
        )}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
      />
    </label>
  );
}

type SelectItemProps = Omit<React.OptionHTMLAttributes<HTMLOptionElement>, 'color'> & {
  description?: React.ReactNode;
  value: string | number;
};
export function SelectItem({
  children,
  description: _description,
  ...props
}: SelectItemProps) {
  return <option {...props}>{children}</option>;
}

type LegacySelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'size' | 'onChange'
> &
  LegacyStyleProps & {
    isRequired?: boolean;
    label?: React.ReactNode;
    labelPlacement?: string;
    onChange?: React.ChangeEventHandler<HTMLSelectElement>;
    onSelectionChange?: (keys: Set<string>) => void;
    selectedKeys?: Iterable<string>;
    startContent?: React.ReactNode;
  };

export function Select({
  label,
  children,
  selectedKeys,
  onSelectionChange,
  onChange,
  classNames,
  isRequired,
  labelPlacement: _labelPlacement,
  variant: _variant,
  size: _size,
  radius: _radius,
  color: _color,
  className,
  startContent,
  ...props
}: LegacySelectProps) {
  const selectedValue = selectedKeys ? Array.from(selectedKeys)[0] : undefined;
  return (
    <label className={cx('block', className)}>
      {label && <span className={cx('mb-1.5 block text-sm font-bold text-zinc-800 dark:text-zinc-100', classNames?.label)}>{label}</span>}
      <span className="relative flex items-center">
        {startContent && <span className="pointer-events-none absolute start-3 z-10">{startContent}</span>}
        <select
          {...props}
          required={isRequired}
          value={selectedValue}
          className={cx(
            'min-h-[50px] w-full appearance-none rounded-2xl border border-zinc-200 bg-zinc-50/70 px-3.5 pe-10 text-base font-medium text-zinc-950 outline-none shadow-sm transition-[background-color,border-color,box-shadow] hover:border-zinc-300 hover:bg-white focus:border-zinc-500 focus:bg-white focus:ring-4 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400 dark:focus:ring-white/15 sm:text-sm',
            Boolean(startContent) && 'ps-10',
            classNames?.trigger,
          )}
          onChange={(event) => {
            onChange?.(event);
            onSelectionChange?.(new Set([event.target.value]));
          }}
        >
          {children}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute end-3.5 text-sm font-black text-zinc-500">⌄</span>
      </span>
    </label>
  );
}

type TabProps = {
  children?: React.ReactNode;
  id?: string;
  title?: React.ReactNode;
};

function normalizeReactKey(key: React.Key | null): string {
  return String(key ?? '').replace(/^\.\$/, '');
}

export function Tab({ children }: TabProps) {
  return <>{children}</>;
}

type TabsProps = LegacyStyleProps & {
  'aria-label'?: string;
  children?: React.ReactNode;
  onSelectionChange?: (key: React.Key) => void;
  selectedKey?: React.Key;
};

export function Tabs({
  children,
  selectedKey,
  onSelectionChange,
  classNames,
  'aria-label': ariaLabel,
}: TabsProps) {
  const tabs = useMemo(
    () =>
      Children.toArray(children).filter(
        (child): child is React.ReactElement<TabProps> => isValidElement<TabProps>(child),
      ),
    [children],
  );
  const firstKey = tabs[0]?.props.id || normalizeReactKey(tabs[0]?.key);
  const [internalKey, setInternalKey] = useState<React.Key>(firstKey);
  const activeKey = selectedKey ?? internalKey;

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cx('flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1', classNames?.tabList)}
      >
        {tabs.map((tab) => {
          const tabKey = tab.props.id || normalizeReactKey(tab.key);
          const selected = String(tabKey) === String(activeKey);
          return (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cx(
                'min-h-[44px] flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-bold',
                selected ? 'bg-zinc-900 text-white' : 'text-zinc-600',
                classNames?.tab,
              )}
              style={{ color: selected ? '#ffffff' : undefined }}
              onClick={() => {
                setInternalKey(tabKey);
                onSelectionChange?.(tabKey);
              }}
            >
              {tab.props.title}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => {
        const tabKey = tab.props.id || normalizeReactKey(tab.key);
        if (String(tabKey) !== String(activeKey) || !tab.props.children) return null;
        return (
          <div key={tabKey} role="tabpanel" className="pt-4">
            {tab.props.children}
          </div>
        );
      })}
    </div>
  );
}

export function Switch({
  isSelected,
  onValueChange,
  color: _color,
  size: _size,
  radius: _radius,
  shadow: _shadow,
  variant: _variant,
  classNames: _classNames,
  fullWidth: _fullWidth,
  isBordered: _isBordered,
  maxWidth: _maxWidth,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'color'> &
  LegacyStyleProps & {
  isSelected?: boolean;
  onValueChange?: (selected: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={isSelected}
      onChange={(event) => onValueChange?.(event.target.checked)}
      {...props}
    />
  );
}

const ModalContext = createContext<{
  close: () => void;
  classNames?: Record<string, string>;
}>({ close: () => undefined });
let activeModalCount = 0;
let bodyOverflowBeforeModals = '';

type LegacyModalProps = LegacyStyleProps & {
  'aria-label'?: string;
  backdrop?: string;
  children: React.ReactNode;
  isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: string;
  scrollBehavior?: string;
};

export function Modal({
  isOpen,
  children,
  onOpenChange,
  classNames,
  'aria-label': ariaLabel = 'نافذة منبثقة',
}: LegacyModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const closeTimerRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const close = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onOpenChangeRef.current?.(false);
      setIsClosing(false);
      isClosingRef.current = false;
      closeTimerRef.current = null;
    }, 160);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    if (activeModalCount === 0) {
      bodyOverflowBeforeModals = document.body.style.overflow;
    }
    activeModalCount += 1;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (focusable || dialogRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      activeModalCount = Math.max(0, activeModalCount - 1);
      if (activeModalCount === 0) {
        document.body.style.overflow = bodyOverflowBeforeModals;
        if (restoreFocusRef.current?.isConnected) {
          restoreFocusRef.current.focus({ preventScroll: true });
        }
      }
    };
  }, [close, isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(
    <ModalContext.Provider value={{ close, classNames }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-kayan-portal="modal"
        data-modal-closing={isClosing || undefined}
        className={cx(
          'kayan-modal-wrapper fixed inset-0 z-[100] flex items-end justify-center overscroll-contain p-0 sm:items-center sm:p-6',
          classNames?.wrapper,
        )}
      >
        <button
          type="button"
          aria-label="إغلاق النافذة"
          aria-hidden="true"
          tabIndex={-1}
          disabled={isClosing}
          className="kayan-modal-backdrop absolute inset-0 cursor-default bg-zinc-950/60 backdrop-blur-md"
          onClick={close}
        />
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={cx(
            'kayan-modal-panel relative z-10 flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[30px] border border-zinc-200 bg-white shadow-[0_-24px_80px_-28px_rgba(0,0,0,.55)] sm:max-h-[92dvh] sm:rounded-[32px] sm:shadow-2xl',
            classNames?.base,
          )}
        >
          {children}
        </div>
      </div>
    </ModalContext.Provider>,
    document.body,
  );
}

type LegacyModalContentProps = {
  children: React.ReactNode | ((onClose: () => void) => React.ReactNode);
  className?: string;
};
export function ModalContent({ children, className }: LegacyModalContentProps) {
  const { close } = useContext(ModalContext);
  return (
    <div className={cx('flex min-h-0 flex-1 flex-col', className)}>
      {typeof children === 'function' ? children(close) : children}
    </div>
  );
}

export function ModalHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { classNames } = useContext(ModalContext);
  return (
    <div className={cx('shrink-0 px-4 pb-3 pt-6 sm:p-5', classNames?.header, className)} {...props}>
      {children}
    </div>
  );
}
export function ModalBody({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { classNames } = useContext(ModalContext);
  return (
    <div className={cx('min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 sm:px-5', classNames?.body, className)} {...props}>
      {children}
    </div>
  );
}
export function ModalFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { classNames } = useContext(ModalContext);
  return (
    <div className={cx('shrink-0 border-t border-zinc-100 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:p-5', classNames?.footer, className)} {...props}>
      {children}
    </div>
  );
}

export function useDisclosure() {
  const [isOpen, setOpen] = useState(false);
  return {
    isOpen,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    onOpenChange: (value?: boolean) => setOpen(Boolean(value)),
  };
}

type OverlayStateProps = {
  defaultOpen?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * State adapter for HeroUI v3 compound overlays such as Drawer.
 * Keeping it here lets legacy components and new v3 components share one import path.
 */
export function useOverlayState({
  defaultOpen = false,
  isOpen: controlledOpen,
  onOpenChange,
}: OverlayStateProps = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback((open: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(open);
    onOpenChange?.(open);
  }, [controlledOpen, onOpenChange]);
  const open = useCallback(() => setOpen(true), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpen(!isOpen), [isOpen, setOpen]);

  return useMemo(() => ({ isOpen, setOpen, open, close, toggle }), [
    close,
    isOpen,
    open,
    setOpen,
    toggle,
  ]);
}

export const Dropdown = Box;
export const DropdownTrigger = Box;
export const DropdownMenu = Box;
export const DropdownItem = Box;
