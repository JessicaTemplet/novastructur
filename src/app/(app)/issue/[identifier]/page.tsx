import { IssueDetailView } from "@/components/issue-detail/issue-detail-view";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  return <IssueDetailView identifier={identifier} />;
}
