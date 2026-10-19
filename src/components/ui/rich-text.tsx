import React from "react";

// Renders the small Markdown subset Seiya's replies use (bold, italic, inline
// code, bullet/numbered lists, headings, simple tables, paragraphs) as React
// elements. No HTML is ever injected, so model output cannot add markup or
// scripts. Markers the model leaves unbalanced are dropped instead of showing
// up as literal "**" in the chat.

const INLINE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\s][^*\n]*?\*|`[^`\n]+`)/g;

/** Rewrites model quirks into the subset below, before splitting into blocks. */
function normalizeMarkdown(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // ***bold italic*** -> **bold italic**
    .replace(/\*{3}([^*\n]+?)\*{3}/g, "**$1**")
    // Horizontal rules and table separator rows add nothing in a chat bubble.
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, "")
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*(\n|$)/gm, "");
}

/** Removes markers left over after pairing (e.g. an unclosed "**"). */
function stripStrayMarkers(text: string): string {
  return text.replace(/\*{2,}|__/g, "");
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^(\*\*|__).+\1$/.test(part)) {
      return <strong key={key} className="font-semibold">{stripStrayMarkers(part.slice(2, -2))}</strong>;
    }
    if (/^`.+`$/.test(part)) {
      return (
        <code key={key} className="px-1 py-0.5 rounded bg-black/5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^\*[^*].*\*$/.test(part)) return <em key={key}>{stripStrayMarkers(part.slice(1, -1))}</em>;
    return stripStrayMarkers(part);
  });
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const lines = normalizeMarkdown(text).split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // Markdown tables become "Label: value" lines, which read well on a phone.
    if (TABLE_ROW.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(tableCells(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      const items = body.length ? body : [head];
      blocks.push(
        <ul key={`b${blocks.length}`} className="space-y-1">
          {items.map((cells, j) => (
            <li key={j} className="rounded-lg bg-black/[0.03] px-2.5 py-1.5">
              {cells.map((cell, k) => (
                <span key={k} className="block">
                  {body.length && head[k] ? <span className="text-[#808988]">{stripStrayMarkers(head[k])}: </span> : null}
                  {renderInline(cell, `t${blocks.length}-${j}-${k}`)}
                </span>
              ))}
            </li>
          ))}
        </ul>
      );
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
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !TABLE_ROW.test(lines[i])
    ) {
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

/** Plain text without Markdown markers, for previews, toasts and speech. */
export function plainText(text: string): string {
  return normalizeMarkdown(text)
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\|(.*)\|\s*$/gm, (_, row: string) => row.split("|").map((c) => c.trim()).join(" · "))
    .replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, "$1$2")
    .replace(/\*([^*\s][^*\n]*?)\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*{2,}|__/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
