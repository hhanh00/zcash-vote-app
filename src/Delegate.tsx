import { Channel, invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { SetElectionMessage } from "./SetElectionMessage";
import Swal from "sweetalert2";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./components/ui/form";
import { Button } from "./components/ui/button";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const voteSchema = z.object({
  address: z.string(),
  amount: z.coerce.number().int(),
});

type QueueStatus = "queued" | "sending" | "sent" | "failed";

type DelegateJob = {
  id: string;
  address: string;
  amount: number;
  status: QueueStatus;
  message: string;
};

export const Delegate: React.FC<ElectionProps> = ({ election }) => {
  const [address, setAddress] = useState<string | undefined>();
  const [jobs, setJobs] = useState<DelegateJob[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [warmupMessage, setWarmupMessage] = useState("Tree cache idle");
  const queueEnabled = import.meta.env.VITE_ENABLE_VOTE_QUEUE !== "false";

  useEffect(() => {
    (async () => {
      const address: string = await invoke("get_address", {});
      setAddress(address);
    })();
  }, []);

  const form = useForm({
    resolver: zodResolver(voteSchema),
    defaultValues: {
      address: "",
      amount: 0,
    },
  });
  const { control, handleSubmit } = form;

  const queueStats = useMemo(() => {
    let queued = 0;
    let sending = 0;
    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
      if (job.status === "queued") queued += 1;
      if (job.status === "sending") sending += 1;
      if (job.status === "sent") sent += 1;
      if (job.status === "failed") failed += 1;
    }
    return { queued, sending, sent, failed };
  }, [jobs]);

  const runJob = async (job: DelegateJob) => {
    setSendingId(job.id);
    setJobs((current) =>
      current.map((j) =>
        j.id === job.id ? { ...j, status: "sending", message: "Preparing proof..." } : j,
      ),
    );
    try {
      const channel = new Channel<string>();
      channel.onmessage = (m) => {
        setJobs((current) =>
          current.map((j) => (j.id === job.id ? { ...j, message: m } : j)),
        );
      };
      const hash: string = await invoke("vote", {
        channel,
        address: job.address,
        amount: job.amount,
      });
      setJobs((current) =>
        current.map((j) =>
          j.id === job.id ? { ...j, status: "sent", message: `Submitted: ${hash}` } : j,
        ),
      );
      await invoke("sync");
    } catch (e: any) {
      console.log(e);
      setJobs((current) =>
        current.map((j) =>
          j.id === job.id
            ? { ...j, status: "failed", message: String(e ?? "Delegation failed") }
            : j,
        ),
      );
    } finally {
      setSendingId(null);
    }
  };

  useEffect(() => {
    const enableWarmup = import.meta.env.VITE_ENABLE_TREE_WARMUP !== "false";
    if (!enableWarmup) return;
    (async () => {
      try {
        const channel = new Channel<string>();
        channel.onmessage = (m) => setWarmupMessage(m);
        await invoke("warmup_tree_cache", { channel });
      } catch (e) {
        setWarmupMessage(`Warm-up fallback: ${String(e)}`);
      }
    })();
  }, []);

  useEffect(() => {
    if (sendingId !== null) return;
    const next = jobs.find((j) => j.status === "queued");
    if (!next) return;
    void runJob(next);
  }, [jobs, sendingId]);

  const onSubmit = (delegation: Vote) => {
    const normalizedAmount = Math.floor(delegation.amount * 100000);
    if (!queueEnabled) {
      (async () => {
        try {
          const channel = new Channel<string>();
          channel.onmessage = (m) => setWarmupMessage(m);
          const hash: string = await invoke("vote", {
            channel,
            address: delegation.address,
            amount: normalizedAmount,
          });
          await Swal.fire({ icon: "success", title: hash });
          await invoke("sync");
        } catch (e: any) {
          await Swal.fire({ icon: "error", title: String(e) });
        }
      })();
      return;
    }
    const id = crypto.randomUUID();
    setJobs((current) => [
      ...current,
      {
        id,
        address: delegation.address,
        amount: normalizedAmount,
        status: "queued",
        message: "Queued",
      },
    ]);
    form.reset({ address: "", amount: 0 });
  };

  const retryJob = (id: string) => {
    setJobs((current) =>
      current.map((j) =>
        j.id === id ? { ...j, status: "queued", message: "Queued for retry" } : j,
      ),
    );
  };

  const removeJob = (id: string) => {
    if (sendingId === id) {
      void Swal.fire({
        icon: "warning",
        title: "Delegation is still sending",
      });
      return;
    }
    setJobs((current) => current.filter((j) => j.id !== id));
  };

  if (election == undefined || election.id == "") return <SetElectionMessage />;

  return (
    <div className="flex flex-col justify-center items-center">
      <Form {...form}>
        <form
          onSubmit={handleSubmit(onSubmit)}
        >
          <Card className="">
            <CardHeader>
              <CardTitle>Delegate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs max-w-sm break-all p-2">
                Your address is {address}
              </div>
              <FormField
                control={control}
                name="address"
                render={({ field }) => (
                  <FormItem className="address">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input
                        id="address"
                        type="text"
                        placeholder="Delegate to..."
                        required
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="amount">
                    <FormLabel>Votes</FormLabel>
                    <FormControl>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="Enter a number of votes"
                        required
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit">Queue delegation</Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
      <Card className="w-full max-w-md mt-4">
        <CardHeader>
          <CardTitle>Delegation outbox</CardTitle>
          <div className="text-sm text-gray-500">
            queued: {queueStats.queued} | sending: {queueStats.sending} | sent: {queueStats.sent} |
            failed: {queueStats.failed}
          </div>
          <div className="text-sm text-gray-500">{warmupMessage}</div>
          {!queueEnabled && (
            <div className="text-sm text-gray-500">
              Queue disabled by VITE_ENABLE_VOTE_QUEUE=false
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {jobs.length === 0 && (
            <div className="text-sm text-gray-500">No queued delegations yet.</div>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="border rounded-md p-3 text-sm">
              <div className="font-medium break-all">{job.address}</div>
              <div>amount (zats): {job.amount}</div>
              <div>status: {job.status}</div>
              <div className="text-xs text-gray-500 break-all">{job.message}</div>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => retryJob(job.id)}
                  disabled={job.status !== "failed"}
                >
                  Retry
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => removeJob(job.id)}
                  disabled={job.status === "sending"}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
  );
};
