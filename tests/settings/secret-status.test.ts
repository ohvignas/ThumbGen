import { describe, it, expect } from "vitest";
import { describeSecretStatus } from "@/components/settings/secret-status";

describe("describeSecretStatus", () => {
  it("shows the preview of a stored key", () => {
    expect(describeSecretStatus({ configured: true, preview: "…a107", source: "settings" })).toEqual({
      label: "Configurée · …a107",
      variant: "secondary",
    });
  });

  it("flags a key coming from the environment", () => {
    expect(describeSecretStatus({ configured: true, preview: "…9999", source: "env" })).toEqual({
      label: "Via variable d'environnement",
      variant: "outline",
    });
  });

  it("flags a missing key", () => {
    expect(describeSecretStatus({ configured: false, preview: null, source: null })).toEqual({
      label: "Non configurée",
      variant: "destructive",
    });
  });
});
