import { Suspense } from "react";
import { Studio } from "@/components/studio/Studio";

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-[100svh] bg-ink" />}>
      {params.then(({ id }) => (
        <Studio jobId={id} />
      ))}
    </Suspense>
  );
}
