import type { SecretStatus } from "@/lib/settings-schema";

export function describeSecretStatus(status: SecretStatus): {
  label: string;
  variant: "secondary" | "outline" | "destructive";
} {
  if (status.source === "settings") return { label: `Configurée · ${status.preview ?? "…"}`, variant: "secondary" };
  if (status.source === "env") return { label: "Via variable d'environnement", variant: "outline" };
  return { label: "Non configurée", variant: "destructive" };
}
