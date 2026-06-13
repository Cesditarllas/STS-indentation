var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => KxcHeadingOutlinePlugin
});
module.exports = __toCommonJS(main_exports);
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");
var DEPTH_ATTRIBUTE = "data-kxc-outline-depth";
var DEPTH_STYLE = "--kxc-outline-depth";
var READING_BLOCK_SELECTOR = [
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
function headingLevel(text) {
  const match = text.match(/^\s{0,3}(#{1,6})(?:\s+|$)/);
  return match ? match[1].length : null;
}
function buildEditorDecorations(view) {
  const builder = new import_state.RangeSetBuilder();
  let activeHeadingLevel = 0;
  let fenceMarker = null;
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
        const marker = fence[1][0];
        fenceMarker = fenceMarker === marker ? null : fenceMarker != null ? fenceMarker : marker;
      } else if (fenceMarker === null) {
        const level2 = headingLevel(text);
        if (level2 !== null) {
          activeHeadingLevel = level2;
        }
      }
    }
    const level = frontmatter || fenceMarker !== null ? activeHeadingLevel : headingLevel(text);
    const depth = level === null ? activeHeadingLevel : level - 1;
    builder.add(
      line.from,
      line.from,
      import_view.Decoration.line({
        attributes: {
          [DEPTH_ATTRIBUTE]: String(Math.max(0, depth)),
          style: `${DEPTH_STYLE}:${Math.max(0, depth)}`
        }
      })
    );
  }
  return builder.finish();
}
var headingOutlineEditorExtension = import_view.ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildEditorDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildEditorDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);
var KxcHeadingOutlinePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.readingObserver = null;
    this.readingFrame = null;
  }
  async onload() {
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
    this.register(() => {
      var _a;
      return (_a = this.readingObserver) == null ? void 0 : _a.disconnect();
    });
    this.scheduleReadingViewUpdate();
  }
  onunload() {
    if (this.readingFrame !== null) {
      window.cancelAnimationFrame(this.readingFrame);
    }
    document.querySelectorAll(`[${DEPTH_ATTRIBUTE}]`).forEach((element) => {
      element.removeAttribute(DEPTH_ATTRIBUTE);
      element.style.removeProperty(DEPTH_STYLE);
    });
  }
  scheduleReadingViewUpdate() {
    if (this.readingFrame !== null) {
      return;
    }
    this.readingFrame = window.requestAnimationFrame(() => {
      this.readingFrame = null;
      this.updateReadingViews();
    });
  }
  updateReadingViews() {
    document.querySelectorAll(".markdown-preview-view .markdown-preview-sizer").forEach((container) => this.updateReadingContainer(container));
  }
  updateReadingContainer(container) {
    let activeHeadingLevel = 0;
    const blocks = Array.from(
      container.querySelectorAll(READING_BLOCK_SELECTOR)
    ).filter((element) => {
      var _a;
      if (element.closest(".markdown-embed") !== null) {
        return false;
      }
      const parentBlock = (_a = element.parentElement) == null ? void 0 : _a.closest(READING_BLOCK_SELECTOR);
      return parentBlock == null || !container.contains(parentBlock);
    });
    blocks.forEach((element) => {
      const headingMatch = element.tagName.match(/^H([1-6])$/);
      const depth = headingMatch ? Number.parseInt(headingMatch[1], 10) - 1 : activeHeadingLevel;
      if (headingMatch) {
        activeHeadingLevel = Number.parseInt(headingMatch[1], 10);
      }
      element.setAttribute(DEPTH_ATTRIBUTE, String(depth));
      element.style.setProperty(DEPTH_STYLE, String(depth));
    });
  }
};
