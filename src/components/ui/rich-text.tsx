import React from "react";

// Renders the small Markdown subset Seiya's replies use (bold, italic, inline
// code, bullet/numbered lists, headings, paragraphs) as React elements. No HTML
// is ever injected, so model output cannot add markup or scripts.

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|`[^`\n]+`)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^(\*\*|__).+\1$/.test(part)) return <strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(part)) {
      return (
        <code key={key} className="px-1 py-0.5 rounded bg-black/5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^\*.+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(lines[i].replace(pattern, ""));
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={`b${blocks.length}`} className={`${ordered ? "list-decimal" : "list-disc"} pl-5 space-y-0.5`}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `l${blocks.length}-${j}`)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    if (HEADING.test(line)) {
      blocks.push(
        <p key={`b${blocks.length}`} className="font-semibold">
          {renderInline(line.replace(HEADING, ""), `h${blocks.length}`)}
        </p>
      );
      i++;
      continue;
    }

    // Consecutive plain lines form one paragraph with line breaks.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i]) && !HEADING.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`b${blocks.length}`}>
        {para.map((p, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {renderInline(p, `p${blocks.length}-${j}`)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return <div className={`space-y-2 ${className}`}>{blocks}</div>;
}
