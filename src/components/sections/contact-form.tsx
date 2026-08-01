"use client";

/**
 * ContactForm — the one heavier Client island on the homepage (Wireframe 08).
 *
 * WHY CLIENT: real-time validation, submission state, and success/error
 * feedback are inherently interactive. It is isolated to this component so the
 * rest of the page stays server-rendered and static.
 *
 * DELIBERATE SIMPLICITY: native <input>/<select>/<textarea> are used rather
 * than a JS-driven custom dropdown — they are fully accessible, keyboard-native,
 * and ship almost no JavaScript (Rule 9: same UX, simpler and faster). Labels
 * sit above every control; errors are wired via aria-describedby + aria-invalid
 * and announced through a live region. Validation reuses the shared Zod schema.
 */

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  contactSchema,
  type ContactInput,
  REGION_VALUES,
  INTEREST_VALUES,
} from "@/lib/validation/contact";
import { cn } from "@/lib/utils";

type Status = "idle" | "error";

// Theme-aware surface: light-gray inputs on light surfaces, deep navy on dark —
// resolves from the section's theme context, so the form fits any tone.
const controlBase =
  "w-full rounded-sm border bg-surface-sunken px-4 py-3 text-body text-foreground transition-colors duration-200 placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]";

export function ContactForm() {
  const t = useTranslations("contact.form");
  const [status, setStatus] = useState<Status>("idle");
  const [submitted, setSubmitted] = useState(false);
  // Honeypot — kept out of react-hook-form/Zod on purpose; read only at submit.
  const honeypotRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      company: "",
      email: "",
      region: "" as ContactInput["region"],
      interest: "" as ContactInput["interest"],
      message: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus("idle");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, hp: honeypotRef.current?.value ?? "" }),
      });
      if (!response.ok) throw new Error("request_failed");
      reset();
      setSubmitted(true);
    } catch {
      setStatus("error");
    }
  });

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-start gap-4 rounded-lg border border-accent/30 bg-surface/60 p-8"
      >
        <span className="inline-flex size-12 items-center justify-center rounded-md border border-accent/40 text-accent">
          <CheckCircle2 className="size-6" aria-hidden="true" strokeWidth={1.5} />
        </span>
        <h3 className="font-sans text-h5 font-semibold text-foreground">
          {t("successTitle")}
        </h3>
        <p className="text-body text-muted">{t("successBody")}</p>
      </div>
    );
  }

  const errorId = (field: keyof ContactInput) =>
    errors[field] ? `${field}-error` : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/* Honeypot: off-screen, non-focusable, hidden from assistive tech.
          A real user never fills this; a bot that does is silently dropped. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="company_website">Company website (leave blank)</label>
        <input
          ref={honeypotRef}
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-error/40 bg-error/10 p-4"
        >
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-error"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-foreground">{t("errorTitle")}</p>
            <p className="text-small text-muted">{t("errorBody")}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("name")} htmlFor="name" error={errors.name && t("errors.name")}>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder={t("namePlaceholder")}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errorId("name")}
            className={cn(controlBase, errors.name ? "border-error" : "border-border")}
            {...register("name")}
          />
        </Field>

        <Field
          label={t("company")}
          htmlFor="company"
          error={errors.company && t("errors.company")}
        >
          <input
            id="company"
            type="text"
            autoComplete="organization"
            placeholder={t("companyPlaceholder")}
            aria-invalid={errors.company ? true : undefined}
            aria-describedby={errorId("company")}
            className={cn(controlBase, errors.company ? "border-error" : "border-border")}
            {...register("company")}
          />
        </Field>
      </div>

      <Field label={t("email")} htmlFor="email" error={errors.email && t("errors.email")}>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errorId("email")}
          className={cn(controlBase, errors.email ? "border-error" : "border-border")}
          {...register("email")}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label={t("region")}
          htmlFor="region"
          error={errors.region && t("errors.region")}
        >
          <select
            id="region"
            defaultValue=""
            aria-invalid={errors.region ? true : undefined}
            aria-describedby={errorId("region")}
            className={cn(controlBase, errors.region ? "border-error" : "border-border")}
            {...register("region")}
          >
            <option value="" disabled>
              {t("regionPlaceholder")}
            </option>
            {REGION_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`regions.${value}`)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t("interest")}
          htmlFor="interest"
          error={errors.interest && t("errors.interest")}
        >
          <select
            id="interest"
            defaultValue=""
            aria-invalid={errors.interest ? true : undefined}
            aria-describedby={errorId("interest")}
            className={cn(controlBase, errors.interest ? "border-error" : "border-border")}
            {...register("interest")}
          >
            <option value="" disabled>
              {t("interestPlaceholder")}
            </option>
            {INTEREST_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`interests.${value}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label={t("message")}
        htmlFor="message"
        error={errors.message && t("errors.message")}
      >
        <textarea
          id="message"
          rows={5}
          placeholder={t("messagePlaceholder")}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errorId("message")}
          className={cn(
            controlBase,
            "resize-y",
            errors.message ? "border-error" : "border-border",
          )}
          {...register("message")}
        />
      </Field>

      <div className="pt-2">
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Field — label + control + inline error. Labels are always visible (never
 * placeholder-as-label) and errors are constructive and associated by id.
 */
function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | false;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-small font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-caption text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
