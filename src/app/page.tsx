import { ShortenForm } from "@/components/shorten-form";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-16 sm:py-24">
      <div className="mb-10 max-w-xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          Shorten your links
        </h1>
        <p className="mt-3 text-balance text-zinc-600 dark:text-zinc-400">
          Paste a long URL and get a compact link you can share. This app is built with
          Next.js—UI, API, and redirects in one place—with PostgreSQL behind the scenes.
        </p>
      </div>
      <ShortenForm />
    </div>
  );
}
