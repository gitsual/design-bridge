import type { Preview } from '@storybook/vue3-vite';
import '../../shared/dist/tokens.css';

/**
 * Applies the selected theme to <html> so the `:root[data-theme="dark"]` block
 * in tokens.css takes effect.
 *
 * This runs in the decorator body, NOT inside `setup()`. `setup()` only runs
 * when the story component mounts, so toggling the toolbar would re-render the
 * story without ever updating the attribute — the toolbar would appear to do
 * nothing. The decorator body runs on every render, including global changes.
 */
const applyTheme = (theme: string) => {
  document.documentElement.dataset.theme = theme;
};

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  globalTypes: {
    theme: {
      description: 'Design token theme',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [
    (story, context) => {
      applyTheme(context.globals.theme ?? 'light');
      return { components: { story }, template: '<story />' };
    },
  ],
};

export default preview;
