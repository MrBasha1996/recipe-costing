'use client'

import { createContext, useContext, useState } from 'react'

interface LoadingState {
  message: string
  progress: { current: number; total: number } | null
}

interface GlobalLoadingContextType {
  startLoading: (message: string) => void
  stopLoading: () => void
  updateProgress: (current: number, total: number) => void
}

const GlobalLoadingContext = createContext<GlobalLoadingContextType>({
  startLoading: () => {},
  stopLoading: () => {},
  updateProgress: () => {},
})

export function useGlobalLoading() {
  return useContext(GlobalLoadingContext)
}

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LoadingState | null>(null)

  function startLoading(message: string) {
    setState({ message, progress: null })
  }

  function stopLoading() {
    setState(null)
  }

  function updateProgress(current: number, total: number) {
    setState(prev => (prev ? { ...prev, progress: { current, total } } : null))
  }

  return (
    <GlobalLoadingContext.Provider value={{ startLoading, stopLoading, updateProgress }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="جارٍ التنفيذ">
          {/* Backdrop — blocks all interaction */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal card */}
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-5 text-center">

            {/* Spinner */}
            <div className="w-16 h-16 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />

            {/* Message */}
            <div>
              <p className="text-gray-800 font-semibold text-base leading-snug">{state.message}</p>
              {state.progress && (
                <p className="text-gray-500 text-sm mt-1.5">
                  {state.progress.current} / {state.progress.total}
                </p>
              )}
            </div>

            {/* Progress bar */}
            {state.progress && (
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (state.progress.current / Math.max(1, state.progress.total)) * 100)}%` }}
                />
              </div>
            )}

            <p className="text-xs text-gray-400">الرجاء الانتظار — لا تغلق الصفحة</p>
          </div>
        </div>
      )}
    </GlobalLoadingContext.Provider>
  )
}
