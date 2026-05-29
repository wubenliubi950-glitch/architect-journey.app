"use client";

import type { ReactNode } from "react";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
}) {
  const base =
    "rounded-xl px-5 py-3 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
  const styles = {
    primary: "bg-stone-800 text-white hover:bg-stone-700",
    secondary: "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50",
    ghost: "text-stone-600 hover:text-stone-900",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

export function StepTitle({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-bold tracking-widest text-amber-600">STEP {step}</div>
      <h1 className="mt-1 text-2xl font-bold text-stone-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
    </div>
  );
}

export function Card({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border bg-white p-4 transition ${
        onClick ? "cursor-pointer active:scale-[0.99]" : ""
      } ${selected ? "border-amber-500 ring-2 ring-amber-200" : "border-stone-200"}`}
    >
      {children}
    </div>
  );
}

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "amber" | "green" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-600",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-stone-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
