import type { CSSProperties } from 'react';
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '@/lib/utils';

// react-day-picker ships --rdp-accent-color: blue; retint it to the app's teal primary
// (drives chevrons, the "today" ring, and the selected-day border).
const accentVars = {
  '--rdp-accent-color': 'var(--color-primary)',
  '--rdp-accent-background-color': 'color-mix(in srgb, var(--color-primary) 16%, transparent)',
  '--rdp-today-color': 'var(--color-primary)',
} as CSSProperties;

export function Calendar({ className, classNames, style, ...props }: DayPickerProps) {
  const d = getDefaultClassNames();
  return (
    <DayPicker
      style={{ ...accentVars, ...style }}
      className={cn('text-sm', className)}
      classNames={{
        root: cn(d.root, 'p-0'),
        months: cn(d.months, 'relative'),
        month_caption: cn(d.month_caption, 'flex items-center justify-center h-9 px-9'),
        caption_label: cn(d.caption_label, 'text-sm font-medium text-foreground'),
        nav: cn(d.nav, 'absolute inset-x-0 top-0 flex items-center justify-between'),
        button_previous: cn(d.button_previous, 'h-7 w-7 rounded-md hover:bg-accent inline-flex items-center justify-center'),
        button_next: cn(d.button_next, 'h-7 w-7 rounded-md hover:bg-accent inline-flex items-center justify-center'),
        chevron: cn(d.chevron, 'h-4 w-4 fill-muted-foreground'),
        weekday: cn(d.weekday, 'text-[11px] font-normal text-muted-foreground w-9'),
        day: cn(d.day, 'p-0'),
        day_button: cn(d.day_button, 'h-9 w-9 rounded-md text-sm hover:bg-accent transition-colors'),
        today: cn(d.today, 'font-semibold text-primary'),
        selected: cn(d.selected, '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary'),
        outside: cn(d.outside, 'text-muted-foreground/40'),
        disabled: cn(d.disabled, 'text-muted-foreground/30 pointer-events-none'),
        ...classNames,
      }}
      {...props}
    />
  );
}
