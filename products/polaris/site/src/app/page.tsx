import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">Find a clinical trial that fits</h1>
        <p className="max-w-2xl text-muted-foreground">
          Search BioNova&apos;s recruiting trials in plain language, learn about
          conditions, and check whether you might be eligible. No account
          needed.
        </p>
        <div className="flex gap-3">
          <Link href="/search">
            <Button>Browse all trials</Button>
          </Link>
          <Link href="/about">
            <Button variant="outline">About BioNova</Button>
          </Link>
        </div>
      </section>
      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-lg font-semibold">Quick search</h2>
        <SearchForm />
      </section>
    </main>
  );
}
