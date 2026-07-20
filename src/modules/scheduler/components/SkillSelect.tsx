import { useEffect, useState } from 'react'
import type { SchedulerSkill } from '@/shared/types/scheduler'

interface SkillSelectProps {
    value: string
    onChange: (skill: string) => void
    className?: string
}

/** Grouped dropdown of skills discovered in the user's Claude library (~/.claude/skills + plugins). */
export function SkillSelect({ value, onChange, className }: SkillSelectProps) {
    const [skills, setSkills] = useState<SchedulerSkill[]>([])

    useEffect(() => {
        void window.relayAPI.scheduler.listSkills().then(setSkills).catch(() => setSkills([]))
    }, [])

    const groups = skills.reduce<Record<string, SchedulerSkill[]>>((acc, s) => {
        (acc[s.group] ??= []).push(s)
        return acc
    }, {})
    // Preserve a saved value that no longer resolves to an installed skill.
    const orphan = value && !skills.some((s) => s.name === value)

    return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
            <option value="">(none)</option>
            {orphan && <option value={value}>{value} (custom)</option>}
            {Object.entries(groups).map(([group, items]) => (
                <optgroup key={group} label={group}>
                    {items.map((s) => (
                        <option key={s.name} value={s.name} title={s.description}>
                            {s.name}
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    )
}
