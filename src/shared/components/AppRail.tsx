import { CalendarClock, LayoutDashboard } from 'lucide-react'

export type AppSection = 'scheduler' | 'orchestrator'

const ITEMS: { section: AppSection; label: string; icon: typeof CalendarClock }[] = [
    { section: 'orchestrator', label: 'Build', icon: LayoutDashboard },
    { section: 'scheduler', label: 'Schedule', icon: CalendarClock },
]

interface AppRailProps {
    section: AppSection
    onSelect: (section: AppSection) => void
}

export function AppRail({ section, onSelect }: AppRailProps) {
    return (
        <nav className="flex h-full w-16 flex-col items-center gap-1 border-r border-border/50 bg-[var(--color-sidebar)] py-3">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                R
            </div>
            {ITEMS.map(({ section: s, label, icon: Icon }) => {
                const active = section === s
                return (
                    <button
                        key={s}
                        onClick={() => onSelect(s)}
                        title={label}
                        className={`flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors ${
                            active
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        }`}
                    >
                        <Icon className="h-5 w-5" />
                        {label}
                    </button>
                )
            })}
        </nav>
    )
}
