const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function ellipsize(line: string, width: number): string {
  const chars = [...graphemes.segment(line)].map((part) => part.segment);
  while (chars.length && Bun.stringWidth(chars.join("") + "…") > width)
    chars.pop();
  return chars.join("").trimEnd() + "…";
}

/** Wrap text to terminal cells and limit it to a fixed number of lines. */
export function truncateText(
  value: string,
  width: number,
  maxLines: number,
): string {
  width = Math.max(1, width);
  if (maxLines === 1) {
    const single = value.replace(/[\r\n]+/g, " ");
    return Bun.stringWidth(single) <= width ? single : ellipsize(single, width);
  }
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (Bun.stringWidth(candidate) <= width) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    for (const char of graphemes.segment(word)) {
      if (Bun.stringWidth(line + char.segment) > width && line) {
        lines.push(line);
        line = "";
      }
      line += char.segment;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines.join("\n");
  const result = lines.slice(0, maxLines);
  result[maxLines - 1] = ellipsize(result[maxLines - 1].trimEnd(), width);
  return result.join("\n");
}
