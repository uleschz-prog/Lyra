import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { humanizeToolNames } from "@/lib/vega/answer-style";
import { cn } from "@/lib/utils";

/**
 * Respuesta de un agente en Markdown (GFM): encabezados, listas, negritas, tablas, citas y
 * código. Sin HTML crudo (react-markdown no lo interpreta) y los enlaces abren en otra pestaña.
 * Tipografía de chat: 16 px con interlineado 1.5.
 */
const components: Components = {
  h1: ({ children }) => <h2 className="mt-6 mb-2 text-[1.35rem] leading-snug font-semibold tracking-tight first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 text-[1.2rem] leading-snug font-semibold tracking-tight first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-1.5 text-[1.05rem] leading-snug font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1 font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-[#A8A29E] first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-[#8A8680] first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>ol]:my-1.5 [&>p]:my-1 [&>ul]:my-1.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-[#7C3AED] underline decoration-[#7C3AED]/40 underline-offset-2 hover:decoration-[#7C3AED] dark:text-[#C4B5FD] dark:decoration-[#C4B5FD]/40">
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="my-3 border-l-[3px] border-[#DDD6FE] pl-4 text-[#5C5854] dark:border-[#7C3AED]/50 dark:text-[#B9B4C6]">{children}</blockquote>,
  hr: () => <hr className="my-6 border-black/10 dark:border-white/10" />,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-2xl bg-[#F4F3F0] p-4 text-[0.875rem] leading-relaxed dark:bg-[#1F1C29] [&_code]:bg-transparent [&_code]:p-0">{children}</pre>
  ),
  code: ({ children, className }) => (
    <code className={cn("rounded-md bg-[#F1EEE9] px-1.5 py-0.5 font-mono text-[0.875em] dark:bg-white/10", className)}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto rounded-2xl ring-1 ring-black/[0.08] first:mt-0 last:mb-0 dark:ring-white/10">
      <table className="w-full border-collapse text-left text-[0.9375rem] leading-snug">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#F6F5F2] dark:bg-white/[0.04]">{children}</thead>,
  th: ({ children }) => <th className="border-b border-black/[0.08] px-3.5 py-2.5 font-semibold whitespace-nowrap dark:border-white/10">{children}</th>,
  td: ({ children }) => <td className="border-b border-black/[0.06] px-3.5 py-2.5 align-top [tr:last-child_&]:border-b-0 dark:border-white/[0.07]">{children}</td>,
};

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("vega-markdown min-w-0 text-base leading-[1.5] break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {humanizeToolNames(text)}
      </ReactMarkdown>
    </div>
  );
}
