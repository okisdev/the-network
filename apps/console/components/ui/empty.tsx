export function Empty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
      {hint && <p className="text-muted-foreground/70 text-xs">{hint}</p>}
    </div>
  );
}
