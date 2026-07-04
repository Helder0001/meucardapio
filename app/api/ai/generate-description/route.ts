// app/api/ai/generate-description/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({
  productName: z.string().min(2).max(100),
  ingredients: z.array(z.string()).optional(),
})

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }
    if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()

    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      )
    }

    const { productName, ingredients = [] } = parsed.data

    const prompt = `Crie uma descrição atrativa e apetitosa para o produto "${productName}" de um restaurante/delivery brasileiro.
${
  ingredients.length > 0
    ? `Ingredientes: ${ingredients.join(', ')}.`
    : ''
}
A descrição deve ter entre 1 e 2 frases, ser em português informal, despertar desejo e destacar os pontos fortes.
Responda APENAS com a descrição, sem aspas nem explicações.`

    // =====================================================
    // OPENAI
    // =====================================================

    if (process.env.OPENAI_API_KEY) {
      try {
        console.log('Tentando OpenAI...')

        const res = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.8,
              max_tokens: 150,
            }),
          }
        )

        const data = await res.json()

        if (!res.ok) {
          console.error('OpenAI erro:', res.status, data)
        } else {
          const description =
            data?.choices?.[0]?.message?.content?.trim()

          if (description) {
            console.log('Descrição gerada pela OpenAI')

            return NextResponse.json({
              description,
            })
          }
        }
      } catch (err) {
        console.error('Erro OpenAI:', err)
      }
    }

    // =====================================================
    // GROQ
    // =====================================================

    if (process.env.GROQ_API_KEY) {
      try {
        console.log('Tentando Groq...')

        const res = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              // llama3-8b-8192 foi descontinuado pelo Groq em 31/05/2025.
              // Substituído pelo modelo recomendado: llama-3.1-8b-instant
              model: 'llama-3.1-8b-instant',
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.8,
              max_tokens: 300,
            }),
          }
        )

        const data = await res.json()

        console.log('Groq Status:', res.status)

        if (!res.ok) {
          console.error(
            'Groq erro:',
            JSON.stringify(data, null, 2)
          )
        } else {
          const description =
            data?.choices?.[0]?.message?.content?.trim()

          if (description) {
            console.log('Descrição gerada pela Groq')

            return NextResponse.json({
              description,
            })
          }

          console.error(
            'Groq respondeu sem descrição:',
            JSON.stringify(data, null, 2)
          )
        }
      } catch (err) {
        console.error('Erro Groq:', err)
      }
    }

    // =====================================================
    // ANTHROPIC
    // =====================================================

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log('Tentando Claude...')

        const res = await fetch(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 150,
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            }),
          }
        )

        const data = await res.json()

        if (!res.ok) {
          console.error('Claude erro:', res.status, data)
        } else {
          const description =
            data?.content?.[0]?.text?.trim()

          if (description) {
            console.log('Descrição gerada pelo Claude')

            return NextResponse.json({
              description,
            })
          }
        }
      } catch (err) {
        console.error('Erro Claude:', err)
      }
    }

    console.error(
      'Nenhum provedor conseguiu gerar a descrição.'
    )

    return NextResponse.json(
      {
        error:
          'Todas as APIs de IA falharam ou não estão configuradas corretamente.',
      },
      {
        status: 503,
      }
    )
  } catch (err) {
    console.error('Erro geral:', err)

    return NextResponse.json(
      {
        error: 'Erro interno do servidor.',
      },
      {
        status: 500,
      }
    )
  }
}
