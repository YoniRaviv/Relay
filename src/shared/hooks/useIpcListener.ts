import { useEffect } from 'react'

export function useIpcListener(
        event: string,
        handler: (data: unknown) => void,
        deps: React.DependencyList = []
) {
        useEffect(() => {
                const remove = window.relayAPI.on(event, handler)
                return () => { remove() }
        }, [event, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
}
