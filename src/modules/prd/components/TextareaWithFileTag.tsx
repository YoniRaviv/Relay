import { useState, useCallback, useRef } from 'react'
import { FileAutocomplete } from './FileAutocomplete'

export function TextareaWithFileTag({
    value,
    onChange,
    projectId,
    rows,
    placeholder,
    autoFocus,
}: {
    value: string
    onChange: (value: string) => void
    projectId?: string | null
    rows: number
    placeholder?: string
    autoFocus?: boolean
}) {
    const [showAutocomplete, setShowAutocomplete] = useState(false)
    const [autocompleteQuery, setAutocompleteQuery] = useState('')
    const [atStartIndex, setAtStartIndex] = useState(-1)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        onChange(newValue)

        const cursorPos = e.target.selectionStart
        const textBeforeCursor = newValue.substring(0, cursorPos)
        const atMatch = textBeforeCursor.match(/@([^\s@]*)$/)

        if (atMatch && projectId) {
            setAtStartIndex(textBeforeCursor.lastIndexOf('@'))
            setAutocompleteQuery(atMatch[1])
            setShowAutocomplete(true)
        } else {
            setShowAutocomplete(false)
        }
    }, [onChange, projectId])

    const handleSelect = useCallback((filePath: string) => {
        if (atStartIndex < 0) return
        const before = value.substring(0, atStartIndex)
        const after = value.substring(atStartIndex + 1 + autocompleteQuery.length)
        onChange(`${before}@${filePath} ${after}`)
        setShowAutocomplete(false)
        setAtStartIndex(-1)
        setTimeout(() => textareaRef.current?.focus(), 0)
    }, [value, onChange, atStartIndex, autocompleteQuery])

    return (
        <div className="relative">
            <textarea
                ref={textareaRef}
                className="w-full text-sm bg-background border border-input rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow leading-relaxed"
                value={value}
                onChange={handleChange}
                rows={rows}
                placeholder={placeholder}
                autoFocus={autoFocus}
            />
            {showAutocomplete && projectId && (
                <FileAutocomplete
                    query={autocompleteQuery}
                    projectId={projectId}
                    onSelect={handleSelect}
                    onDismiss={() => setShowAutocomplete(false)}
                />
            )}
        </div>
    )
}
