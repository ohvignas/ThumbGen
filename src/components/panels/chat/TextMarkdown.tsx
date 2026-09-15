"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function TextMarkdown({ text, openAnnotate }: { text: string; openAnnotate?: (url: string) => void }) {
  return (
    <div className="text-sm break-words chat-md leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children, ...props }) => {
            const isInline = !(props as { node?: { position?: { start: { line: number }; end: { line: number } } } }).node?.position
              || (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.start.line
              === (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.end.line;
            return (
              <code className={`bg-muted border border-border/50 text-muted-foreground font-mono ${isInline ? "inline px-1.5 py-0.5 rounded text-xs" : "block px-3 py-2.5 rounded-lg text-[11px] overflow-x-auto"}`}>
                {children}
              </code>
            );
          },
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={typeof src === "string" ? src : ""}
              alt={alt ?? ""}
              onClick={() => typeof src === "string" && openAnnotate?.(src)}
              loading="lazy"
              className={`max-w-full rounded-lg my-2 border border-border/50 ${openAnnotate ? "cursor-zoom-in" : ""}`}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
