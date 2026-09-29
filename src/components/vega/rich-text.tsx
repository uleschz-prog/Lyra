import { Fragment, type ReactNode } from "react";

const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(inlinePattern).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-[#F1EEE9] px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    const href = link ? link[2] : /^https?:\/\//.test(part) ? part : null;
    if (href) {
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-[#7C3AED] underline underline-offset-2">
          {link ? link[1] : part}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

type Block = { kind: "p" | "ul" | "ol"; lines: string[] };

function blocks(text: string) {
  const result: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const kind: Block["kind"] = bullet ? "ul" : numbered ? "ol" : "p";
    const content = bullet?.[1] ?? numbered?.[1] ?? line.replace(/^#{1,6}\s+/, "");
    const last = result[result.length - 1];
    if (!content.trim()) {
      result.push({ kind: "p", lines: [] });
      continue;
    }
    if (last && last.kind === kind && (kind !== "p" || last.lines.length > 0)) last.lines.push(content);
    else result.push({ kind, lines: [content] });
  }
  return result.filter((block) => block.lines.length > 0);
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks(text).map((block, index) => {
        if (block.kind === "ul") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.lines.map((line, item) => (
                <li key={item}>{inline(line, `${index}-${item}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-5">
              {block.lines.map((line, item) => (
                <li key={item}>{inline(line, `${index}-${item}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {block.lines.map((line, item) => (
              <Fragment key={item}>
                {item > 0 ? "\n" : null}
                {inline(line, `${index}-${item}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
