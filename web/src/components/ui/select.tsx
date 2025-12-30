import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { ChevronDown, Check } from 'lucide-react';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const Select = ({
  value = '',
  onValueChange,
  disabled,
  children,
}: SelectProps) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: onValueChange || (() => {}),
        open,
        setOpen,
        triggerRef,
      }}
    >
      <div
        className={cn('relative', disabled && 'pointer-events-none opacity-50')}
      >
        {children}
      </div>
    </SelectContext.Provider>
  );
};

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(SelectContext);

    return (
      <button
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
          if (ctx?.triggerRef) {
            (
              ctx.triggerRef as React.MutableRefObject<HTMLButtonElement | null>
            ).current = node;
          }
        }}
        type="button"
        className={cn(
          'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        onClick={() => ctx?.setOpen(!ctx.open)}
        {...props}
      >
        {children}
        <ChevronDown
          className={cn(
            'h-4 w-4 opacity-50 transition-transform',
            ctx?.open && 'rotate-180',
          )}
        />
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';

const SelectValue = ({
  placeholder,
  children,
}: {
  placeholder?: string;
  children?: React.ReactNode;
}) => {
  const ctx = React.useContext(SelectContext);
  // Show children if provided and value is set, otherwise show value or placeholder
  const displayValue = children || (ctx?.value ? ctx.value : null);
  return <span className="truncate">{displayValue || placeholder}</span>;
};

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(SelectContext);
    const [position, setPosition] = React.useState({
      top: 0,
      left: 0,
      width: 0,
    });
    const contentRef = React.useRef<HTMLDivElement>(null);

    // Calculate position when opened
    React.useLayoutEffect(() => {
      if (ctx?.open && ctx.triggerRef.current) {
        const rect = ctx.triggerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    }, [ctx?.open]);

    // Close on click outside
    React.useEffect(() => {
      if (!ctx?.open) return;

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          contentRef.current &&
          !contentRef.current.contains(target) &&
          ctx.triggerRef.current &&
          !ctx.triggerRef.current.contains(target)
        ) {
          ctx.setOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [ctx?.open]);

    if (!ctx?.open) return null;

    // Use Portal to render at document.body level
    return createPortal(
      <div
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
          (
            contentRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node;
        }}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 9999,
        }}
        className={cn(
          'max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
SelectContent.displayName = 'SelectContent';

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, value, ...props }, ref) => {
    const ctx = React.useContext(SelectContext);
    const isSelected = ctx?.value === value;

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-accent',
          className,
        )}
        onClick={() => {
          ctx?.onValueChange(value);
          ctx?.setOpen(false);
        }}
        {...props}
      >
        <span className="truncate">{children}</span>
        {isSelected && <Check className="absolute right-2 h-4 w-4" />}
      </div>
    );
  },
);
SelectItem.displayName = 'SelectItem';

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
