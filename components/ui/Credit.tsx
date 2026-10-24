/** Required credit line for the visual style. */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11.5px] text-ink-soft ${className}`}>
      Style inspired by a low-poly city model by abhi on Sketchfab
    </p>
  );
}
