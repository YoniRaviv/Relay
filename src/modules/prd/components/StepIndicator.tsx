import { Check } from 'lucide-react'

interface StepIndicatorProps {
    steps: string[]
    currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
    return (
        <nav className="flex flex-col gap-0.5">
            {steps.map((label, i) => {
                const isCompleted = i < currentStep
                const isCurrent = i === currentStep
                const isPending = i > currentStep

                return (
                    <div key={label} className="flex items-stretch gap-3">
                        {/* Vertical track */}
                        <div className="flex flex-col items-center w-6">
                            {/* Node */}
                            <div
                                className={`
                                    flex items-center justify-center w-6 h-6 rounded-full shrink-0
                                    transition-all duration-200
                                    ${isCompleted
                                        ? 'bg-primary text-primary-foreground'
                                        : isCurrent
                                            ? 'border-2 border-primary text-primary bg-primary/10'
                                            : 'border border-border text-muted-foreground/70'
                                    }
                                `}
                            >
                                {isCompleted ? (
                                    <Check className="h-3 w-3" strokeWidth={3} />
                                ) : (
                                    <span className={`text-[10px] font-semibold ${isPending ? 'opacity-50' : ''}`}>
                                        {i + 1}
                                    </span>
                                )}
                            </div>
                            {/* Connector line */}
                            {i < steps.length - 1 && (
                                <div
                                    className={`
                                        w-px flex-1 min-h-4 transition-colors duration-200
                                        ${isCompleted ? 'bg-primary/40' : 'bg-border'}
                                    `}
                                />
                            )}
                        </div>
                        {/* Label */}
                        <span
                            className={`
                                text-[13px] pt-0.5 pb-4 leading-tight transition-colors
                                ${isCurrent
                                    ? 'text-foreground font-medium'
                                    : isCompleted
                                        ? 'text-muted-foreground'
                                        : 'text-muted-foreground/70'
                                }
                            `}
                        >
                            {label}
                        </span>
                    </div>
                )
            })}
        </nav>
    )
}
