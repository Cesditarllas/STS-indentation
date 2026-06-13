import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate
} from "@codemirror/view";
import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

const DEPTH_ATTRIBUTE = "data-sts-outline-depth";
const DEPTH_STYLE = "--sts-outline-depth";
const GUIDE_CLASS = "sts-indentation-guides-enabled";
const COLORED_GUIDE_CLASS = "sts-indentation-colored-guides";
const MAX_GUIDES = 6;

interface StsIndentationSettings {
  showGuides: boolean;
  colorGuidesByHeading: boolean;
}

const DEFAULT_SETTINGS: StsIndentationSettings = {
  showGuides: true,
  colorGuidesByHeading: true
};

interface HeadingAncestor {
  level: number;
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
      `--sts-guide-${index + 1}:${ancestor ? headingColor(ancestor.level) : "transparent"}`
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

  async onload(): Promise<void> {
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
    this.register(() => this.readingObserver?.disconnect());

    this.scheduleReadingViewUpdate();
  }

  onunload(): void {
    if (this.readingFrame !== null) {
      window.cancelAnimationFrame(this.readingFrame);
    }

    document.body.classList.remove(GUIDE_CLASS, COLORED_GUIDE_CLASS);
    document.querySelectorAll<HTMLElement>(`[${DEPTH_ATTRIBUTE}]`).forEach(element => {
      this.clearOutlineAttributes(element);
    });
  }

  async updateSettings(settings: Partial<StsIndentationSettings>): Promise<void> {
    this.settings = Object.assign({}, this.settings, settings);
    await this.saveData(this.settings);
    this.applySettingClasses();
  }

  private applySettingClasses(): void {
    document.body.classList.toggle(GUIDE_CLASS, this.settings.showGuides);
    document.body.classList.toggle(
      COLORED_GUIDE_CLASS,
      this.settings.colorGuidesByHeading
    );
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
    const ancestors: HeadingAncestor[] = [];
    const blocks = this.getReadingBlocks(container);

    blocks.forEach(element => {
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
    });
  }

  private getReadingBlocks(container: HTMLElement): HTMLElement[] {
    const blocks: HTMLElement[] = [];

    container
      .querySelectorAll<HTMLElement>(".markdown-preview-section")
      .forEach(section => {
        if (section.closest(".markdown-embed") !== null) {
          return;
        }

        Array.from(section.children).forEach(child => {
          if (
            child instanceof HTMLElement &&
            !child.classList.contains("mod-header")
          ) {
            blocks.push(child);
          }
        });
      });

    if (blocks.length > 0) {
      return blocks;
    }

    return Array.from(container.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !child.classList.contains("mod-header")
    );
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
        `--sts-guide-${index + 1}`,
        ancestor ? headingColor(ancestor.level) : "transparent"
      );
    }
  }

  private clearOutlineAttributes(element: HTMLElement): void {
    element.removeAttribute(DEPTH_ATTRIBUTE);
    element.style.removeProperty(DEPTH_STYLE);
    for (let index = 1; index <= MAX_GUIDES; index += 1) {
      element.style.removeProperty(`--sts-guide-${index}`);
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
      .setName("层级线颜色跟随标题")
      .setDesc("每条层级线使用对应父标题的主题颜色。关闭后统一使用主题的缩进线颜色。")
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.colorGuidesByHeading)
          .onChange(async value => {
            await this.plugin.updateSettings({ colorGuidesByHeading: value });
          });
      });
  }
}
