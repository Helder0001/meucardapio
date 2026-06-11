// tests/setup.ts
// Setup global para todos os testes

import { vi } from 'vitest'

// Mock next/headers (usado em Server Actions)
vi.mock('next/headers', () => ({
  headers: () => new Map([
    ['x-forwarded-for', '127.0.0.1'],
    ['user-agent', 'vitest'],
  ]),
  cookies: () => ({ get: () => null }),
}))

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/test',
  useSearchParams: () => new URLSearchParams(),
}))
