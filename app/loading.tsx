import React from 'react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 dir-rtl flex flex-col">
      {/* Header Skeleton */}
      <header className="w-full h-16 bg-white/90 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-300 dark:bg-zinc-800 animate-pulse" />
          <div className="w-24 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse" />
        </div>
        <div className="w-32 h-10 bg-zinc-300 dark:bg-zinc-800 rounded-xl animate-pulse" />
      </header>

      {/* Hero Skeleton */}
      <div className="bg-gradient-to-b from-zinc-200/50 via-zinc-100/20 to-transparent dark:from-zinc-900/40 dark:via-zinc-900/10 py-10 px-4 text-center">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="w-3/4 h-8 bg-zinc-200 dark:bg-zinc-800 mx-auto rounded-xl animate-pulse" />
          <div className="w-1/2 h-4 bg-zinc-200 dark:bg-zinc-800 mx-auto rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Main Content Grid Skeleton */}
      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-1 space-y-6">
        <div className="w-full h-14 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="w-full h-72 bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 space-y-3 animate-pulse">
              <div className="w-full h-36 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
              <div className="w-3/4 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
              <div className="w-full h-4 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
