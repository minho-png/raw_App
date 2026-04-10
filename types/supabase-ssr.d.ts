/**
 * @supabase/ssr 타입 선언 스텁
 * 실제 패키지가 설치되지 않은 환경에서 TypeScript 타입 체크를 통과하기 위한 최소 선언입니다.
 */
declare module '@supabase/ssr' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type SupabaseClient = any

  export function createBrowserClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>
  ): SupabaseClient

  export function createServerClient(
    supabaseUrl: string,
    supabaseKey: string,
    options: {
      cookies: {
        getAll: () => { name: string; value: string }[]
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => void
      }
    }
  ): SupabaseClient
}
