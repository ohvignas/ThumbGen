"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function TextMarkdown({ text, openAnnotate }: { text: string; openAnnotate?: (url: string) => void }) {
  return (
    <div className="text-sm break-words chat-md" style={{ color: "var(--text-primary)", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              {children}
            </a>
          ),
          code: ({ children, ...props }) => {
            const isInline = !(props as { node?: { position?: { start: { line: number }; end: { line: number } } } }).node?.position
              || (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.start.line
              === (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.end.line;
            return (
              <code style={{
                background: "var(--ink-3)", padding: isInline ? "1px 5px" : "10px 12px",
                borderRadius: isInline ? 4 : 8, fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                fontSize: isInline ? 12 : 11, display: isInline ? "inline" : "block",
                border: "1px solid var(--line-faint)", color: "var(--text-secondary)", overflowX: isInline ? "visible" : "auto",
              }}>
                {children}
              </code>
            );
          },
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} onClick={() => typeof src === "string" && openAnnotate?.(src)}
              loading="lazy" style={{ maxWidth: "100%", borderRadius: 8, margin: "8px 0", cursor: openAnnotate ? "zoom-in" : undefined, border: "1px solid var(--line-faint)" }} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
