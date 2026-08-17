"use client";

/**
 * A money input pre-filled with the full open amount (the common case is a
 * full settlement). Selects its text on focus so typing a partial amount
 * replaces the default instead of inserting into it — an unselected prefill
 * let a real settlement submit as "full amount" when a partial figure was
 * typed but never actually replaced the field's value.
 */
export function AmountInput({
  name,
  defaultValue,
  className,
}: {
  name: string;
  defaultValue: string | number;
  className?: string;
}) {
  return (
    <input
      name={name}
      required
      inputMode="decimal"
      defaultValue={defaultValue}
      className={className}
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}
