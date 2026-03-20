import { Channel, invoke } from "@tauri-apps/api/core";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

export type VoteJobStatus = "queued" | "sending" | "sent" | "failed";

export type VoteJob = {
  id: string;
  type: "vote" | "delegate";
  address: string;
  candidateName: string;
  amount: number;
  status: VoteJobStatus;
  message: string;
  hash?: string;
  error?: string;
};

type VoteQueueContextType = {
  jobs: VoteJob[];
  addJob: (
    job: Pick<VoteJob, "type" | "address" | "candidateName" | "amount">
  ) => void;
  retryJob: (id: string) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
};

const VoteQueueContext = createContext<VoteQueueContextType | null>(null);

export function useVoteQueue() {
  const ctx = useContext(VoteQueueContext);
  if (!ctx)
    throw new Error("useVoteQueue must be used within VoteQueueProvider");
  return ctx;
}

let nextId = 0;

export function VoteQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [jobs, setJobs] = useState<VoteJob[]>([]);
  const processingRef = useRef(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const processNext = useCallback(async () => {
    if (processingRef.current) return;

    const next = jobsRef.current.find((j) => j.status === "queued");
    if (!next) return;

    processingRef.current = true;

    setJobs((prev) =>
      prev.map((j) =>
        j.id === next.id
          ? { ...j, status: "sending" as const, message: "Preparing..." }
          : j
      )
    );

    try {
      const voteAmount = Math.floor(next.amount * 100000);
      const channel = new Channel<string>();
      channel.onmessage = (m) => {
        setJobs((prev) =>
          prev.map((j) => (j.id === next.id ? { ...j, message: m } : j))
        );
      };

      const hash: string = await invoke("vote", {
        channel,
        address: next.address,
        amount: voteAmount,
      });

      if (next.type === "delegate") {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === next.id ? { ...j, message: "Syncing ballots..." } : j
          )
        );
        try {
          const syncChannel = new Channel<string>();
          syncChannel.onmessage = () => {};
          await invoke("sync", { channel: syncChannel });
        } catch {
          // sync failure is non-critical
        }
      }

      setJobs((prev) =>
        prev.map((j) =>
          j.id === next.id
            ? {
                ...j,
                status: "sent" as const,
                hash,
                message: "Complete",
              }
            : j
        )
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === next.id
            ? { ...j, status: "failed" as const, error: msg, message: msg }
            : j
        )
      );
    } finally {
      processingRef.current = false;
      setTimeout(() => processNext(), 0);
    }
  }, []);

  const addJob = useCallback(
    (job: Pick<VoteJob, "type" | "address" | "candidateName" | "amount">) => {
      const newJob: VoteJob = {
        ...job,
        id: String(++nextId),
        status: "queued",
        message: "Queued",
      };
      setJobs((prev) => [...prev, newJob]);
      setTimeout(() => processNext(), 0);
    },
    [processNext]
  );

  const retryJob = useCallback(
    (id: string) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id && j.status === "failed"
            ? {
                ...j,
                status: "queued" as const,
                message: "Queued",
                error: undefined,
              }
            : j
        )
      );
      setTimeout(() => processNext(), 0);
    },
    [processNext]
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status !== "sent"));
  }, []);

  return (
    <VoteQueueContext.Provider
      value={{ jobs, addJob, retryJob, removeJob, clearCompleted }}
    >
      {children}
    </VoteQueueContext.Provider>
  );
}

