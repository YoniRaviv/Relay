const URL_PATTERN = /(https?:\/\/[^\s]+)/

export function LinkifiedText({ text }: { text: string }) {
    const parts = text.split(URL_PATTERN)
    if (parts.length === 1) return <span>{text}</span>

    return (
        <span>
            {parts.map((part, i) =>
                URL_PATTERN.test(part) ? (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-primary hover:text-primary/80"
                        onClick={(e) => {
                            e.preventDefault()
                            window.open(part, '_blank')
                        }}
                    >
                        {part}
                    </a>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    )
}
