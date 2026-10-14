import type { ButtonHTMLAttributes } from "react";

export function Action({
  children,
  ink,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { ink?: boolean }) {
  return (
    <button className={ink ? "button ink-button" : "button"} {...props}>
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
