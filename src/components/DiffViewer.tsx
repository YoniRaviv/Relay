import { useMemo } from 'react'
import { html, parse } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'

interface DiffViewerProps {
  diffString: string
  outputFormat?: 'side-by-side' | 'line-by-line'
}

export function DiffViewer({ diffString, outputFormat = 'line-by-line' }: DiffViewerProps) {
  const diffHtml = useMemo(() => {
    if (!diffString.trim()) return '<p class="text-muted-foreground p-4">No changes detected.</p>'
    const diffJson = parse(diffString)
    return html(diffJson, {
      drawFileList: false,
      matching: 'lines',
      outputFormat,
    })
  }, [diffString, outputFormat])

  return (
    <div
      className="diff-viewer overflow-auto text-sm"
      dangerouslySetInnerHTML={{ __html: diffHtml }}
    />
  )
}
