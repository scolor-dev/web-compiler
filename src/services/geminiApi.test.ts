import { describe, expect, it, vi } from 'vitest'
import { GEMINI_API_MODEL, reviewWithGeminiApi } from './geminiApi'

describe('Gemini API review', () => {
  it('sends the prompt using the native API and auth-key header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '結論: 懸念あり' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(reviewWithGeminiApi('test-api-key', 'review prompt', fetcher)).resolves.toContain('懸念あり')
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/models/${GEMINI_API_MODEL}:generateContent`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goog-api-key': 'test-api-key' }),
      }),
    )
    const request = fetcher.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(request.body as string)).toEqual(expect.objectContaining({
      contents: [{ role: 'user', parts: [{ text: 'review prompt' }] }],
    }))
  })

  it('returns a safe API error without including the key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'API key secret-value is invalid' },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }))

    await expect(reviewWithGeminiApi('secret-value', 'prompt', fetcher)).rejects.toThrow('API key [APIキーを非表示] is invalid')
    await reviewWithGeminiApi('secret-value', 'prompt', fetcher).catch((error: Error) => {
      expect(error.message).not.toContain('secret-value')
    })
  })

  it('requires a key before making a request', async () => {
    const fetcher = vi.fn()
    await expect(reviewWithGeminiApi('  ', 'prompt', fetcher)).rejects.toThrow('APIキーを入力')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
