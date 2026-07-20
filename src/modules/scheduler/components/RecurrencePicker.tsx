import { DAY_LABELS, buildRecurrence, parseRecurrence, type RecurrenceKind } from '../utils/recurrence'

interface RecurrencePickerProps {
    value: string | null
    onChange: (cron: string | null) => void
}

const KINDS: Array<{ value: '' | RecurrenceKind; label: string }> = [
    { value: '', label: 'Does not repeat' },
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
]

const fieldClass =
    'px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring'

export function RecurrencePicker({ value, onChange }: RecurrencePickerProps) {
    const r = parseRecurrence(value)
    const kind = r?.kind ?? ''
    const dow = r?.dow ?? 1
    const time = r?.time ?? '09:00'

    const emit = (k: '' | RecurrenceKind, d: number, t: string) =>
        onChange(k === '' ? null : buildRecurrence(k, d, t))

    return (
        <div className="flex items-center gap-2">
            <select
                value={kind}
                onChange={(e) => emit(e.target.value as '' | RecurrenceKind, dow, time)}
                className={`flex-1 ${fieldClass}`}
            >
                {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                ))}
            </select>
            {kind === 'weekly' && (
                <select
                    value={dow}
                    onChange={(e) => emit(kind, Number(e.target.value), time)}
                    className={fieldClass}
                >
                    {DAY_LABELS.map((label, i) => (
                        <option key={label} value={i}>{label}</option>
                    ))}
                </select>
            )}
            {(kind === 'daily' || kind === 'weekly') && (
                <input
                    type="time"
                    value={time}
                    onChange={(e) => emit(kind, dow, e.target.value)}
                    className={fieldClass}
                />
            )}
        </div>
    )
}
