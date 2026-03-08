import { useEffect, type RefObject } from 'react'

export function useClickOutside(
        ref: RefObject<HTMLElement | null>,
        handler: () => void,
        enabled = true
) {
        useEffect(() => {
                if (!enabled) return
                const handleClickOutside = (e: MouseEvent) => {
                        if (ref.current && !ref.current.contains(e.target as Node)) {
                                handler()
                        }
                }
                document.addEventListener('mousedown', handleClickOutside)
                return () => document.removeEventListener('mousedown', handleClickOutside)
        }, [ref, handler, enabled])
}
