type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

type ModelOptions = {
  expectedInputs: Array<{ type: 'text', languages: string[] }>
  expectedOutputs: Array<{ type: 'text', languages: string[] }>
}

type DownloadMonitor = {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void
}

export interface ChromeLanguageModelSession {
  prompt(input: string): Promise<string>
  destroy(): void
}

type LanguageModelFactory = {
  availability(options: ModelOptions): Promise<Availability>
  create(options: ModelOptions & { monitor?: (monitor: DownloadMonitor) => void }): Promise<ChromeLanguageModelSession>
}

export type ChromeBuiltInAiStatus =
  | 'idle'
  | 'checking'
  | 'waiting-for-activation'
  | 'downloading'
  | 'ready'
  | 'unavailable'
  | 'failed'

const modelOptions: ModelOptions = {
  expectedInputs: [{ type: 'text', languages: ['en', 'ja'] }],
  expectedOutputs: [{ type: 'text', languages: ['ja'] }],
}

let status: ChromeBuiltInAiStatus = 'idle'
let session: ChromeLanguageModelSession | null = null
let preloadPromise: Promise<ChromeLanguageModelSession | null> | null = null

function languageModelFactory() {
  return (globalThis as typeof globalThis & { LanguageModel?: LanguageModelFactory }).LanguageModel
}

function waitForUserActivation() {
  if (typeof window === 'undefined') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const activate = () => {
      window.removeEventListener('pointerdown', activate, true)
      window.removeEventListener('keydown', activate, true)
      resolve()
    }
    window.addEventListener('pointerdown', activate, { capture: true, once: true })
    window.addEventListener('keydown', activate, { capture: true, once: true })
  })
}

async function createSession(factory: LanguageModelFactory) {
  const availability = await factory.availability(modelOptions)
  if (availability === 'unavailable') {
    status = 'unavailable'
    return null
  }

  if (availability !== 'available' && !navigator.userActivation?.isActive) {
    status = 'waiting-for-activation'
    await waitForUserActivation()
  }

  if (availability === 'downloadable' || availability === 'downloading') status = 'downloading'
  session = await factory.create({
    ...modelOptions,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', () => { status = 'downloading' })
    },
  })
  status = 'ready'
  return session
}

/**
 * Warms Chrome's on-device Prompt API without blocking application startup.
 * If Chrome requires an initial model download, creation resumes on the first
 * user interaction because the browser requires transient user activation.
 */
export function preloadChromeBuiltInAi() {
  if (preloadPromise) return preloadPromise
  const factory = languageModelFactory()
  if (!factory) {
    status = 'unavailable'
    return Promise.resolve(null)
  }

  status = 'checking'
  preloadPromise = createSession(factory).catch(() => {
    status = 'failed'
    return null
  })
  return preloadPromise
}

export function getChromeBuiltInAiStatus() {
  return status
}

export function getChromeBuiltInAiSession() {
  return session
}
