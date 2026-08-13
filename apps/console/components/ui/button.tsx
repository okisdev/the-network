import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "focus-visible:ring-ring inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[color,background-color,box-shadow,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.97] [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground ring-border hover:bg-accent ring-1",
        outline: "text-muted-foreground ring-border hover:bg-accent hover:text-foreground ring-1",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        primary: "bg-primary text-primary-foreground hover:bg-primary/85",
        destructive: "text-destructive ring-destructive/30 hover:bg-destructive/10 ring-1",
      },
      size: {
        default: "px-3 py-1.5 text-sm",
        sm: "px-2.5 py-1 text-xs",
        icon: "size-7 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
