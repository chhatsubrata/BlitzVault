import { getPasswordStrengthChecks } from "@/lib/auth-validation";

type PasswordStrengthChecklistProps = {
  password: string;
};

const CHECK_ITEMS = [
  { key: "minLength" as const, label: "At least 8 characters" },
  { key: "hasUppercase" as const, label: "One uppercase letter" },
  { key: "hasLowercase" as const, label: "One lowercase letter" },
  { key: "hasNumber" as const, label: "One number" },
];

export function PasswordStrengthChecklist({ password }: PasswordStrengthChecklistProps) {
  const checks = getPasswordStrengthChecks(password);

  return (
    <ul className="flex flex-col gap-1 text-xs text-default-500" aria-live="polite">
      {CHECK_ITEMS.map(({ key, label }) => {
        const met = checks[key];
        return (
          <li key={key} className={met ? "text-emerald-600 dark:text-emerald-400" : undefined}>
            {met ? "✓" : "○"} {label}
          </li>
        );
      })}
    </ul>
  );
}
