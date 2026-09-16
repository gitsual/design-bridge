<script setup lang="ts">
/** Minimal inline-SVG icon. Real systems swap this for their icon set. */
defineProps<{ name: 'check' | 'alert' | 'arrow'; size?: number }>();

const paths: Record<string, string> = {
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  arrow: 'M5 12h14m-7-7 7 7-7 7',
};
</script>

<template>
  <svg
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
