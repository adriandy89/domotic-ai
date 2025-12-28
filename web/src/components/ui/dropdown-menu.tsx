import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface DropdownMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

export function DropdownMenu({
  open,
  onOpenChange,
  trigger,
  children,
  align = 'right',
}: DropdownMenuProps) {
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left:
          align === 'right'
            ? rect.right + window.scrollX
            : rect.left + window.scrollX,
      });
    }
  }, [open, align]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <div ref={triggerRef} onClick={() => onOpenChange(!open)}>
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={cn(
              'fixed z-[100] bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]',
            )}
            style={{
              top: position.top,
              left: align === 'right' ? position.left - 140 : position.left,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive';
}

export function DropdownMenuItem({
  className,
  variant = 'default',
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <button
      className={cn(
        'w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2',
        variant === 'destructive' && 'text-destructive',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
