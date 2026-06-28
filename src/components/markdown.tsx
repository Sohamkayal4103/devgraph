"use client";
// markdown.tsx — Renders LLM-produced markdown (inline links, bullet lists, emphasis) as styled, clickable
// content. The research model returns markdown inside its text fields, so the report uses this to format it.
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Styled overrides for the tags the model actually emits (links, lists, emphasis, inline code).
const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="mb-2.5 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.8em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </code>
  ),
};

// Markdown: render a markdown string with styled links/lists/emphasis. Params: children = the markdown text.
// Used by the report page for every free-text section so inline links and bullets format properly.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-zinc-600 dark:text-zinc-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
