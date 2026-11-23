import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

/** shadcn/ui-style button with the tactile 3D AIlingo look. */
export const buttonVariants = cva("btn", {
  variants: {
    variant: { primary: "", blue: "btn-blue", red: "btn-red", ghost: "btn-ghost" },
    size: { md: "", sm: "btn-sm", big: "btn-big" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
