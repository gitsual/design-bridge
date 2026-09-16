import type { StorybookConfig } from '@storybook/vue3-vite';
import vue from '@vitejs/plugin-vue';

const config: StorybookConfig = {
  stories: ['../src/stories/generated/**/*.stories.ts'],
  addons: ['@storybook/addon-essentials'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  // Registered explicitly: depending on the framework preset to inject the Vue
  // plugin is fragile across Storybook/Vite minor versions, and when it does
  // not happen every `.vue` import 404s with "invalid JS syntax" — a confusing
  // error that looks like a missing file rather than a missing compiler.
  viteFinal: async (viteConfig) => {
    const hasVuePlugin = (viteConfig.plugins ?? []).flat().some(
      (plugin: any) => plugin && plugin.name === 'vite:vue',
    );
    if (!hasVuePlugin) viteConfig.plugins = [...(viteConfig.plugins ?? []), vue()];
    return viteConfig;
  },
};

export default config;
