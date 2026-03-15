import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function CollapsibleSection({ title, children, defaultOpen = true }: {
    title: string
    children: React.ReactNode
    defaultOpen?: boolean
}) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div>
            <button
                type="button"
                className="flex items-center gap-1.5 mb-2 group"
                onClick={() => setOpen(!open)}
            >
                <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform duration-150 ${open ? '' : '-rotate-90'}`} />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                    {title}
                </h3>
            </button>
            {open && children}
        </div>
    )
}
