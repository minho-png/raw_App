'use client'

import { useState, FormEvent, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'

// useSearchParams를 사용하는 부분을 별도 컴포넌트로 분리 (Suspense 필수)
function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get('redirect') ?? '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? '로그인에 실패했습니다.')
        return
      }

      router.replace(redirect)
      router.refresh()
    } catch {
      setError('서버와 통신 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-200 px-8 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-800">로그인</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="username">
            아이디
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            placeholder="사용자 아이디"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="password">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-100">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <Image
            src="/CrossTarget_BI.png"
            alt="CrossTarget"
            width={180}
            height={46}
            className="h-10 w-auto object-contain"
            priority
          />
          <p className="text-sm font-medium text-gray-500">광고 운영 대시보드</p>
        </div>

        {/* Suspense로 useSearchParams 경계 설정 */}
        <Suspense fallback={
          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 px-8 py-8 text-center text-sm text-gray-400">
            로딩 중...
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
