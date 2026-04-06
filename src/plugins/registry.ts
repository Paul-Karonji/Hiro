import type { ChannelPlugin, MemoryPlugin, ProviderPlugin, ToolPlugin } from "./types";

export class PluginRegistry {
  private providerPlugins = new Map<string, ProviderPlugin>();
  private channelPlugins = new Map<string, ChannelPlugin>();
  private toolPlugins = new Map<string, ToolPlugin>();
  private memoryPlugins = new Map<string, MemoryPlugin>();

  registerProvider(plugin: ProviderPlugin) {
    this.providerPlugins.set(plugin.id, plugin);
  }

  registerChannel(plugin: ChannelPlugin) {
    this.channelPlugins.set(plugin.id, plugin);
  }

  registerTool(plugin: ToolPlugin) {
    this.toolPlugins.set(plugin.id, plugin);
  }

  registerMemory(plugin: MemoryPlugin) {
    this.memoryPlugins.set(plugin.id, plugin);
  }

  getProvider(id: string) {
    return this.providerPlugins.get(id);
  }

  getProviders() {
    return Array.from(this.providerPlugins.values());
  }

  getChannel(id: string) {
    return this.channelPlugins.get(id);
  }

  getTool(id: string) {
    return this.toolPlugins.get(id);
  }

  getMemory(id: string) {
    return this.memoryPlugins.get(id);
  }
}
