<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import CodeEditor from './components/CodeEditor.vue'
import IconBase from './components/IconBase.vue'
import { languageMap, languages } from './constants/languages'
import { useExecution } from './composables/useExecution'
import type { LanguageId } from './types/execution'

const savedLanguage = localStorage.getItem('local-code-studio:language') as LanguageId | null
const language = ref<LanguageId>(savedLanguage && languageMap[savedLanguage] ? savedLanguage : 'c')
const code = reactive(Object.fromEntries(languages.map((item) => [item.id, localStorage.getItem(`local-code-studio:code:${item.id}`) ?? item.sample])) as Record<LanguageId, string>)
const stdin = reactive(Object.fromEntries(languages.map((item) => [item.id, localStorage.getItem(`local-code-studio:stdin:${item.id}`) ?? item.stdin])) as Record<LanguageId, string>)
const systemDark = matchMedia('(prefers-color-scheme: dark)')
const savedTheme = localStorage.getItem('local-code-studio:theme')
const dark = ref(savedTheme ? savedTheme === 'dark' : systemDark.matches)
const cursor = ref({ line: 1, column: 1 })
const panel = ref<'output' | 'input' | 'console'>('output')
const logicVisible = reactive<Record<LanguageId, boolean>>({ c: false, javascript: false, whitespace: false })
const { running, result, activeAction, run, lint, stop } = useExecution()

const current = computed(() => languageMap[language.value])
const diagnostics = computed(() => result.value?.diagnostics ?? [])
const hasDiagnosticErrors = computed(() => diagnostics.value.some((item) => item.severity === 'error'))
const status = computed(() => {
  if (running.value) return { text: activeAction.value === 'lint' ? 'Lint中' : '実行中', tone: 'running' }
  if (!result.value) return { text: '準備完了', tone: 'idle' }
  if (result.value.exitCode === 0) return { text: result.value.action === 'lint' ? '問題なし' : '実行成功', tone: 'success' }
  return { text: 'エラー', tone: 'error' }
})
const whitespaceStats = computed(() => {
  const source = code.whitespace
  return {
    spaces: [...source].filter((ch) => ch === ' ').length,
    tabs: [...source].filter((ch) => ch === '\t').length,
    lines: source.split('\n').length,
    ignored: [...source].filter((ch) => ch !== ' ' && ch !== '\t' && ch !== '\n' && (/\s/u.test(ch) || ch === '\u200b')).length,
  }
})

function executeCode() {
  if (panel.value === 'input') panel.value = 'output'
  run(language.value, code[language.value], stdin[language.value])
}
function lintCode() {
  if (panel.value === 'input') panel.value = 'output'
  lint(language.value, code[language.value])
}
function toggleLogic() { logicVisible[language.value] = !logicVisible[language.value] }
function resetCode() {
  code[language.value] = current.value.sample
  stdin[language.value] = current.value.stdin
  result.value = null
}
function selectLanguage(id: LanguageId) {
  if (running.value) stop()
  language.value = id
  result.value = null
}
function toggleTheme() { dark.value = !dark.value }
function handleKeyboard(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Enter') { event.preventDefault(); lintCode(); return }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); executeCode() }
}

watch(language, (value) => localStorage.setItem('local-code-studio:language', value))
watch(dark, (value) => { document.documentElement.classList.toggle('dark', value); localStorage.setItem('local-code-studio:theme', value ? 'dark' : 'light') }, { immediate: true })
watch(code, (value) => Object.entries(value).forEach(([id, source]) => localStorage.setItem(`local-code-studio:code:${id}`, source)), { deep: true })
watch(stdin, (value) => Object.entries(value).forEach(([id, source]) => localStorage.setItem(`local-code-studio:stdin:${id}`, source)), { deep: true })
onMounted(() => window.addEventListener('keydown', handleKeyboard))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeyboard))
</script>

<template>
  <div class="app-shell flex min-h-dvh flex-col bg-stone-50 text-zinc-900 dark:bg-[#0a0a0c] dark:text-zinc-100">
    <header class="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white/85 px-4 backdrop-blur-xl dark:border-white/8 dark:bg-[#0d0d10]/85 sm:px-6">
      <div class="flex min-w-0 items-center gap-3">
        <div class="brand-mark grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-950 text-white shadow-lg shadow-violet-500/10 dark:bg-white dark:text-zinc-950">
          <IconBase name="terminal" class="size-5" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-bold tracking-tight sm:text-base">Local Code Studio</h1>
          <p class="hidden text-[11px] font-medium text-zinc-500 sm:block dark:text-zinc-500">Your code stays in this browser.</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="status-pill hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex" :class="`status-${status.tone}`">
          <span class="size-1.5 rounded-full bg-current" :class="{ 'animate-pulse': running }" />{{ status.text }}
        </div>
        <button class="icon-button" type="button" :aria-label="dark ? 'ライトテーマに切り替え' : 'ダークテーマに切り替え'" @click="toggleTheme">
          <IconBase :name="dark ? 'sun' : 'moon'" class="size-[18px]" />
        </button>
      </div>
    </header>

    <main class="workspace grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
      <section class="flex min-h-[56dvh] min-w-0 flex-col border-b border-zinc-200/80 lg:min-h-0 lg:border-r lg:border-b-0 dark:border-white/8">
        <div class="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/65 px-3 dark:border-white/8 dark:bg-white/[.015] sm:px-4">
          <nav class="flex min-w-0 items-center gap-1" aria-label="プログラミング言語">
            <button v-for="item in languages" :key="item.id" type="button" class="language-tab" :class="{ active: language === item.id }" @click="selectLanguage(item.id)">
              <span class="language-dot" :style="{ backgroundColor: item.color }" />
              <span>{{ item.label }}</span>
            </button>
          </nav>
          <button class="icon-button shrink-0" type="button" title="サンプルに戻す" aria-label="サンプルに戻す" @click="resetCode"><IconBase name="reset" class="size-4" /></button>
        </div>

        <div class="flex min-h-0 flex-1 flex-col bg-white dark:bg-[#0d0d10]">
          <div class="flex h-9 shrink-0 items-center justify-between border-b border-zinc-100 px-4 text-[11px] dark:border-white/5">
            <div class="flex items-center gap-2 font-mono font-medium text-zinc-500 dark:text-zinc-400"><IconBase name="code" class="size-3.5" />{{ current.extension }}</div>
            <div v-if="language === 'whitespace'" class="flex gap-2 font-mono text-[10px] text-zinc-400"><span>· {{ whitespaceStats.spaces }}</span><span>⇥ {{ whitespaceStats.tabs }}</span><span>↵ {{ whitespaceStats.lines - 1 }}</span><span v-if="whitespaceStats.ignored" class="text-amber-500">他 {{ whitespaceStats.ignored }}</span></div>
            <span v-else class="font-mono text-zinc-400">Ln {{ cursor.line }}, Col {{ cursor.column }}</span>
          </div>
          <div v-if="language === 'whitespace'" class="whitespace-legend flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-zinc-100 px-4 font-mono text-[9px] whitespace-nowrap dark:border-white/5">
            <span class="ws-legend-token"><b>·</b> ASCII Space</span><span class="ws-legend-token"><b>⇥</b> Tab</span><span class="ws-legend-token"><b>↵</b> LF</span><span class="ws-legend-token ignored" title="NBSP・全角スペース・その他のUnicode空白"><b>⍽ □ ␠</b> 他は無視</span>
            <span class="ws-legend-stack">● Stack</span><span class="ws-legend-arithmetic">● Math</span><span class="ws-legend-heap">● Heap</span><span class="ws-legend-flow">● Flow</span><span class="ws-legend-io">● I/O</span><span class="ws-legend-number">● Number</span><span class="ws-legend-label">● Label</span>
          </div>
          <CodeEditor v-model="code[language]" :language :dark :diagnostics :show-logic="logicVisible[language]" class="flex-1" @cursor="(line, column) => cursor = { line, column }" />
        </div>

        <div class="flex min-h-16 shrink-0 items-center justify-between gap-3 border-t border-zinc-200/80 bg-white/75 px-4 dark:border-white/8 dark:bg-white/[.02]">
          <div class="min-w-0">
            <p class="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-300">{{ current.description }}</p>
            <p class="mt-0.5 text-[10px] text-zinc-400">ローカル実行 · 5秒制限</p>
          </div>
          <button v-if="running" type="button" class="run-button stop" @click="stop"><IconBase name="stop" class="size-4" />停止</button>
          <div v-else class="flex items-center gap-2">
            <button type="button" class="logic-button" :class="{ active: logicVisible[language] }" :aria-pressed="logicVisible[language]" :title="logicVisible[language] ? 'ロジック解説を非表示' : 'ロジック解説を表示'" @click="toggleLogic"><IconBase name="code" class="size-4" /><span class="hidden sm:inline">ロジック</span></button>
            <button type="button" class="lint-button" title="実行せずに分かりやすい問題を検査（Ctrl/Cmd + Shift + Enter）" @click="lintCode"><IconBase name="lint" class="size-4" /><span>Lint</span></button>
            <button type="button" class="run-button" @click="executeCode"><IconBase name="play" class="size-4 fill-current" /><span>実行</span><kbd class="hidden sm:inline">⌘↵</kbd></button>
          </div>
        </div>
      </section>

      <section class="flex min-h-[44dvh] min-w-0 flex-col bg-zinc-50/70 lg:min-h-0 dark:bg-[#0a0a0c]">
        <div class="flex h-14 shrink-0 items-end justify-between border-b border-zinc-200/80 px-4 dark:border-white/8">
          <div class="flex h-full items-end gap-5">
            <button type="button" class="panel-tab" :class="{ active: panel === 'output' }" @click="panel = 'output'"><IconBase name="terminal" class="size-4" />出力<span v-if="diagnostics.length" class="error-count" :class="{ warning: !hasDiagnosticErrors }">{{ diagnostics.length }}</span></button>
            <button type="button" class="panel-tab" :class="{ active: panel === 'input' }" @click="panel = 'input'"><IconBase name="input" class="size-4" />標準入力</button>
            <button type="button" class="panel-tab" :class="{ active: panel === 'console' }" @click="panel = 'console'"><IconBase name="code" class="size-4" />コンソール</button>
          </div>
          <span v-if="result?.durationMs !== undefined" class="mb-4 font-mono text-[10px] text-zinc-400">{{ result.durationMs.toFixed(1) }} ms</span>
        </div>

        <div v-if="panel === 'input'" class="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
          <label for="stdin" class="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">プログラムへ渡す入力</label>
          <textarea id="stdin" v-model="stdin[language]" spellcheck="false" placeholder="1行目&#10;2行目..." class="terminal-surface min-h-40 flex-1 resize-none p-4 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-violet-500/40" />
          <p class="mt-2 text-[11px] text-zinc-400">Cでは getchar()、Whitespaceでは入力命令、JavaScriptでは stdin 変数から参照できます。</p>
        </div>

        <div v-else-if="panel === 'console'" class="flex min-h-0 flex-1 flex-col bg-[#111114] text-zinc-200">
          <div class="console-output min-h-0 flex-1 overflow-auto p-4 font-mono text-[13px] leading-6 sm:p-5" aria-live="polite">
            <div class="mb-3 flex items-center justify-between gap-3 border-b border-white/8 pb-3 text-[10px] uppercase tracking-[.14em] text-zinc-500">
              <span class="flex items-center gap-2"><span class="size-1.5 rounded-full" :class="running ? 'animate-pulse bg-violet-400' : result?.exitCode === 0 ? 'bg-emerald-400' : result ? 'bg-rose-400' : 'bg-zinc-600'" />program output</span>
              <span v-if="result">exit {{ result.exitCode }}</span>
            </div>
            <div v-if="running" class="flex items-center gap-2 text-violet-300"><span class="console-caret">›</span><span>実行しています...</span></div>
            <div v-else-if="!result" class="text-zinc-500"><span class="mr-2 text-violet-400">›</span>実行結果はここに表示されます。</div>
            <template v-else>
              <pre v-if="result.stdout" class="whitespace-pre-wrap text-zinc-100">{{ result.stdout }}</pre>
              <pre v-if="result.stderr" class="whitespace-pre-wrap text-rose-400">{{ result.stderr }}</pre>
              <p v-if="!result.stdout && !result.stderr" class="text-zinc-500">{{ result.action === 'lint' ? '分かりやすい構文上の問題は見つかりませんでした。' : '（出力はありません）' }}</p>
              <div v-if="diagnostics.length" class="mt-4 border-t border-white/8 pt-3">
                <p v-for="(item, index) in diagnostics" :key="index" :class="item.severity === 'warning' ? 'text-amber-400' : 'text-rose-400'"><span class="mr-2">!</span>{{ current.extension }}:{{ item.line }}:{{ item.column }} {{ item.message }}</p>
              </div>
            </template>
          </div>
          <div class="console-input shrink-0 border-t border-white/10 bg-black/25 p-3 sm:p-4">
            <div class="mb-2 flex items-center justify-between gap-3">
              <label for="console-stdin" class="flex items-center gap-2 font-mono text-[11px] font-semibold text-zinc-300"><span class="text-violet-400">$</span> standard input</label>
              <span class="text-[10px] text-zinc-600">次回実行時に使用</span>
            </div>
            <div class="flex items-end gap-2">
              <textarea id="console-stdin" v-model="stdin[language]" rows="3" spellcheck="false" placeholder="プログラムへ渡す入力..." class="min-h-20 flex-1 resize-y rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-mono text-xs leading-5 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-500/20" />
              <button type="button" class="console-run-button" :disabled="running" title="この入力で実行" @click="executeCode"><IconBase name="play" class="size-3.5 fill-current" /><span class="hidden sm:inline">実行</span></button>
            </div>
          </div>
        </div>

        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div v-if="running" class="grid flex-1 place-items-center p-8 text-center">
            <div><div class="loader mx-auto mb-4 size-8 rounded-full border-2 border-zinc-200 border-t-violet-500 dark:border-zinc-800 dark:border-t-violet-400" /><p class="text-sm font-semibold">コードを実行しています</p><p class="mt-1 text-xs text-zinc-400">WASMエンジンで処理中...</p></div>
          </div>
          <div v-else-if="!result" class="grid flex-1 place-items-center p-8 text-center">
            <div class="max-w-xs"><div class="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-zinc-200 bg-white text-zinc-400 shadow-sm dark:border-white/8 dark:bg-white/[.03]"><IconBase name="terminal" class="size-5" /></div><p class="text-sm font-semibold text-zinc-700 dark:text-zinc-300">実行結果がここに表示されます</p><p class="mt-1.5 text-xs leading-5 text-zinc-400">コードを書いたら「実行」を押してください。<br><span class="font-mono">Ctrl / Cmd + Enter</span> でも実行できます。</p></div>
          </div>
          <div v-else class="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-5">
            <div class="mb-3 flex items-center gap-2 text-xs font-bold" :class="result.exitCode === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
              <IconBase :name="result.exitCode === 0 ? 'check' : 'error'" class="size-4" />
              {{ result.exitCode === 0 ? (result.action === 'lint' ? 'Lint完了 — 問題は見つかりませんでした' : '正常終了') : (result.action === 'lint' ? 'Lintで問題が見つかりました' : `終了コード ${result.exitCode}`) }}
            </div>
            <div v-if="result.stdout || result.stderr" class="terminal-surface min-h-32 shrink-0 overflow-auto p-4 font-mono text-[13px] leading-6">
              <pre v-if="result.stdout" class="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{{ result.stdout }}</pre>
              <pre v-if="result.stderr" class="whitespace-pre-wrap text-rose-600 dark:text-rose-400">{{ result.stderr }}</pre>
            </div>
            <div v-else class="terminal-surface p-4 font-mono text-xs text-zinc-400">{{ result.action === 'lint' ? '分かりやすい構文上の問題は見つかりませんでした。' : '（出力はありません）' }}</div>
            <div v-if="diagnostics.length" class="mt-4 space-y-2">
              <button v-for="(item, index) in diagnostics" :key="index" class="diagnostic-card w-full text-left" :class="item.severity" type="button">
                <IconBase name="error" class="mt-0.5 size-4 shrink-0" :class="item.severity === 'warning' ? 'text-amber-500' : 'text-rose-500'" />
                <span class="min-w-0"><span class="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">{{ item.message }}</span><span class="mt-1 block font-mono text-[10px] text-zinc-400">{{ current.extension }}:{{ item.line }}:{{ item.column }}</span></span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
