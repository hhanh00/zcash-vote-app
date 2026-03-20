import { Channel, invoke } from "@tauri-apps/api/core";
import { SetElectionMessage } from "./SetElectionMessage";
import { SubmitHandler, useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./components/ui/form";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const voteSchema = z.object({
  address: z.string().min(1, "A choice is required"),
  amount: z.coerce.number().int(),
});

type QueueStatus = "queued" | "sending" | "sent" | "failed";

type VoteJob = {
  id: string;
  address: string;
  amount: number;
  status: QueueStatus;
  message: string;
};

export const Vote: React.FC<ElectionProps> = ({ election }) => {
  const [jobs, setJobs] = useState<VoteJob[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [warmupMessage, setWarmupMessage] = useState("Tree cache idle");
  const queueEnabled = import.meta.env.VITE_ENABLE_VOTE_QUEUE !== "false";

  const form = useForm<z.infer<typeof voteSchema>>({
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

  const runJob = async (job: VoteJob) => {
    setSendingId(job.id);
    setJobs((current) =>
      current.map((j) =>
        j.id === job.id ? { ...j, status: "sending", message: "Preparing proof..." } : j,
      ),
    );
    try {
      const voteChannel = new Channel<string>();
      voteChannel.onmessage = (m) => {
        setJobs((current) =>
          current.map((j) => (j.id === job.id ? { ...j, message: m } : j)),
        );
      };
      const hash: string = await invoke("vote", {
        channel: voteChannel,
        address: job.address,
        amount: job.amount,
      });
      setJobs((current) =>
        current.map((j) =>
          j.id === job.id ? { ...j, status: "sent", message: `Submitted: ${hash}` } : j,
        ),
      );
    } catch (e: any) {
      console.log(e);
      setJobs((current) =>
        current.map((j) =>
          j.id === job.id
            ? { ...j, status: "failed", message: String(e ?? "Vote failed") }
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

  const onSubmit: SubmitHandler<Vote> = (vote) => {
    const normalizedAmount = Math.floor(vote.amount * 100000);
    if (!queueEnabled) {
      (async () => {
        try {
          const voteChannel = new Channel<string>();
          voteChannel.onmessage = (m) => setWarmupMessage(m);
          const hash: string = await invoke("vote", {
            channel: voteChannel,
            address: vote.address,
            amount: normalizedAmount,
          });
          await Swal.fire({ icon: "success", title: hash });
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
        address: vote.address,
        amount: normalizedAmount,
        status: "queued",
        message: "Queued",
      },
    ]);
    form.reset({ address: vote.address, amount: 0 });
  };

  const retryJob = (id: string) => {
    setJobs((current) =>
      current.map((j) =>
        j.id === id
          ? {
              ...j,
              status: "queued",
              message: "Queued for retry",
            }
          : j,
      ),
    );
  };

  const removeJob = (id: string) => {
    if (sendingId === id) {
      void Swal.fire({
        icon: "warning",
        title: "Vote is still sending",
      });
      return;
    }
    setJobs((current) => current.filter((j) => j.id !== id));
  };

  if (election == undefined || election.id == "") return <SetElectionMessage />;

  return (
    <div className="flex flex-col justify-center items-center">
      <Card className="w-md p-2">
        <CardHeader>
          <CardTitle>Vote</CardTitle>
          <CardDescription>{election.question}</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form className="flex bg-gray-100" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-4">
              <FormField
                control={control}
                name="address"
                render={({ field }) => (
                  <FormItem className="address">
                    <FormLabel>Choose one...</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        {election.candidates.map((c) => (
                          <FormItem
                            key={c.address}
                            className="flex items-center space-x-3 space-y-0"
                          >
                            <FormControl>
                              <RadioGroupItem
                                value={c.address}
                                id={c.address}
                              />
                            </FormControl>
                            <FormLabel>{c.choice}</FormLabel>
                          </FormItem>
                        ))}
                      </RadioGroup>
                    </FormControl>
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
                        id="number"
                        type="number"
                        placeholder="Enter a number"
                        {...field}
                        onChange={(v) => field.onChange(v.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit">Queue vote</Button>
            </div>
          </form>
        </Form>
      </Card>
      <Card className="w-md p-2 mt-4">
        <CardHeader>
          <CardTitle>Vote outbox</CardTitle>
          <CardDescription>
            queued: {queueStats.queued} | sending: {queueStats.sending} | sent:{" "}
            {queueStats.sent} | failed: {queueStats.failed}
          </CardDescription>
          <CardDescription>{warmupMessage}</CardDescription>
          {!queueEnabled && (
            <CardDescription>Queue disabled by VITE_ENABLE_VOTE_QUEUE=false</CardDescription>
          )}
        </CardHeader>
        <div className="flex flex-col gap-2 px-6 pb-6">
          {jobs.length === 0 && <div className="text-sm text-gray-500">No queued votes yet.</div>}
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
        </div>
      </Card>
      </div>
  );
};
