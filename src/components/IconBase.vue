<script setup lang="ts">defineProps<{ name: 'play'|'stop'|'terminal'|'sun'|'moon'|'reset'|'chevron'|'check'|'error'|'code'|'input'|'lint'|'flow' }>()</script>
<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name==='play'" d="m8 5 11 7-11 7V5Z" />
    <path v-else-if="name==='stop'" d="M7 7h10v10H7z" />
    <path v-else-if="name==='terminal'" d="m5 7 4 4-4 4m6 0h6M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path v-else-if="name==='sun'" d="M12 3V1m0 22v-2m9-9h2M1 12h2m16.4-7.4 1.4-1.4M3.2 20.8l1.4-1.4m14.8 0 1.4 1.4M3.2 3.2l1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />
    <path v-else-if="name==='moon'" d="M20.6 15.4A9 9 0 0 1 8.6 3.4a9 9 0 1 0 12 12Z" />
    <path v-else-if="name==='reset'" d="M4 7v5h5M5.6 17a8 8 0 1 0-.9-8.7L4 12" />
    <path v-else-if="name==='chevron'" d="m8 10 4 4 4-4" />
    <path v-else-if="name==='check'" d="m5 12 4 4L19 6" />
    <path v-else-if="name==='error'" d="M12 8v5m0 3h.01M10.3 3.7 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
    <path v-else-if="name==='code'" d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" />
    <path v-else-if="name==='input'" d="M13 5h6v14h-6m-3-4 4-3-4-3m4 3H3" />
    <path v-else-if="name==='lint'" d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M9 15l2 2 4-5m-2-9h8v8m0-8-9 9" />
    <path v-else-if="name==='flow'" d="M12 3v4m0 4v4m0 4v2M8 7h8v4H8V7Zm-3 8h6v4H5v-4Zm8 0h6v4h-6v-4Zm-1 0c0-2-1-3-3-4m3 4c0-2 1-3 3-4" />
  </svg>
</template>
