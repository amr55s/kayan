export default function ServicesLoading() {
  return (
    <main id="main-content" className="mx-auto min-h-screen max-w-7xl space-y-5 bg-white px-4 py-8 sm:px-6">
      <div className="h-12 animate-pulse bg-zinc-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[4/3] animate-pulse bg-zinc-100" />)}
      </div>
    </main>
  );
}
