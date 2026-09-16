"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type FormLike<V> = {
  values: V | null;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  loadError: string | null;
  save: () => Promise<void>;
};

export default function SettingsFormCard<V>({
  title,
  description,
  form,
  children,
}: {
  title: string;
  description: string;
  form: FormLike<V>;
  children: (values: V) => React.ReactNode;
}) {
  return (
    <Card>
      {/* noValidate: bounds are enforced by the server so its French issue messages show under the fields. */}
      <form
        className="contents"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
      >
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {form.loadError ? (
            <Alert variant="destructive">
              <AlertDescription>{form.loadError}</AlertDescription>
            </Alert>
          ) : form.values === null ? (
            <div className="grid gap-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : (
            children(form.values)
          )}
          {form.error && (
            <Alert variant="destructive">
              <AlertDescription>{form.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="gap-3">
          <Button type="submit" disabled={!form.dirty || form.saving}>
            {form.saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {form.saved && <span className="text-sm text-muted-foreground">Enregistré</span>}
        </CardFooter>
      </form>
    </Card>
  );
}
