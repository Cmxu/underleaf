import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'

export const supabase = createBrowserClient(
  PUBLIC_SUPABASE_URL, 
  PUBLIC_SUPABASE_ANON_KEY
)

export function createSupabaseServerClient(fetch: typeof globalThis.fetch) {
  return createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
          // This is a no-op for server-side rendering
        },
      },
      global: {
        fetch,
      },
    }
  )
} 