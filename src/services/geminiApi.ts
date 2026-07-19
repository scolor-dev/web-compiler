const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
export const GEMINI_API_MODEL = 'gemini-3.5-flash'
const REQUEST_TIMEOUT_MS = 60_000

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
  error?: { message?: string }
}

export async function reviewWithGeminiApi(apiKey: string, prompt: string, fetcher: typeof fetch = fetch) {
  const key = apiKey.trim()
  if (!key) throw new Error('Gemini APIキーを入力してください。')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetcher(`${GEMINI_API_ENDPOINT}/${GEMINI_API_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2_048,
        },
      }),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({})) as GeminiResponse
    if (!response.ok) {
      const message = payload.error?.message || `Gemini APIがHTTP ${response.status}を返しました。`
      throw new Error(message.split(key).join('[APIキーを非表示]'))
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim()
    if (!text) throw new Error('Gemini APIからレビュー本文が返されませんでした。')
    return text
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Gemini APIの応答が60秒以内に返りませんでした。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
