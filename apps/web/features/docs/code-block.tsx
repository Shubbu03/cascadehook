import { CopyButton } from "@/components/copy-button";

export function CodeBlock({
  title,
  code,
  download,
}: {
  title: string;
  code: string;
  download?: string;
}) {
  return (
    <div className="docs-code">
      <div className="docs-code-heading">
        <span>{title}</span>
        <div className="form-actions">
          {download && (
            <a href={download} download className="text-link">
              Download
            </a>
          )}
          <CopyButton value={code} label="Copy" />
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
