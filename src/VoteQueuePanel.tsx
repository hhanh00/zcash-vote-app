import { useState } from "react";
import { useVoteQueue, VoteJob } from "./VoteQueueContext";
import { Spinner } from "./Spinner";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";

function estimateProgress(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("complete")) return 100;
  if (lower.includes("broadcast") || lower.includes("send")) return 95;
  if (lower.includes("transaction") || lower.includes("tx")) return 80;
  if (lower.includes("proof") || lower.includes("prov")) return 60;
  if (lower.includes("nullifier") || lower.includes("tree")) return 40;
  if (lower.includes("witness")) return 25;
  if (lower.includes("prepar")) return 10;
  return 5;
}

function StatusIcon({ status }: { status: VoteJob["status"] }) {
  switch (status) {
    case "queued":
      return (
        <span className="inline-block w-4 h-4 text-center text-gray-400 leading-4">
          ○
        </span>
      );
    case "sending":
      return <Spinner className="h-4 w-4" />;
    case "sent":
      return (
        <span className="inline-block w-4 h-4 text-center text-green-500 leading-4">
          ✓
        </span>
      );
    case "failed":
      return (
        <span className="inline-block w-4 h-4 text-center text-red-500 leading-4">
          ✗
        </span>
      );
  }
}

export function VoteQueuePanel() {
  const { jobs, retryJob, removeJob, clearCompleted } = useVoteQueue();
  const [collapsed, setCollapsed] = useState(false);

  if (jobs.length === 0) return null;

  const sending = jobs.filter((j) => j.status === "sending").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const sent = jobs.filter((j) => j.status === "sent").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  const currentJob = jobs.find((j) => j.status === "sending");
  const progress = currentJob ? estimateProgress(currentJob.message) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-800 text-white cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          Vote Queue
          {sending > 0 && <Spinner className="h-3 w-3" />}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {queued > 0 && (
            <span className="bg-gray-500 px-1.5 py-0.5 rounded">
              {queued}
            </span>
          )}
          {sending > 0 && (
            <span className="bg-blue-500 px-1.5 py-0.5 rounded">
              {sending}
            </span>
          )}
          {sent > 0 && (
            <span className="bg-green-600 px-1.5 py-0.5 rounded">{sent}</span>
          )}
          {failed > 0 && (
            <span className="bg-red-600 px-1.5 py-0.5 rounded">{failed}</span>
          )}
          <span className="ml-1">{collapsed ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Progress bar for active job */}
      {currentJob && <Progress value={progress} className="h-1 rounded-none" />}

      {/* Job list */}
      {!collapsed && (
        <div className="max-h-64 overflow-y-auto divide-y">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <StatusIcon status={job.status} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {job.type === "delegate" ? "Delegate" : "Vote"}:{" "}
                  {job.candidateName}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {job.status === "sent" && job.hash
                    ? `TX: ${job.hash.slice(0, 20)}...`
                    : job.message}
                </div>
              </div>
              <div className="text-xs text-gray-400 shrink-0">
                {job.amount}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {job.status === "failed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => retryJob(job.id)}
                  >
                    Retry
                  </Button>
                )}
                {(job.status === "sent" || job.status === "failed") && (
                  <button
                    className="text-gray-400 hover:text-gray-600 text-xs px-1"
                    onClick={() => removeJob(job.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          {sent > 0 && (
            <div className="px-3 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs w-full"
                onClick={clearCompleted}
              >
                Clear completed
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
