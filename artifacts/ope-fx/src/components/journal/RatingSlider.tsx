import { Slider } from "@/components/ui/slider";

export function RatingSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-mono font-medium">{value ?? "-"}/10</span>
      </div>
      <Slider
        min={1}
        max={10}
        step={1}
        value={[value ?? 5]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
