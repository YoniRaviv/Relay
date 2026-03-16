import { useEffect, useRef } from 'react'

export function useIpcListener(
    event: string,
    handler: (...args: unknown[]) => void,
    _deps?: React.DependencyList
) {
    // Keep handler in a ref so the IPC listener never re-registers,
    // but always calls the latest handler closure
    const handlerRef = useRef(handler)
    handlerRef.current = handler

    useEffect(() => {
        const stableHandler = (data: unknown) => handlerRef.current(data)
        const remove = window.relayAPI.on(event, stableHandler)
        return () => { remove() }
    }, [event])
}
