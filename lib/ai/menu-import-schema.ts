// lib/ai/menu-import-schema.ts
//
// Schema compartilhado entre a extração (o que a IA devolve) e a
// confirmação (o que o usuário efetivamente importa, depois de revisar/
// editar a prévia). Mantém os dois lados do fluxo sempre compatíveis.

import { z } from 'zod'

export const importedProductSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().default(''),
  price: z.number().min(0).max(100000),
  // Confiança da IA na leitura deste item (0 a 1) — usada só pra dar
  // destaque visual na prévia ("confira este item"), não é gravada no banco.
  confidence: z.number().min(0).max(1).optional().default(1),
})

export const importedCategorySchema = z.object({
  name: z.string().min(1).max(80),
  products: z.array(importedProductSchema).min(1),
})

export const importedMenuSchema = z.object({
  categories: z.array(importedCategorySchema).min(1),
})

export type ImportedProduct = z.infer<typeof importedProductSchema>
export type ImportedCategory = z.infer<typeof importedCategorySchema>
export type ImportedMenu = z.infer<typeof importedMenuSchema>

// JSON Schema equivalente, usado no Structured Outputs da OpenAI (que
// exige um JSON Schema "puro", não um schema Zod).
export const importedMenuJsonSchema = {
  name: 'menu_import',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      categories: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            products: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  price: { type: 'number' },
                  confidence: { type: 'number' },
                },
                required: ['name', 'description', 'price', 'confidence'],
              },
            },
          },
          required: ['name', 'products'],
        },
      },
    },
    required: ['categories'],
  },
} as const

export const EXTRACTION_PROMPT = `Você vai analisar a imagem ou o PDF de um cardápio de restaurante brasileiro (foto ou digitalização).

Identifique todas as categorias (grupos de produtos, ex.: "Hambúrgueres", "Pizzas", "Bebidas") e, dentro de cada uma, os produtos com nome, descrição (se houver) e preço.

Regras importantes:
- NÃO invente produtos, preços ou descrições que não estejam visíveis no material.
- Preços em Real (R$) — converta para número (ex.: "R$ 25,90" → 25.90). Se o preço não estiver legível, não inclua o produto.
- Se um produto não tiver descrição no cardápio, deixe description como string vazia.
- Para cada produto, inclua um campo "confidence" de 0 a 1 indicando o quanto você tem certeza da leitura (1 = totalmente legível e claro, valores menores = texto borrado, cortado, ou ambíguo).
- Agrupe produtos parecidos (ex.: variações de tamanho de uma mesma pizza) como itens separados dentro da mesma categoria, com o tamanho no nome (ex.: "Pizza Calabresa - Grande"), já que o cardápio não tem um conceito de variação separado.
- Responda EXCLUSIVAMENTE no formato JSON definido — nenhum texto fora do JSON.`
