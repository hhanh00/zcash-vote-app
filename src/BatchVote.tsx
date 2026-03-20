import { Channel, invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { Spinner } from "./Spinner";
import Swal from "sweetalert2";

type BatchVoteProps = {
  onElectionChange?: (election: Election) => void;
};

type VoteConfig = {
  url: string;
  choice: string;
  amount: number;
};

type ParsedVoteConfig = {
  urls: string[];
  choice: string;
  amount: number;
};

type VoteStatus =
  | "pending"
  | "loading"
  | "downloading"
  | "syncing"
  | "proving"
  | "done"
  | "error";

type VoteProgress = {
  name: string;
  status: VoteStatus;
  message: string;
  hash?: string;
};

const STATUS_LABEL: Record<VoteStatus, string> = {
  pending: "Waiting",
  loading: "Loading election",
  downloading: "Downloading blocks",
  syncing: "Syncing ballots",
  proving: "Building ZK proof",
  done: "Done",
  error: "Failed",
};

const EXAMPLE_CONFIG = `[
  {
    "url": "https://vote-server.example.com/election/proposal-1",
    "choice": "Yes",
    "amount": 100
  },
  {
    "url": "https://vote-server.example.com/election/proposal-2",
    "choice": "No",
    "amount": 100
  }
]`;

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseConfigs(raw: string): ParsedVoteConfig[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("JSON must be a non-empty array");
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Entry ${index + 1} must be an object`);
    }

    const { url, choice, amount } = entry as Partial<VoteConfig>;
    const urls =
      typeof url === "string"
        ? url
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : [];
    const normalizedChoice = typeof choice === "string" ? choice.trim() : "";
    const normalizedAmount = Number(amount);

    if (urls.length === 0 || !normalizedChoice) {
      throw new Error(`Entry ${index + 1} needs a URL and choice`);
    }
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new Error(`Entry ${index + 1} needs a positive numeric amount`);
    }

    return {
      urls,
      choice: normalizedChoice,
      amount: normalizedAmount,
    };
  });
}

export function BatchVote({ onElectionChange }: BatchVoteProps) {
  const [key, setKey] = useState("");
  const [internal, setInternal] = useState(false);
  const [json, setJson] = useState(EXAMPLE_CONFIG);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<VoteProgress[]>([]);

  const start = async () => {
    if (running) {
      return;
    }

    const batchKey = key.trim();
    if (!batchKey) {
      await Swal.fire({ icon: "error", title: "Enter your seed phrase" });
      return;
    }

    let configs: ParsedVoteConfig[];
    try {
      configs = parseConfigs(json);
    } catch (error: unknown) {
      await Swal.fire({
        icon: "error",
        title: "Invalid JSON",
        text: toErrorMessage(error),
      });
      return;
    }

    const valid: boolean = await invoke("validate_key", { key: batchKey });
    if (!valid) {
      await Swal.fire({
        icon: "error",
        title: "Invalid key",
        text: "Must be a 24-word seed phrase or a unified viewing key with an Orchard receiver",
      });
      return;
    }

    setRunning(true);
    setKey("");
    const items: VoteProgress[] = configs.map((_, i) => ({
      name: `Election ${i + 1}`,
      status: "pending",
      message: "",
    }));
    setProgress([...items]);

    let doneCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        const update = (u: Partial<VoteProgress>) => {
          items[i] = { ...items[i], ...u };
          setProgress([...items]);
        };

        try {
          update({ status: "loading", message: "Fetching election data..." });
          const url = config.urls[Math.floor(Math.random() * config.urls.length)];
          const rep: string = await invoke("http_get", { url });
          const election: Election = JSON.parse(rep);
          update({ name: election.name });

          const choice = config.choice.toLowerCase();
          const candidate = election.candidates.find(
            (c) => c.choice.trim().toLowerCase() === choice
          );
          if (!candidate) {
            const options = election.candidates.map((c) => c.choice).join(", ");
            throw new Error(
              `Choice "${config.choice}" not found. Available: ${options}`
            );
          }

          await invoke("set_election", {
            urls: config.urls.join(","),
            election,
            key: batchKey,
            internal,
          });
          onElectionChange?.(election);

          const tmpPath: string = await invoke("get_temp_path", {
            name: election.name,
          });
          await invoke("replace_db", { path: tmpPath });

          update({
            status: "downloading",
            message: "Downloading blocks...",
          });
          const dlChannel = new Channel<number>();
          dlChannel.onmessage = (height) => {
            update({ message: `Downloading... block ${height}` });
          };
          await invoke("download_reference_data", { channel: dlChannel });

          update({ status: "syncing", message: "Syncing ballots..." });
          const syncChannel = new Channel<string>();
          syncChannel.onmessage = (message) => {
            update({ message });
          };
          await invoke("sync", { channel: syncChannel });

          update({ status: "proving", message: "Building ZK proof..." });
          const voteChannel = new Channel<string>();
          voteChannel.onmessage = (message) => {
            update({ message });
          };
          const amount = Math.floor(config.amount * 100000);
          const hash: string = await invoke("vote", {
            channel: voteChannel,
            address: candidate.address,
            amount,
          });

          update({ status: "done", message: "Vote submitted", hash });
          doneCount++;
        } catch (error: unknown) {
          update({ status: "error", message: toErrorMessage(error) });
          errorCount++;
        }
      }
    } finally {
      setRunning(false);
    }

    if (errorCount === 0) {
      await Swal.fire({
        icon: "success",
        title: `All ${doneCount} votes submitted`,
      });
    } else {
      await Swal.fire({
        icon: "warning",
        title: `${doneCount} submitted, ${errorCount} failed`,
        text: "Check the progress log for details",
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-2">
        <CardHeader>
          <CardTitle>Batch Vote</CardTitle>
          <CardDescription>
            Vote on multiple proposals at once. Paste a JSON config with your
            choices and the app will process each one sequentially.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">
                Seed Phrase
              </label>
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter your 24-word seed phrase"
                disabled={running}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <label className="text-sm font-medium">Internal Wallet</label>
              <Switch
                checked={internal}
                onCheckedChange={setInternal}
                disabled={running}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">
                Vote Configuration (JSON)
              </label>
              <textarea
                className="w-full h-72 p-3 mt-1 font-mono text-xs border rounded-md bg-white resize-y"
                value={json}
                onChange={(e) => setJson(e.target.value)}
                disabled={running}
                spellCheck={false}
              />
              <p className="text-xs text-gray-500 mt-1">
                Each entry: <code>url</code> (election server URL),{" "}
                <code>choice</code> (candidate name, e.g. "Yes"),{" "}
                <code>amount</code> (votes in ZEC). Separate URLs with commas
                for redundancy.
              </p>
            </div>

            <Button onClick={start} disabled={running} className="w-full">
              {running ? "Processing..." : "Start Batch Vote"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {progress.length > 0 && (
        <Card className="w-full max-w-2xl p-2">
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {progress.map((p, i) => (
                <div
                  key={i}
                  className={`flex flex-col p-3 rounded-md border ${
                    p.status === "done"
                      ? "border-green-400 bg-green-50"
                      : p.status === "error"
                        ? "border-red-400 bg-red-50"
                        : p.status === "pending"
                          ? "border-gray-200"
                          : "border-blue-400 bg-blue-50"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{p.name}</span>
                    <div className="flex items-center gap-2">
                      {p.status !== "pending" &&
                        p.status !== "done" &&
                        p.status !== "error" && <Spinner className="w-4 h-4" />}
                      <span
                        className={`text-xs font-mono ${
                          p.status === "done"
                            ? "text-green-600"
                            : p.status === "error"
                              ? "text-red-600"
                              : p.status === "pending"
                                ? "text-gray-400"
                                : "text-blue-600"
                        }`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>
                  </div>
                  {p.message && p.status !== "pending" && (
                    <div className="text-xs text-gray-500 mt-1 break-all">
                      {p.message}
                    </div>
                  )}
                  {p.hash && (
                    <div className="text-xs font-mono text-green-700 mt-1 break-all">
                      {p.hash}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {running && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-white p-3 rounded-lg shadow-lg border">
          <Spinner />
          <span className="text-sm">Processing votes...</span>
        </div>
      )}
    </div>
  );
}
