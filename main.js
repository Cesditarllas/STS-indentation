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
var WIDGET_ATTRIBUTE = "data-sts-outline-widget";
var EXTEND_STYLE = "--sts-outline-extend-after";
var LINE_WIDTH_STYLE = "--sts-outline-line-width";
var ENABLED_CLASS = "sts-indentation-enabled";
var GUIDE_CLASS = "sts-indentation-guides-enabled";
var COLORED_GUIDE_CLASS = "sts-indentation-colored-guides";
var FOLD_ARROW_CLASS = "sts-indentation-fold-arrows-enabled";
var MAX_GUIDES = 6;
var DEFAULT_SETTINGS = {
  enableIndentation: true,
  showGuides: true,
  colorGuidesByHeading: true,
  showFoldArrows: true,
  guideLineWidth: 1
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
    this.editorObserver = null;
    this.editorFrame = null;
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
        this.scheduleEditorWidgetUpdate();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.scheduleReadingViewUpdate();
        this.scheduleEditorWidgetUpdate();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.scheduleEditorWidgetUpdate();
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
    this.editorObserver = new MutationObserver(() => {
      this.scheduleEditorWidgetUpdate();
    });
    this.editorObserver.observe(this.app.workspace.containerEl, {
      childList: true,
      subtree: true
    });
    this.register(() => {
      var _a;
      return (_a = this.editorObserver) == null ? void 0 : _a.disconnect();
    });
    this.scheduleReadingViewUpdate();
    this.scheduleEditorWidgetUpdate();
  }
  onunload() {
    if (this.readingFrame !== null) {
      window.cancelAnimationFrame(this.readingFrame);
    }
    if (this.editorFrame !== null) {
      window.cancelAnimationFrame(this.editorFrame);
    }
    document.body.classList.remove(
      ENABLED_CLASS,
      GUIDE_CLASS,
      COLORED_GUIDE_CLASS,
      FOLD_ARROW_CLASS
    );
    document.body.style.removeProperty(LINE_WIDTH_STYLE);
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
    document.body.classList.toggle(
      ENABLED_CLASS,
      this.settings.enableIndentation
    );
    document.body.classList.toggle(
      GUIDE_CLASS,
      this.settings.enableIndentation && this.settings.showGuides
    );
    document.body.classList.toggle(
      COLORED_GUIDE_CLASS,
      this.settings.colorGuidesByHeading
    );
    document.body.classList.toggle(
      FOLD_ARROW_CLASS,
      this.settings.enableIndentation && this.settings.showFoldArrows
    );
    document.body.style.setProperty(
      LINE_WIDTH_STYLE,
      `${Math.min(2, Math.max(0.1, this.settings.guideLineWidth))}px`
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
  scheduleEditorWidgetUpdate() {
    if (this.editorFrame !== null) {
      return;
    }
    this.editorFrame = window.requestAnimationFrame(() => {
      this.editorFrame = null;
      this.updateEditorWidgets();
    });
  }
  updateEditorWidgets() {
    document.querySelectorAll(`.cm-line[${DEPTH_ATTRIBUTE}]`).forEach((line) => line.style.removeProperty(EXTEND_STYLE));
    document.querySelectorAll(".markdown-source-view.mod-cm6 .cm-content").forEach((container) => {
      container.querySelectorAll(
        ".cm-embed-block, .image-embed, .internal-embed.image-embed"
      ).forEach((widget) => {
        var _a;
        const block = (_a = widget.closest(".cm-embed-block")) != null ? _a : widget;
        if (block.matches(`.cm-line[${DEPTH_ATTRIBUTE}]`)) {
          return;
        }
        const line = this.findWidgetSourceLine(block);
        if (line === null) {
          return;
        }
        this.copyOutlineAttributes(line, block);
        block.setAttribute(WIDGET_ATTRIBUTE, "true");
        const lineRect = line.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        const extension = Math.max(0, blockRect.bottom - lineRect.bottom);
        const currentExtension = Number.parseFloat(line.style.getPropertyValue(EXTEND_STYLE)) || 0;
        line.style.setProperty(
          EXTEND_STYLE,
          `${Math.max(currentExtension, extension)}px`
        );
      });
    });
  }
  findWidgetSourceLine(widget) {
    const parentLine = widget.closest(`.cm-line[${DEPTH_ATTRIBUTE}]`);
    if (parentLine !== null) {
      return parentLine;
    }
    let sibling = widget.previousElementSibling;
    while (sibling !== null) {
      if (sibling instanceof HTMLElement && sibling.matches(`.cm-line[${DEPTH_ATTRIBUTE}]`)) {
        return sibling;
      }
      sibling = sibling.previousElementSibling;
    }
    return null;
  }
  copyOutlineAttributes(source, target) {
    const depth = source.getAttribute(DEPTH_ATTRIBUTE);
    if (depth === null) {
      return;
    }
    target.setAttribute(DEPTH_ATTRIBUTE, depth);
    target.style.setProperty(DEPTH_STYLE, depth);
    for (let index = 1; index <= MAX_GUIDES; index += 1) {
      target.style.setProperty(
        `--sts-guide-${index}`,
        source.style.getPropertyValue(`--sts-guide-${index}`) || "transparent"
      );
    }
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
    element.removeAttribute(WIDGET_ATTRIBUTE);
    element.style.removeProperty(DEPTH_STYLE);
    element.style.removeProperty(EXTEND_STYLE);
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
    new import_obsidian.Setting(containerEl).setName("\u542F\u7528\u7F29\u8FDB").setDesc("\u63A7\u5236 STS-indentation \u7684\u7F29\u8FDB\u3001\u5C42\u7EA7\u7EBF\u548C\u66FF\u4EE3\u6298\u53E0\u7BAD\u5934\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.enableIndentation).onChange(async (value) => {
        await this.plugin.updateSettings({ enableIndentation: value });
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u5C42\u7EA7\u7EBF").setDesc("\u5728\u6807\u9898\u7236\u5B50\u5C42\u7EA7\u4E4B\u95F4\u663E\u793A\u5782\u76F4\u5F15\u5BFC\u7EBF\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.showGuides).onChange(async (value) => {
        await this.plugin.updateSettings({ showGuides: value });
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u6298\u53E0\u7BAD\u5934").setDesc("\u5728\u5C42\u7EA7\u7EBF\u4E0A\u59CB\u7EC8\u663E\u793A\u6298\u53E0\u7BAD\u5934\uFF0C\u5E76\u66FF\u4EE3 Obsidian \u9ED8\u8BA4\u7684\u60AC\u505C\u7BAD\u5934\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.showFoldArrows).onChange(async (value) => {
        await this.plugin.updateSettings({ showFoldArrows: value });
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u5C42\u7EA7\u7EBF\u989C\u8272\u8DDF\u968F\u6807\u9898").setDesc("\u6BCF\u6761\u5C42\u7EA7\u7EBF\u4F7F\u7528\u5BF9\u5E94\u7236\u6807\u9898\u7684\u4E3B\u9898\u989C\u8272\u3002\u5173\u95ED\u540E\u7EDF\u4E00\u4F7F\u7528\u4E3B\u9898\u7684\u7F29\u8FDB\u7EBF\u989C\u8272\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.colorGuidesByHeading).onChange(async (value) => {
        await this.plugin.updateSettings({ colorGuidesByHeading: value });
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u5C42\u7EA7\u7EBF\u7C97\u7EC6").setDesc("\u8C03\u6574\u5C42\u7EA7\u7EBF\u5BBD\u5EA6\uFF0C\u8303\u56F4\u4E3A 0.1\u20132.0 px\u3002").addSlider((slider) => {
      slider.setLimits(0.1, 2, 0.1).setDynamicTooltip().setValue(this.plugin.settings.guideLineWidth).onChange(async (value) => {
        await this.plugin.updateSettings({ guideLineWidth: value });
      });
    });
  }
};
