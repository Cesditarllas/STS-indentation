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
  default: () => StsIndentationPlugin
});
module.exports = __toCommonJS(main_exports);
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");
var DEPTH_ATTRIBUTE = "data-sts-outline-depth";
var DEPTH_STYLE = "--sts-outline-depth";
var GUIDE_CLASS = "sts-indentation-guides-enabled";
var COLORED_GUIDE_CLASS = "sts-indentation-colored-guides";
var MAX_GUIDES = 6;
var DEFAULT_SETTINGS = {
  showGuides: true,
  colorGuidesByHeading: true
};
function headingLevel(text) {
  const match = text.match(/^\s{0,3}(#{1,6})(?:\s+|$)/);
  return match ? match[1].length : null;
}
function headingColor(level) {
  return `var(--h${level}-color, var(--text-muted, #6b8a9e))`;
}
function outlineAttributes(ancestors) {
  const attributes = {
    [DEPTH_ATTRIBUTE]: String(ancestors.length)
  };
  const styles = [`${DEPTH_STYLE}:${ancestors.length}`];
  for (let index = 0; index < MAX_GUIDES; index += 1) {
    const ancestor = ancestors[index];
    styles.push(
      `--sts-guide-${index + 1}:${ancestor ? headingColor(ancestor.level) : "transparent"}`
    );
  }
  attributes.style = styles.join(";");
  return attributes;
}
function buildEditorDecorations(view) {
  const builder = new import_state.RangeSetBuilder();
  const ancestors = [];
  let fenceMarker = null;
  let frontmatter = false;
  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const trimmed = line.text.trimStart();
    let level = null;
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
        level = headingLevel(line.text);
      }
    }
    if (level !== null) {
      while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= level) {
        ancestors.pop();
      }
      builder.add(
        line.from,
        line.from,
        import_view.Decoration.line({ attributes: outlineAttributes(ancestors) })
      );
      ancestors.push({ level });
    } else {
      builder.add(
        line.from,
        line.from,
        import_view.Decoration.line({ attributes: outlineAttributes(ancestors) })
      );
    }
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
var StsIndentationPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.readingObserver = null;
    this.readingFrame = null;
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.applySettingClasses();
    this.addSettingTab(new StsIndentationSettingTab(this.app, this));
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
    document.body.classList.remove(GUIDE_CLASS, COLORED_GUIDE_CLASS);
    document.querySelectorAll(`[${DEPTH_ATTRIBUTE}]`).forEach((element) => {
      this.clearOutlineAttributes(element);
    });
  }
  async updateSettings(settings) {
    this.settings = Object.assign({}, this.settings, settings);
    await this.saveData(this.settings);
    this.applySettingClasses();
  }
  applySettingClasses() {
    document.body.classList.toggle(GUIDE_CLASS, this.settings.showGuides);
    document.body.classList.toggle(
      COLORED_GUIDE_CLASS,
      this.settings.colorGuidesByHeading
    );
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
    const ancestors = [];
    const blocks = this.getReadingBlocks(container);
    blocks.forEach((element) => {
      const level = this.readingHeadingLevel(element);
      if (level !== null) {
        while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= level) {
          ancestors.pop();
        }
        this.setOutlineAttributes(element, ancestors);
        ancestors.push({ level });
      } else {
        this.setOutlineAttributes(element, ancestors);
      }
    });
  }
  getReadingBlocks(container) {
    const blocks = [];
    container.querySelectorAll(".markdown-preview-section").forEach((section) => {
      if (section.closest(".markdown-embed") !== null) {
        return;
      }
      Array.from(section.children).forEach((child) => {
        if (child instanceof HTMLElement && !child.classList.contains("mod-header")) {
          blocks.push(child);
        }
      });
    });
    if (blocks.length > 0) {
      return blocks;
    }
    return Array.from(container.children).filter(
      (child) => child instanceof HTMLElement && !child.classList.contains("mod-header")
    );
  }
  readingHeadingLevel(element) {
    const heading = element.matches("h1,h2,h3,h4,h5,h6") ? element : element.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
    const match = heading == null ? void 0 : heading.tagName.match(/^H([1-6])$/);
    return match ? Number.parseInt(match[1], 10) : null;
  }
  setOutlineAttributes(element, ancestors) {
    element.setAttribute(DEPTH_ATTRIBUTE, String(ancestors.length));
    element.style.setProperty(DEPTH_STYLE, String(ancestors.length));
    for (let index = 0; index < MAX_GUIDES; index += 1) {
      const ancestor = ancestors[index];
      element.style.setProperty(
        `--sts-guide-${index + 1}`,
        ancestor ? headingColor(ancestor.level) : "transparent"
      );
    }
  }
  clearOutlineAttributes(element) {
    element.removeAttribute(DEPTH_ATTRIBUTE);
    element.style.removeProperty(DEPTH_STYLE);
    for (let index = 1; index <= MAX_GUIDES; index += 1) {
      element.style.removeProperty(`--sts-guide-${index}`);
    }
  }
};
var StsIndentationSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u5C42\u7EA7\u7EBF").setDesc("\u5728\u6807\u9898\u7236\u5B50\u5C42\u7EA7\u4E4B\u95F4\u663E\u793A\u5782\u76F4\u5F15\u5BFC\u7EBF\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.showGuides).onChange(async (value) => {
        await this.plugin.updateSettings({ showGuides: value });
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u5C42\u7EA7\u7EBF\u989C\u8272\u8DDF\u968F\u6807\u9898").setDesc("\u6BCF\u6761\u5C42\u7EA7\u7EBF\u4F7F\u7528\u5BF9\u5E94\u7236\u6807\u9898\u7684\u4E3B\u9898\u989C\u8272\u3002\u5173\u95ED\u540E\u7EDF\u4E00\u4F7F\u7528\u4E3B\u9898\u7684\u7F29\u8FDB\u7EBF\u989C\u8272\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.colorGuidesByHeading).onChange(async (value) => {
        await this.plugin.updateSettings({ colorGuidesByHeading: value });
      });
    });
  }
};
