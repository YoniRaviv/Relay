interface StepIndicatorProps {
    steps: string[]
    currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
    return (
        <div className="flex items-start justify-center mb-6">
            {steps.map((label, i) => (
                <div key={label} className="flex items-start">
                    <div className="flex flex-col items-center gap-2.5 w-16 sm:w-20">
                        <div
                            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                                i < currentStep
                                    ? 'bg-primary text-primary-foreground'
                                    : i === currentStep
                                    ? 'border-2 border-primary text-primary'
                                    : 'border border-border text-muted-foreground'
                            }`}
                        >
                            {i + 1}
                        </div>
                        <span
                            className={`text-[11px] leading-tight text-center ${
                                i === currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'
                            }`}
                        >
                            {label}
                        </span>
                    </div>
                    {i < steps.length - 1 && (
                        <div className={`h-px w-6 mt-3.5 -mx-1 shrink-0 ${i < currentStep ? 'bg-primary' : 'bg-border'}`} />
                    )}
                </div>
            ))}
        </div>
    )
}
