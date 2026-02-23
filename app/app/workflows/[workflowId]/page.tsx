import { WorkflowEditorPage } from "@/components/workflow/workflow-editor-page";

type WorkflowPageProps = {
  params: Promise<{ workflowId: string }>;
};

export default function WorkflowRoute({ params }: WorkflowPageProps) {
  return <WorkflowEditorPage params={params} />;
}
