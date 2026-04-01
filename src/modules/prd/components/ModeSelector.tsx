import { FileText, MessageSquare, ListTodo } from 'lucide-react'
import type { WizardMode } from '@shared/types'

interface ModeSelectorProps {
    onSelect: (mode: WizardMode) => void
}

const MODES: Array<{
    mode: WizardMode
    icon: typeof FileText
    title: string
    subtitle: string
    description: string
    muted?: boolean
}> = [
    {
        mode: 'specification',
        icon: FileText,
        title: 'Specification',
        subtitle: 'I know what I want — write the spec for me',
        description: 'The agent generates a detailed specification document from your description, asks clarifying questions, then decomposes it into tasks.',
    },
    {
        mode: 'brainstorm',
        icon: MessageSquare,
        title: 'Brainstorm',
        subtitle: 'I have a rough idea — help me shape it',
        description: 'Interactive conversation with the agent — explores your idea through focused questions, proposes approaches, and builds a design incrementally.',
    },
    {
        mode: 'manual',
        icon: ListTodo,
        title: 'Manual',
        subtitle: 'I already have the tasks — just let me add them',
        description: 'Skip agent generation entirely. Define your own tasks directly on the Kanban board.',
        muted: true,
    },
]

export function ModeSelector({ onSelect }: ModeSelectorProps) {
    return (
        <div className="space-y-6">
            <div className="text-center mb-2">
                <p className="text-sm text-muted-foreground">
                    How would you like to define your feature?
                </p>
            </div>
            <div className="grid gap-3">
                {MODES.map(({ mode, icon: Icon, title, subtitle, description, muted }, idx) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => onSelect(mode)}
                        className={`group relative text-left p-5 rounded-xl border cursor-pointer transition-all duration-200 stagger-enter ${
                            muted
                                ? 'border-border bg-card/70 hover:border-primary/30 hover:bg-card/80'
                                : 'border-border bg-card hover:border-primary/50 hover:bg-card/80'
                        }`}
                        style={{ animationDelay: `${idx * 60}ms` }}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                muted
                                    ? 'bg-muted/40 group-hover:bg-muted/60'
                                    : 'bg-muted/50 group-hover:bg-primary/10'
                            }`}>
                                <Icon className={`h-5 w-5 transition-colors ${
                                    muted
                                        ? 'text-muted-foreground/80 group-hover:text-muted-foreground'
                                        : 'text-muted-foreground group-hover:text-primary'
                                }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className={`text-sm font-semibold mb-0.5 ${muted ? 'text-foreground/80' : 'text-foreground'}`}>{title}</h3>
                                <p className={`text-sm mb-1 ${muted ? 'text-foreground/60' : 'text-foreground/80'}`}>{subtitle}</p>
                                <p className={`text-xs leading-relaxed ${muted ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>{description}</p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}
