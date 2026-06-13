import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate
} from "@codemirror/view";
import { Plugin } from "obsidian";

const DEPTH_ATTRIBUTE = "data-kxc-outline-depth";
const DEPTH_STYLE = "--kxc-outline-depth";
const READING_BLOCK_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
  "hr",
  ".callout",
  ".math-block"
].join(",");

function headingLevel(text: string): number | null {
  const match = text.match(/^\s{0,3}(#{1,6})(?:\s+|$)/);
  return match ? match[1].length : null;
}

function buildEditorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let activeHeadingLevel = 0;
  let fenceMarker: "`" | "~" | null = null;
  let frontmatter = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const text = line.text;
    const trimmed = text.trimStart();

    if (lineNumber === 1 && trimmed === "---") {
      frontmatter = true;
    } else if (frontmatter) {
      if (trimmed === "---" || trimmed === "...") {
        frontmatter = false;
      }
    } else {
      const fence = trimmed.match(/^(`{3,}|~{3,})/);
      if (fence) {
        const marker = fence[1][0] as "`" | "~";
        fenceMarker = fenceMarker === marker ? null : fenceMarker ?? marker;
      } else if (fenceMarker === null) {
        const level = headingLevel(text);
        if (level !== null) {
          activeHeadingLevel = level;
        }
      }
    }

    const level = frontmatter || fenceMarker !== null
      ? activeHeadingLevel
      : headingLevel(text);
    const depth = level === null ? activeHeadingLevel : level - 1;

    builder.add(
      line.from,
      line.from,
      Decoration.line({
        attributes: {
          [DEPTH_ATTRIBUTE]: String(Math.max(0, depth)),
          style: `${DEPTH_STYLE}:${Math.max(0, depth)}`
        }
      })
    );
  }

  return builder.finish();
}

const headingOutlineEditorExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildEditorDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildEditorDecorations(update.view);
      }
    }
  },
  {
    decorations: value => value.decorations
  }
);

export default class KxcHeadingOutlinePlugin extends Plugin {
  private readingObserver: MutationObserver | null = null;
  private readingFrame: number | null = null;

  async onload(): Promise<void> {
    this.registerEditorExtension(headingOutlineEditorExtension);

    this.registerMarkdownPostProcessor(() => {
      this.scheduleReadingViewUpdate();
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.scheduleReadingViewUpdate();
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.scheduleReadingViewUpdate();
      })
    );

    this.readingObserver = new MutationObserver(() => {
      this.scheduleReadingViewUpdate();
    });
    this.readingObserver.observe(this.app.workspace.containerEl, {
      childList: true,
      subtree: true
    });
    this.register(() => this.readingObserver?.disconnect());

    this.scheduleReadingViewUpdate();
  }

  onunload(): void {
    if (this.readingFrame !== null) {
      window.cancelAnimationFrame(this.readingFrame);
    }

    document.querySelectorAll<HTMLElement>(`[${DEPTH_ATTRIBUTE}]`).forEach(element => {
      element.removeAttribute(DEPTH_ATTRIBUTE);
      element.style.removeProperty(DEPTH_STYLE);
    });
  }

  private scheduleReadingViewUpdate(): void {
    if (this.readingFrame !== null) {
      return;
    }

    this.readingFrame = window.requestAnimationFrame(() => {
      this.readingFrame = null;
      this.updateReadingViews();
    });
  }

  private updateReadingViews(): void {
    document
      .querySelectorAll<HTMLElement>(".markdown-preview-view .markdown-preview-sizer")
      .forEach(container => this.updateReadingContainer(container));
  }

  private updateReadingContainer(container: HTMLElement): void {
    let activeHeadingLevel = 0;
    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>(READING_BLOCK_SELECTOR)
    ).filter(element => {
      if (element.closest(".markdown-embed") !== null) {
        return false;
      }

      const parentBlock = element.parentElement?.closest(READING_BLOCK_SELECTOR);
      return parentBlock == null || !container.contains(parentBlock);
    });

    blocks.forEach(element => {
      const headingMatch = element.tagName.match(/^H([1-6])$/);
      const depth = headingMatch
        ? Number.parseInt(headingMatch[1], 10) - 1
        : activeHeadingLevel;

      if (headingMatch) {
        activeHeadingLevel = Number.parseInt(headingMatch[1], 10);
      }

      element.setAttribute(DEPTH_ATTRIBUTE, String(depth));
      element.style.setProperty(DEPTH_STYLE, String(depth));
    });
  }
}
