import { cn } from "@/lib/utils";

/**
 * Horizontal layout constraint with responsive gutters (Enterprise Design
 * Manual container system). Server Component — pure structure, no client JS.
 */

type ContainerProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Container<T extends React.ElementType = "div">({
  as,
  className,
  children,
  ...props
}: ContainerProps<T>) {
  const Component = as ?? "div";
  return (
    <Component className={cn("container-site", className)} {...props}>
      {children}
    </Component>
  );
}
