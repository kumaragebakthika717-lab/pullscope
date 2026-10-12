import type { Metadata } from "next";
import { getMyRubric } from "@/app/actions/rubric";
import { RubricEditor } from "@/components/rubric-editor";

export const metadata: Metadata = { title: "Rubric" };

export default async function RubricPage() {
  const { attributes } = await getMyRubric();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Your rubric</h1>
        <p className="text-sm text-muted-foreground">
          The attributes you score every puller on. Rename, reorder, add, or remove — existing annotations keep their
          history.
        </p>
      </div>
      <RubricEditor initial={attributes} />
    </div>
  );
}
