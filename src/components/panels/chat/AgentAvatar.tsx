import { Sparkles } from "lucide-react";
import { cn } from "cn";

const SIZES = {
  sm: { box: "size-9 rounded-xl", icon: "size-4", depth: "translate-x-px translate-y-0.5" },
  lg: { box: "size-14 rounded-2xl", icon: "size-7", depth: "translate-x-0.5 translate-y-1" },
} as const;

/** The agent's mark: a raised sparkle on a glossy gradient chip. */
export default function AgentAvatar({ size = "sm", className }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-linear-to-br from-violet-500 to-fuchsia-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-4px_10px_rgba(0,0,0,0.25),0_8px_18px_-6px_rgba(124,58,237,0.6)] ring-1 ring-white/20",
        s.box,
        className,
      )}
    >
      <span className="absolute -top-1/2 -left-1/3 size-full rounded-full bg-white/25 blur-md" />
      <Sparkles className={cn("absolute text-black/30", s.icon, s.depth)} strokeWidth={2.25} />
      <Sparkles className={cn("relative text-white drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]", s.icon)} strokeWidth={2.25} />
    </span>
  );
}
