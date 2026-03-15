import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/electron/renderer'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
    children: ReactNode
    fallbackMessage?: string
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info.componentStack)
        Sentry.captureException(error, {
            contexts: { react: { componentStack: info.componentStack } },
        })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                    <div className="rounded-full bg-destructive/10 p-3">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <div className="text-center space-y-1">
                        <h3 className="font-semibold">Something went wrong</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            {this.props.fallbackMessage || this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Try Again
                    </Button>
                </div>
            )
        }

        return this.props.children
    }
}
