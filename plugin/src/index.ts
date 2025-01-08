import { setLanguage } from "@/i18n";
import "@/styles/main.scss";
import { TodoistApiClient } from "@/api";
import { ObsidianFetcher } from "@/api/fetcher";
import { registerCommands } from "@/commands";
import { QueryInjector } from "@/query/injector";
import { type Services, makeServices } from "@/services";
import { type Settings, useSettingsStore } from "@/settings";
import { SettingsTab } from "@/ui/settings";
import { type App, Plugin } from "obsidian";
import type { PluginManifest } from "obsidian";
import type { Task } from "@/data/task";

export default class TodoistPlugin extends Plugin {
  public readonly services: Services;

  constructor(app: App, pluginManifest: PluginManifest) {
    super(app, pluginManifest);
    this.services = makeServices(this);
  }

  async onload() {
    const queryInjector = new QueryInjector(this);
    this.registerMarkdownCodeBlockProcessor(
      "todoist",
      queryInjector.onNewBlock.bind(queryInjector),
    );
    this.addSettingTab(new SettingsTab(this.app, this));

    registerCommands(this);
    setLanguage(document.documentElement.lang);

    await this.loadOptions();

    this.app.workspace.onLayoutReady(async () => {
      await this.loadApiClient();
    });
  }

  private async loadApiClient(): Promise<void> {
    const accessor = this.services.token;

    if (await accessor.exists()) {
      const token = await accessor.read();
      await this.services.todoist.initialize(new TodoistApiClient(token, new ObsidianFetcher()));
      return;
    }

    this.services.modals.onboarding({
      onTokenSubmit: async (token) => {
        await accessor.write(token);
        await this.services.todoist.initialize(new TodoistApiClient(token, new ObsidianFetcher()));
      },
    });
  }

  async loadOptions(): Promise<void> {
    const options = await this.loadData();

    useSettingsStore.setState((old) => {
      return {
        ...old,
        ...options,
      };
    }, true);

    await this.saveData(useSettingsStore.getState());
  }

  async writeOptions(update: Partial<Settings>): Promise<void> {
    useSettingsStore.setState(update);
    await this.saveData(useSettingsStore.getState());
  }

  async logCompletedTask(task: Task) {
    const filePath = ".logs/Completed Tasks.md";
    const compDate = new Date().toISOString();
  
    let taskLog = `***\n Task: ${task.content}\n`;
    taskLog += `- Created at: ${task.createdAt}, completed at: ${compDate}\n`;
    if (task.description) {
      taskLog += `- Description: ${task.description}\n`;
    }
    if (task.project) {
      taskLog += `- Project: ${task.project.name}\n`;
    }
    if (task.due?.date) {
      taskLog += `- Due date: ${task.due.date}\n`;
    }
    if (task.priority) {
      taskLog += `- Priority: ${task.priority}\n`;
    }
    if (task.labels.length > 0) {
      const labels = task.labels.map((label) => label.name).join(", ");
      taskLog += `- Labels: ${labels}\n`;
    }
    taskLog += `\n\n`;
  
    try {
      const fileExists = await this.app.vault.adapter.exists(filePath);
  
      if (fileExists) {
        const fileContent = await this.app.vault.adapter.read(filePath);
        await this.app.vault.adapter.write(filePath, fileContent + taskLog);
      } else {
        await this.app.vault.adapter.write(filePath, taskLog);
      }
  
      console.log("Task logged successfully:", task.content);
    } catch (error) {
      console.error("Error logging task:", error);
    }
  }
  
}


