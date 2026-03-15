/** Render backtick-wrapped segments as styled <code> elements */
function InlineCode({ text }: { text: string }) {
    const parts = text.split(/(`[^`]+`)/)
    return (
        <>
            {parts.map((part, i) =>
                part.startsWith('`') && part.endsWith('`') ? (
                    <code
                        key={i}
                        className="text-[12px] font-mono bg-muted/70 text-primary/90 px-1 py-0.5 rounded"
                    >
                        {part.slice(1, -1)}
                    </code>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    )
}

/** Render description text with inline `code` highlighted and sentences as visual paragraphs */
export function FormattedDescription({ text }: { text: string }) {
    // Split on explicit newlines first, then split long paragraphs into sentences
    const paragraphs = text.split(/\n{2,}/).filter(Boolean)
    const blocks = paragraphs.flatMap((para) => {
        // If the paragraph is short or already has newlines, keep as-is
        if (para.length < 120) return [para.trim()]
        // Split long paragraphs into sentences for breathing room
        const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)
        if (!sentences || sentences.length <= 2) return [para.trim()]
        // Group every 2 sentences into a block
        const groups: string[] = []
        for (let i = 0; i < sentences.length; i += 2) {
            groups.push(sentences.slice(i, i + 2).join('').trim())
        }
        return groups
    })

    return (
        <div className="space-y-2.5">
            {blocks.map((block, i) => (
                <p key={i}>
                    <InlineCode text={block} />
                </p>
            ))}
        </div>
    )
}
