import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate
} from "@codemirror/view";
import { App, Platform, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";

const DEPTH_ATTRIBUTE = "data-sts-outline-depth";
const DEPTH_STYLE = "--sts-outline-depth";
const WIDGET_ATTRIBUTE = "data-sts-outline-widget";
const MOBILE_HEADING_ATTRIBUTE = "data-sts-mobile-heading-level";
const MOBILE_COLLAPSED_ATTRIBUTE = "data-sts-mobile-collapsed";
const EXTEND_STYLE = "--sts-outline-extend-after";
const EXTEND_BEFORE_STYLE = "--sts-outline-extend-before";
const X_OFFSET_STYLE = "--sts-outline-x-offset";
const SEPARATOR_ATTRIBUTE = "data-sts-outline-separator";
const LINE_WIDTH_STYLE = "--sts-outline-line-width";
const ENABLED_CLASS = "sts-indentation-enabled";
const GUIDE_CLASS = "sts-indentation-guides-enabled";
const COLORED_GUIDE_CLASS = "sts-indentation-colored-guides";
const FOLD_ARROW_CLASS = "sts-indentation-fold-arrows-enabled";
const MAX_GUIDES = 6;

interface StsIndentationSettings {
  enableIndentation: boolean;
  showGuides: boolean;
  colorGuidesByHeading: boolean;
  showFoldArrows: boolean;
  guideLineWidth: number;
}

const DEFAULT_SETTINGS: StsIndentationSettings = {
  enableIndentation: true,
  showGuides: true,
  colorGuidesByHeading: true,
  showFoldArrows: true,
  guideLineWidth: 1
};

function loadSettings(data: unknown): StsIndentationSettings {
  if (typeof data !== "object" || data === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const saved = data as Partial<Record<keyof StsIndentationSettings, unknown>>;
  return {
    enableIndentation:
      typeof saved.enableIndentation === "boolean"
        ? saved.enableIndentation
        : DEFAULT_SETTINGS.enableIndentation,
    showGuides:
      typeof saved.showGuides === "boolean"
        ? saved.showGuides
        : DEFAULT_SETTINGS.showGuides,
    colorGuidesByHeading:
      typeof saved.colorGuidesByHeading === "boolean"
        ? saved.colorGuidesByHeading
        : DEFAULT_SETTINGS.colorGuidesByHeading,
    showFoldArrows:
      typeof saved.showFoldArrows === "boolean"
        ? saved.showFoldArrows
        : DEFAULT_SETTINGS.showFoldArrows,
    guideLineWidth:
      typeof saved.guideLineWidth === "number"
        ? Math.min(2, Math.max(0.1, saved.guideLineWidth))
        : DEFAULT_SETTINGS.guideLineWidth
  };
}

interface HeadingAncestor {
  level: number;
}

interface RenderedSectionLike {
  el?: unknown;
}

interface MarkdownViewLike {
  modes?: {
    preview?: {
      renderer?: {
        sections?: RenderedSectionLike[];
      };
    };
  };
}

function isHtmlElement(value: unknown): value is HTMLElement {
  const maybeElement = value as { instanceOf?: unknown } | null;

  return value instanceof HTMLElement ||
    (
      typeof value === "object" &&
      value !== null &&
      "instanceOf" in value &&
      typeof maybeElement?.instanceOf === "function" &&
      maybeElement.instanceOf(HTMLElement)
    );
}

function headingLevel(text: string): number | null {
  const match = text.match(/^\s{0,3}(#{1,6})(?:\s+|$)/);
  return match ? match[1].length : null;
}

function headingColor(level: number): string {
  return `var(--h${level}-color, var(--text-muted, #6b8a9e))`;
}

function outlineAttributes(ancestors: HeadingAncestor[]): Record<string, string> {
  const attributes: Record<string, string> = {
    [DEPTH_ATTRIBUTE]: String(ancestors.length)
  };
  const styles = [`${DEPTH_STYLE}:${ancestors.length}`];

  for (let index = 0; index < MAX_GUIDES; index += 1) {
    const ancestor = ancestors[index];
    styles.push(
      `--sts-heading-guide-${index + 1}:${ancestor ? headingColor(ancestor.level) : "transparent"}`
    );
  }

  attributes.style = styles.join(";");
  return attributes;
}

function buildEditorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ancestors: HeadingAncestor[] = [];
  let fenceMarker: "`" | "~" | null = null;
  let frontmatter = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const trimmed = line.text.trimStart();
    let level: number | null = null;

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
        level = headingLevel(line.text);
      }
    }

    if (level !== null) {
      while (
        ancestors.length > 0 &&
        ancestors[ancestors.length - 1].level >= level
      ) {
        ancestors.pop();
      }

      builder.add(
        line.from,
        line.from,
        Decoration.line({ attributes: outlineAttributes(ancestors) })
      );
      ancestors.push({ level });
    } else {
      builder.add(
        line.from,
        line.from,
        Decoration.line({ attributes: outlineAttributes(ancestors) })
      );
    }
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

export default class StsIndentationPlugin extends Plugin {
  settings: StsIndentationSettings = DEFAULT_SETTINGS;
  private readingObserver: MutationObserver | null = null;
  private readingFrame: number | null = null;
  private editorObserver: MutationObserver | null = null;
  private editorFrame: number | null = null;
  private documents = new Set<Document>();

  private getDocuments(): Document[] {
    this.documents.add(document);
    this.documents.add(activeDocument);
    this.app.workspace.iterateAllLeaves(leaf => {
      this.documents.add(leaf.view.containerEl.ownerDocument);
    });
    return [...this.documents].filter(doc => !doc.defaultView?.closed);
  }

  private observeDocuments(): void {
    this.getDocuments().forEach(doc => {
      this.readingObserver?.observe(doc.body, { childList: true, subtree: true });
      this.editorObserver?.observe(doc.body, { childList: true, subtree: true });
    });
  }

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData() as unknown);
    this.applySettingClasses();
    this.addSettingTab(new StsIndentationSettingTab(this.app, this));
    this.registerEditorExtension(headingOutlineEditorExtension);
    this.registerEvent(this.app.workspace.on("window-open", (_win, win) => {
      this.documents.add(win.document);
      this.applySettingClasses();
      this.scheduleReadingViewUpdate();
      this.scheduleEditorWidgetUpdate();
    }));

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
    this.register(() => this.readingObserver?.disconnect());

    this.editorObserver = new MutationObserver(() => {
      this.scheduleEditorWidgetUpdate();
    });
    this.editorObserver.observe(this.app.workspace.containerEl, {
      childList: true,
      subtree: true
    });
    this.register(() => this.editorObserver?.disconnect());
    this.observeDocuments();

    this.scheduleReadingViewUpdate();
    this.scheduleEditorWidgetUpdate();
  }

  onunload(): void {
    if (this.readingFrame !== null) {
      window.cancelAnimationFrame(this.readingFrame);
    }
    if (this.editorFrame !== null) {
      window.cancelAnimationFrame(this.editorFrame);
    }

    this.getDocuments().forEach(doc => {
      doc.body.classList.remove(
        ENABLED_CLASS,
        GUIDE_CLASS,
        COLORED_GUIDE_CLASS,
        FOLD_ARROW_CLASS
      );
      doc.body.style.removeProperty(LINE_WIDTH_STYLE);
      doc.querySelectorAll<HTMLElement>(`[${DEPTH_ATTRIBUTE}]`).forEach(element => {
        this.clearOutlineAttributes(element);
      });
    });
    this.documents.clear();
  }

  async updateSettings(settings: Partial<StsIndentationSettings>): Promise<void> {
    this.settings = Object.assign({}, this.settings, settings);
    this.applySettingClasses();
    this.scheduleReadingViewUpdate();
    this.scheduleEditorWidgetUpdate();
    await this.saveData(this.settings);
  }

  private applySettingClasses(): void {
    this.observeDocuments();
    this.getDocuments().forEach(doc => {
      doc.body.classList.toggle(
        ENABLED_CLASS,
        this.settings.enableIndentation
      );
      doc.body.classList.toggle(
        GUIDE_CLASS,
        this.settings.enableIndentation && this.settings.showGuides
      );
      doc.body.classList.toggle(
        COLORED_GUIDE_CLASS,
        this.settings.colorGuidesByHeading
      );
      doc.body.classList.toggle(
        FOLD_ARROW_CLASS,
        this.settings.enableIndentation && this.settings.showFoldArrows
      );
      doc.body.style.setProperty(
        LINE_WIDTH_STYLE,
        `${Math.min(2, Math.max(0.1, this.settings.guideLineWidth))}px`
      );
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

  private scheduleEditorWidgetUpdate(): void {
    if (this.editorFrame !== null) {
      return;
    }

    this.editorFrame = window.requestAnimationFrame(() => {
      this.editorFrame = null;
      this.updateEditorWidgets();
    });
  }

  private updateEditorWidgets(): void {
    this.getDocuments().forEach(doc => {
      doc
        .querySelectorAll<HTMLElement>(`.cm-line[${DEPTH_ATTRIBUTE}]`)
        .forEach(line => line.style.removeProperty(EXTEND_STYLE));

      doc
        .querySelectorAll<HTMLElement>(".markdown-source-view.mod-cm6 .cm-content")
        .forEach(container => {
          container
            .querySelectorAll<HTMLElement>(
              ".cm-embed-block, .image-embed, .internal-embed.image-embed"
            )
            .forEach(widget => {
              const block = widget.closest<HTMLElement>(".cm-embed-block") ?? widget;
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
              const currentExtension =
                Number.parseFloat(line.style.getPropertyValue(EXTEND_STYLE)) || 0;
              line.style.setProperty(
                EXTEND_STYLE,
                `${Math.max(currentExtension, extension)}px`
              );
            });
        });
    });
  }

  private findWidgetSourceLine(widget: HTMLElement): HTMLElement | null {
    const parentLine = widget.closest<HTMLElement>(`.cm-line[${DEPTH_ATTRIBUTE}]`);
    if (parentLine !== null) {
      return parentLine;
    }

    let sibling = widget.previousElementSibling;
    while (sibling !== null) {
      if (
        sibling.instanceOf(HTMLElement) &&
        sibling.matches(`.cm-line[${DEPTH_ATTRIBUTE}]`)
      ) {
        return sibling;
      }
      sibling = sibling.previousElementSibling;
    }

    return null;
  }

  private copyOutlineAttributes(
    source: HTMLElement,
    target: HTMLElement
  ): void {
    const depth = source.getAttribute(DEPTH_ATTRIBUTE);
    if (depth === null) {
      return;
    }

    target.setAttribute(DEPTH_ATTRIBUTE, depth);
    target.style.setProperty(DEPTH_STYLE, depth);
    for (let index = 1; index <= MAX_GUIDES; index += 1) {
      target.style.setProperty(
        `--sts-heading-guide-${index}`,
        source.style.getPropertyValue(`--sts-heading-guide-${index}`) || "transparent"
      );
    }
  }

  private updateReadingViews(): void {
    this.applySettingClasses();
    this.updateReadingRendererSections();

    this.getDocuments().forEach(doc => doc
      .querySelectorAll<HTMLElement>(".markdown-preview-view .markdown-preview-sizer")
      .forEach(container => this.updateReadingContainer(container)));
  }

  private updateReadingRendererSections(): void {
    this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
      const renderer = (leaf.view as MarkdownViewLike).modes?.preview?.renderer;
      const sectionElements = renderer?.sections
        ?.map(section => section.el)
        .filter(isHtmlElement) ?? [];

      if (sectionElements.length > 0) {
        this.updateReadingBlocks(this.getReadingBlocksFromSections(sectionElements));
      }
    });
  }

  private updateReadingContainer(container: HTMLElement): void {
    this.updateReadingBlocks(this.getReadingBlocks(container), container);
  }

  private updateReadingBlocks(
    blocks: HTMLElement[],
    container: HTMLElement | null = null
  ): void {
    const ancestors: HeadingAncestor[] = [];
    const baseLeft = this.readingGuideBaseLeft(blocks, container);
    blocks.forEach((element, index) => {
      const level = this.readingHeadingLevel(element);

      if (level !== null) {
        while (
          ancestors.length > 0 &&
          ancestors[ancestors.length - 1].level >= level
        ) {
          ancestors.pop();
        }

        this.setOutlineAttributes(element, ancestors);
        ancestors.push({ level });
      } else {
        this.setOutlineAttributes(element, ancestors);
      }

      this.setReadingGuideOffset(element, baseLeft);
      element.toggleAttribute(SEPARATOR_ATTRIBUTE, this.isReadingSeparator(element));
      this.bridgeReadingBlockGap(blocks, index);
      if (container !== null) {
        this.updateMobileFoldArrow(container, element, level);
      }
    });

    if (container !== null) {
      this.applyMobileCollapsedSections(blocks);
    }
  }

  private bridgeReadingBlockGap(
    blocks: HTMLElement[],
    index: number
  ): void {
    const element = blocks[index];
    element.style.removeProperty(EXTEND_BEFORE_STYLE);
    element.style.removeProperty(EXTEND_STYLE);

    const previous = this.previousReadingGuideBlock(blocks, index);
    if (previous !== null) {
      const gapBefore = Math.max(
        0,
        element.getBoundingClientRect().top - previous.getBoundingClientRect().bottom
      );
      if (gapBefore > 0) {
        element.style.setProperty(EXTEND_BEFORE_STYLE, `${gapBefore}px`);
      }
    }

  }

  private previousReadingGuideBlock(
    blocks: HTMLElement[],
    index: number
  ): HTMLElement | null {
    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = blocks[previousIndex];
      if (!this.isReadingSeparator(previous)) {
        return previous;
      }
    }

    return null;
  }

  private isReadingSeparator(element: HTMLElement): boolean {
    return element.matches("hr, .el-hr") || element.querySelector(":scope > hr") !== null;
  }

  private readingGuideBaseLeft(
    blocks: HTMLElement[],
    container: HTMLElement | null
  ): number | null {
    const firstConnectedBlock = blocks.find(block => block.isConnected);
    // Use the content edge; themes may pad the preview sizer itself.
    if (firstConnectedBlock !== undefined) {
      return firstConnectedBlock.getBoundingClientRect().left;
    }

    return container?.getBoundingClientRect().left ?? null;
  }

  private setReadingGuideOffset(
    element: HTMLElement,
    baseLeft: number | null
  ): void {
    if (baseLeft === null || !element.isConnected) {
      element.style.removeProperty(X_OFFSET_STYLE);
      return;
    }

    const offset = element.getBoundingClientRect().left - baseLeft;
    element.style.setProperty(X_OFFSET_STYLE, `${offset}px`);
  }

  private updateMobileFoldArrow(
    container: HTMLElement,
    element: HTMLElement,
    level: number | null
  ): void {
    if (!Platform.isMobile || level === null) {
      return;
    }

    element.setAttribute(MOBILE_HEADING_ATTRIBUTE, String(level));
    if (element.querySelector(".heading-collapse-indicator") !== null) {
      return;
    }

    let arrow = element.querySelector<HTMLButtonElement>(
      ":scope > .sts-mobile-fold-indicator"
    );
    if (arrow !== null) {
      return;
    }

    arrow = element.ownerDocument.createElement("button");
    arrow.type = "button";
    arrow.className = "sts-mobile-fold-indicator";
    arrow.setAttribute("aria-label", "折叠标题");
    setIcon(arrow, "chevron-down");
    arrow.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const collapsed =
        element.getAttribute(MOBILE_COLLAPSED_ATTRIBUTE) === "true";
      element.setAttribute(MOBILE_COLLAPSED_ATTRIBUTE, String(!collapsed));
      arrow?.setAttribute(
        "aria-label",
        collapsed ? "折叠标题" : "展开标题"
      );
      this.applyMobileCollapsedSections(this.getReadingBlocks(container));
    });
    element.prepend(arrow);
  }

  private applyMobileCollapsedSections(blocks: HTMLElement[]): void {
    if (!Platform.isMobile) {
      return;
    }

    if (!this.settings.enableIndentation || !this.settings.showFoldArrows) {
      blocks.forEach(element => {
        element.classList.remove("sts-mobile-section-hidden");
      });
      return;
    }

    const collapsedLevels: number[] = [];
    blocks.forEach(element => {
      const levelValue = element.getAttribute(MOBILE_HEADING_ATTRIBUTE);
      const level = levelValue === null
        ? null
        : Number.parseInt(levelValue, 10);

      if (level !== null) {
        while (
          collapsedLevels.length > 0 &&
          collapsedLevels[collapsedLevels.length - 1] >= level
        ) {
          collapsedLevels.pop();
        }
      }

      element.classList.toggle(
        "sts-mobile-section-hidden",
        collapsedLevels.length > 0
      );

      if (
        level !== null &&
        element.getAttribute(MOBILE_COLLAPSED_ATTRIBUTE) === "true"
      ) {
        collapsedLevels.push(level);
      }
    });
  }

  private getReadingBlocks(container: HTMLElement): HTMLElement[] {
    const sections = Array.from(
      container.querySelectorAll<HTMLElement>(".markdown-preview-section")
    );

    if (sections.length > 0) {
      return this.getReadingBlocksFromSections(sections);
    }

    return Array.from(container.children).filter(
      (child): child is HTMLElement => this.isReadingBlock(child)
    );
  }

  private getReadingBlocksFromSections(sections: HTMLElement[]): HTMLElement[] {
    const blocks: HTMLElement[] = [];

    sections.forEach(section => {
      if (section.closest(".markdown-embed") !== null) {
        return;
      }

      const roots = section.classList.contains("markdown-preview-section")
        ? [section]
        : Array.from(section.querySelectorAll<HTMLElement>(".markdown-preview-section"));

      if (roots.length === 0) {
        if (this.isReadingBlock(section)) {
          blocks.push(section);
        }
        return;
      }

      roots.forEach(root => {
        Array.from(root.children).forEach(child => {
          if (this.isReadingBlock(child)) {
            blocks.push(child);
          }
        });
      });
    });

    return blocks;
  }

  private isReadingBlock(element: Element): element is HTMLElement {
    return isHtmlElement(element) && !element.classList.contains("mod-header");
  }

  private readingHeadingLevel(element: HTMLElement): number | null {
    const heading = element.matches("h1,h2,h3,h4,h5,h6")
      ? element
      : element.querySelector<HTMLElement>(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
    const match = heading?.tagName.match(/^H([1-6])$/);
    return match ? Number.parseInt(match[1], 10) : null;
  }

  private setOutlineAttributes(
    element: HTMLElement,
    ancestors: HeadingAncestor[]
  ): void {
    element.setAttribute(DEPTH_ATTRIBUTE, String(ancestors.length));
    element.style.setProperty(DEPTH_STYLE, String(ancestors.length));

    for (let index = 0; index < MAX_GUIDES; index += 1) {
      const ancestor = ancestors[index];
      element.style.setProperty(
        `--sts-heading-guide-${index + 1}`,
        ancestor ? headingColor(ancestor.level) : "transparent"
      );
    }
  }

  private clearOutlineAttributes(element: HTMLElement): void {
    element.removeAttribute(DEPTH_ATTRIBUTE);
    element.removeAttribute(WIDGET_ATTRIBUTE);
    element.removeAttribute(SEPARATOR_ATTRIBUTE);
    element.removeAttribute(MOBILE_HEADING_ATTRIBUTE);
    element.removeAttribute(MOBILE_COLLAPSED_ATTRIBUTE);
    element.style.removeProperty(DEPTH_STYLE);
    element.style.removeProperty(EXTEND_STYLE);
    element.style.removeProperty(EXTEND_BEFORE_STYLE);
    element.style.removeProperty(X_OFFSET_STYLE);
    for (let index = 1; index <= MAX_GUIDES; index += 1) {
      element.style.removeProperty(`--sts-heading-guide-${index}`);
    }
  }
}

class StsIndentationSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: StsIndentationPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("启用缩进")
      .setDesc("控制 STS-indentation 的缩进、层级线和替代折叠箭头。")
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.enableIndentation)
          .onChange(async value => {
            await this.plugin.updateSettings({ enableIndentation: value });
          });
      });

    new Setting(containerEl)
      .setName("显示层级线")
      .setDesc("在标题父子层级之间显示垂直引导线。")
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.showGuides)
          .onChange(async value => {
            await this.plugin.updateSettings({ showGuides: value });
          });
      });

    new Setting(containerEl)
      .setName("显示折叠箭头")
      .setDesc("在标题左侧始终显示折叠箭头，与层级线留出间距。")
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.showFoldArrows)
          .onChange(async value => {
            await this.plugin.updateSettings({ showFoldArrows: value });
          });
      });

    new Setting(containerEl)
      .setName("层级线颜色跟随标题")
      .setDesc("每条层级线使用对应父标题的主题颜色。关闭后统一使用主题的缩进线颜色。")
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.colorGuidesByHeading)
          .onChange(async value => {
            await this.plugin.updateSettings({ colorGuidesByHeading: value });
          });
      });

    new Setting(containerEl)
      .setName("层级线粗细")
      .setDesc("调整层级线宽度，范围为 0.1–2.0 px。")
      .addSlider(slider => {
        slider
          .setLimits(0.1, 2, 0.1)
          .setValue(this.plugin.settings.guideLineWidth)
          .onChange(async value => {
            await this.plugin.updateSettings({ guideLineWidth: value });
          });
      });
  }
}
