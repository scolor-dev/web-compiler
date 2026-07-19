import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Chrome built-in AI preload', () => {
  it('does nothing when the Prompt API is unsupported', async () => {
    vi.stubGlobal('LanguageModel', undefined)
    const ai = await import('./chromeBuiltInAi')

    await expect(ai.preloadChromeBuiltInAi()).resolves.toBeNull()
    expect(ai.getChromeBuiltInAiStatus()).toBe('unavailable')
  })

  it('creates an available Japanese session immediately and only once', async () => {
    const modelSession = { prompt: vi.fn(), destroy: vi.fn() }
    const factory = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue(modelSession),
    }
    vi.stubGlobal('LanguageModel', factory)
    const ai = await import('./chromeBuiltInAi')

    const first = ai.preloadChromeBuiltInAi()
    const second = ai.preloadChromeBuiltInAi()

    await expect(first).resolves.toBe(modelSession)
    await expect(second).resolves.toBe(modelSession)
    expect(factory.availability).toHaveBeenCalledWith(expect.objectContaining({
      expectedOutputs: [{ type: 'text', languages: ['ja'] }],
    }))
    expect(factory.create).toHaveBeenCalledOnce()
    expect(ai.getChromeBuiltInAiStatus()).toBe('ready')
    expect(ai.getChromeBuiltInAiSession()).toBe(modelSession)
  })

  it('handles an unavailable device without trying to create a session', async () => {
    const factory = {
      availability: vi.fn().mockResolvedValue('unavailable'),
      create: vi.fn(),
    }
    vi.stubGlobal('LanguageModel', factory)
    const ai = await import('./chromeBuiltInAi')

    await expect(ai.preloadChromeBuiltInAi()).resolves.toBeNull()
    expect(factory.create).not.toHaveBeenCalled()
    expect(ai.getChromeBuiltInAiStatus()).toBe('unavailable')
  })

  it('waits for the first interaction before starting a required download', async () => {
    const modelSession = { prompt: vi.fn(), destroy: vi.fn() }
    const factory = {
      availability: vi.fn().mockResolvedValue('downloadable'),
      create: vi.fn().mockResolvedValue(modelSession),
    }
    const eventTarget = new EventTarget()
    vi.stubGlobal('LanguageModel', factory)
    vi.stubGlobal('navigator', { userActivation: { isActive: false } })
    vi.stubGlobal('window', eventTarget)
    const ai = await import('./chromeBuiltInAi')

    const preload = ai.preloadChromeBuiltInAi()
    await vi.waitFor(() => expect(ai.getChromeBuiltInAiStatus()).toBe('waiting-for-activation'))
    expect(factory.create).not.toHaveBeenCalled()

    eventTarget.dispatchEvent(new Event('pointerdown'))
    await expect(preload).resolves.toBe(modelSession)
    expect(factory.create).toHaveBeenCalledOnce()
    expect(ai.getChromeBuiltInAiStatus()).toBe('ready')
  })

  it('reviews code and specification in an isolated cloned session', async () => {
    const reviewSession = { prompt: vi.fn().mockResolvedValue('結論: 懸念あり'), destroy: vi.fn() }
    const warmedSession = { prompt: vi.fn(), clone: vi.fn().mockResolvedValue(reviewSession), destroy: vi.fn() }
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue(warmedSession),
    })
    const ai = await import('./chromeBuiltInAi')

    await expect(ai.reviewCodeAgainstSpecification('JavaScript', '合計に送料を足す', 'total - shipping')).resolves.toContain('懸念あり')
    expect(reviewSession.prompt).toHaveBeenCalledWith(expect.stringMatching(/合計に送料を足す[\s\S]*total - shipping/))
    expect(reviewSession.destroy).toHaveBeenCalledOnce()
    expect(warmedSession.prompt).not.toHaveBeenCalled()
  })
})
