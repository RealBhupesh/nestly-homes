import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

/** Shared layout for static info/legal pages (/about, /contact, /terms, /privacy). */
export function InfoPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-ink">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <Link
            to="/search"
            search={{ mode: "rent" }}
            className="rounded-full border border-ink/10 px-3.5 py-1.5 text-[13px] font-medium text-ink/80 transition hover:border-ink/25 hover:text-ink"
          >
            Browse homes
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-coral">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-[13px] text-ink/50">Last updated: {updated}</p>}
        {intro && <div className="mt-5 text-[15px] leading-relaxed text-ink/70">{intro}</div>}
        <div className="mt-10 space-y-10">{children}</div>
      </main>
    </div>
  );
}

export function InfoSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-ink/75 [&_a]:font-medium [&_a]:text-coral [&_a]:underline-offset-2 hover:[&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
