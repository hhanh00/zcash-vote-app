import { Channel, invoke } from "@tauri-apps/api/core";
import { SetElectionMessage } from "./SetElectionMessage";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { Progress } from "./components/ui/progress";
import { Label } from "./components/ui/label";
import { Spinner } from "./Spinner";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Shield,
  Vote as VoteIcon,
  Zap,
} from "lucide-react";

type WizardStep = "select" | "review" | "proving" | "receipt";

const PROOF_STAGES = [
  { label: "Preparing ballot...", pct: 10 },
  { label: "Building witness...", pct: 25 },
  { label: "Computing nullifier tree...", pct: 40 },
  { label: "Generating ZK proof...", pct: 60 },
  { label: "Constructing shielded transaction...", pct: 80 },
  { label: "Broadcasting vote...", pct: 95 },
] as const;

export const VoteWizard: React.FC<ElectionProps> = ({ election }) => {
  const [step, setStep] = useState<WizardStep>("select");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [proofStage, setProofStage] = useState(0);
  const [proofMessage, setProofMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const bal: number = await invoke("get_available_balance", {});
        setBalance(bal / 100000);
      } catch {
        // balance not available yet — user hasn't synced
      }
    })();
  }, []);

  const selectedCandidate = election.candidates.find(
    (c) => c.address === selectedAddress
  );

  const amountNum = parseFloat(amount);
  const isValidAmount = !isNaN(amountNum) && amountNum > 0;
  const canProceedToReview = selectedAddress !== "" && isValidAmount;

  const handleVote = async () => {
    setStep("proving");
    setError("");
    setProofStage(0);

    try {
      const voteAmount = Math.floor(amountNum * 100000);
      const voteChannel = new Channel<string>();

      voteChannel.onmessage = (m) => {
        setProofMessage(m);
        // Advance stage based on message content
        const lower = m.toLowerCase();
        if (lower.includes("witness")) setProofStage(1);
        else if (lower.includes("nullifier") || lower.includes("tree"))
          setProofStage(2);
        else if (lower.includes("proof") || lower.includes("prov"))
          setProofStage(3);
        else if (lower.includes("transaction") || lower.includes("tx"))
          setProofStage(4);
        else if (lower.includes("broadcast") || lower.includes("send"))
          setProofStage(5);
      };

      const hash: string = await invoke("vote", {
        channel: voteChannel,
        address: selectedAddress,
        amount: voteAmount,
      });

      setTxHash(hash);
      setStep("receipt");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStep("review"); // go back so user can retry
    }
  };

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may not be available in Tauri
    }
  };

  const resetWizard = () => {
    setStep("select");
    setSelectedAddress("");
    setAmount("");
    setProofStage(0);
    setProofMessage("");
    setTxHash("");
    setError("");
  };

  if (election == undefined || election.id == "") return <SetElectionMessage />;

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {(["select", "review", "proving", "receipt"] as const).map((s, i) => {
          const labels = ["Select", "Review", "Prove", "Receipt"];
          const icons = ["1", "2", "3", "4"];
          const isActive = s === step;
          const isPast =
            ["select", "review", "proving", "receipt"].indexOf(s) <
            ["select", "review", "proving", "receipt"].indexOf(step);

          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 ${isPast ? "bg-primary" : "bg-border"}`}
                />
              )}
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isPast
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isPast ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <span>{icons[i]}</span>
                )}
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: Select */}
      {step === "select" && (
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <VoteIcon className="h-5 w-5" />
              Cast Your Vote
            </CardTitle>
            <CardDescription>{election.question}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Balance display */}
            {balance !== null && (
              <div className="flex items-center justify-between rounded-lg border border-dashed p-3">
                <span className="text-sm text-muted-foreground">
                  Available voting power
                </span>
                <span className="text-lg font-semibold">{balance} ZEC</span>
              </div>
            )}

            {/* Candidate selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Choose a candidate</Label>
              <RadioGroup
                value={selectedAddress}
                onValueChange={setSelectedAddress}
                className="space-y-2"
              >
                {election.candidates.map((c) => (
                  <label
                    key={c.address}
                    htmlFor={`candidate-${c.address}`}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent ${
                      selectedAddress === c.address
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <RadioGroupItem
                      value={c.address}
                      id={`candidate-${c.address}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{c.choice}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                        {c.address}
                      </div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Vote amount */}
            <div className="space-y-2">
              <Label htmlFor="vote-amount" className="text-sm font-medium">
                Number of votes (ZEC)
              </Label>
              <Input
                id="vote-amount"
                type="number"
                min="0"
                step="0.00001"
                placeholder="Enter amount..."
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {balance !== null && isValidAmount && amountNum > balance && (
                <p className="text-xs text-destructive">
                  Exceeds available voting power ({balance} ZEC)
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              onClick={() => setStep("review")}
              disabled={!canProceedToReview}
              className="gap-2"
            >
              Review Vote
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Review */}
      {step === "review" && (
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Review Your Vote
            </CardTitle>
            <CardDescription>
              Confirm the details below. A zero-knowledge proof will be generated
              to protect your privacy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <strong>Vote failed:</strong> {error}
                <br />
                <span className="text-xs">
                  Please review your selection and try again.
                </span>
              </div>
            )}

            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Election</span>
                <span className="text-sm font-medium">{election.name}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Your choice
                </span>
                <span className="text-sm font-medium">
                  {selectedCandidate?.choice ?? "Unknown"}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Vote amount
                </span>
                <span className="text-sm font-medium">{amount} ZEC</span>
              </div>
              {balance !== null && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Remaining power
                    </span>
                    <span className="text-sm font-medium">
                      {(balance - amountNum).toFixed(5)} ZEC
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Shield className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Your vote is shielded. A zero-knowledge proof ensures no one can
                link your identity to your ballot — not even the election
                organizer.
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setStep("select");
              }}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleVote} className="gap-2">
              <Zap className="h-4 w-4" />
              Submit Vote
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Proving */}
      {step === "proving" && (
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Spinner className="h-5 w-5" />
              Generating Proof
            </CardTitle>
            <CardDescription>
              Your zero-knowledge proof is being computed. This may take a
              moment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress bar */}
            <div className="space-y-2">
              <Progress value={PROOF_STAGES[proofStage]?.pct ?? 10} />
              <p className="text-sm text-center font-medium">
                {PROOF_STAGES[proofStage]?.label ?? "Preparing..."}
              </p>
            </div>

            {/* Stage checklist */}
            <div className="space-y-2">
              {PROOF_STAGES.map((stage, i) => (
                <div
                  key={stage.label}
                  className={`flex items-center gap-2 text-sm transition-opacity ${
                    i <= proofStage ? "opacity-100" : "opacity-30"
                  }`}
                >
                  {i < proofStage ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : i === proofStage ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border" />
                  )}
                  <span
                    className={
                      i === proofStage ? "font-medium" : ""
                    }
                  >
                    {stage.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Live backend message */}
            {proofMessage && (
              <div className="rounded-md bg-muted p-2 text-xs font-mono text-muted-foreground text-center">
                {proofMessage}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border p-3">
              <Shield className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Do not close this window. The proof guarantees your vote is valid
                without revealing your identity.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Receipt */}
      {step === "receipt" && (
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Vote Submitted</CardTitle>
            <CardDescription>
              Your shielded vote has been broadcast to the network.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Choice</span>
                <span className="text-sm font-medium">
                  {selectedCandidate?.choice}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-sm font-medium">{amount} ZEC</span>
              </div>
              <div className="h-px bg-border" />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">
                    Transaction
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyHash}
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <code className="block break-all rounded bg-muted p-2 text-xs font-mono">
                  {txHash}
                </code>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
              <Shield className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-xs text-green-700 dark:text-green-300">
                This vote is fully shielded. Your ballot cannot be linked to
                your identity. Save the transaction hash as your personal
                receipt.
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-center gap-3">
            <Button variant="outline" onClick={resetWizard} className="gap-2">
              Cast Another Vote
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};
