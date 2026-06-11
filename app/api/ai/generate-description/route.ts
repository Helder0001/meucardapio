// app/api/ai/generate-description/route.ts
//
// Gera descrições de produto usando OpenAI ou Gemini.
// Disponível apenas para planos PRO e PREMIUM.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({
  productName: z.string().min(2).max(100),
  ingredients: z.array(z.string()).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verificar plano
  if (!['PRO', 'PREMIUM'].includes(session.user.plan ?? '')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas nos planos PRO e PREMIUM' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { productName, ingredients = [] } = parsed.data

  const prompt = `Crie uma descrição atrativa e apetitosa para o produto "${productName}" de um restaurante/delivery brasileiro.
${ingredients.length > 0 ? `Ingredientes: ${ingredients.join(', ')}.` : ''}
A descrição deve ter entre 1 e 2 frases, ser em português informal, despertar desejo e destacar os pontos fortes.
Responda APENAS com a descrição, sem aspas nem explicações.`

  try {
    if (process.env.OPENAI_API_KEY) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.8,
        }),
      })

      const data = await res.json()
      const description = data.choices?.[0]?.message?.content?.trim()
      if (description) return NextResponse.json({ description })
    }

    if (process.env.GEMINI_API_KEY) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 150, temperature: 0.8 },
          }),
        }
      )
      const data = await res.json()
      const description = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (description) return NextResponse.json({ description })
    }

    return NextResponse.json({ error: 'Nenhuma API de IA configurada' }, { status: 503 })
  } catch (err) {
    console.error('[ai/generate-description]', err)
    return NextResponse.json({ error: 'Erro ao gerar descrição' }, { status: 500 })
  }
}
