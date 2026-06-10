'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError('بيانات الدخول غير صحيحة')
      setLoading(false)
      return
    }

    const { data: profile } = await (supabase.from('user_profiles') as any)
      .select('brand_access')
      .eq('id', signInData.user.id)
      .single()

    const brand = (profile as any)?.brand_access === 'all' ? 'bb' : ((profile as any)?.brand_access ?? 'bb')
    router.push(`/${brand}/costing`)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div
            className="text-4xl font-bold mb-1"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            Analytics
          </div>
          <div className="text-gray-500 text-sm">نظام تكاليف الوصفات</div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1 text-right">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              dir="ltr"
              placeholder="user@example.com"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1 text-right">
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              dir="ltr"
              placeholder="••••••••"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-400"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 text-right">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-100 disabled:text-gray-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? 'جارٍ الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  )
}
