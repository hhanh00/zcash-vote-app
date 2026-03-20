import { SetElectionMessage } from "./SetElectionMessage";
import { SubmitHandler, useForm } from "react-hook-form";
import { useState } from "react";
import { useVoteQueue } from "./VoteQueueContext";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const voteSchema = z.object({
  address: z.string().min(1, "A choice is required"),
  amount: z.coerce.number().int(),
});

export const Vote: React.FC<ElectionProps> = ({ election }) => {
  const { addJob } = useVoteQueue();
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const form = useForm<z.infer<typeof voteSchema>>({
    resolver: zodResolver(voteSchema),
    defaultValues: { address: "", amount: 0 },
  });
  const { control, handleSubmit } = form;

  const onSubmit: SubmitHandler<Vote> = (vote) => {
    const candidate = election.candidates.find(
      (c) => c.address === vote.address
    );
    addJob({
      type: "vote",
      address: vote.address,
      candidateName: candidate?.choice ?? vote.address.slice(0, 16),
      amount: vote.amount,
    });
    form.reset();
    setFormKey((k) => k + 1);
  };

  const resolveAddress = (
    v: { address?: string; choice?: string },
    index: number
  ): { address: string; name: string } | string => {
    if (v.address) {
      const candidate = election.candidates.find(
        (c) => c.address === v.address
      );
      if (!candidate) return `Vote ${index + 1}: unknown address`;
      return { address: v.address, name: candidate.choice };
    }
    if (v.choice) {
      const candidate = election.candidates.find(
        (c) => c.choice.toLowerCase() === v.choice!.toLowerCase()
      );
      if (!candidate) return `Vote ${index + 1}: unknown choice "${v.choice}"`;
      return { address: candidate.address, name: candidate.choice };
    }
    return `Vote ${index + 1}: must provide "address" or "choice"`;
  };

  const handleJsonImport = () => {
    setJsonError("");
    try {
      const parsed = JSON.parse(jsonText);
      const votes: { address?: string; choice?: string; amount: number }[] =
        Array.isArray(parsed) ? parsed : parsed.votes;

      if (!Array.isArray(votes)) {
        setJsonError('Expected an array or an object with a "votes" array');
        return;
      }

      const errors: string[] = [];
      const resolved: { address: string; name: string; amount: number }[] = [];

      votes.forEach((v, i) => {
        if (!v.amount || v.amount <= 0) {
          errors.push(`Vote ${i + 1}: invalid amount`);
          return;
        }
        const result = resolveAddress(v, i);
        if (typeof result === "string") {
          errors.push(result);
        } else {
          resolved.push({ ...result, amount: v.amount });
        }
      });

      if (errors.length > 0) {
        setJsonError(errors.join("\n"));
        return;
      }

      for (const v of resolved) {
        addJob({
          type: "vote",
          address: v.address,
          candidateName: v.name,
          amount: v.amount,
        });
      }

      setJsonText("");
      setJsonDialogOpen(false);
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  const generateTemplate = () => {
    const template = election.candidates.map((c) => ({
      choice: c.choice,
      amount: 0,
    }));
    setJsonText(JSON.stringify(template, null, 2));
  };

  if (election == undefined || election.id == "") return <SetElectionMessage />;

  return (
    <div className="flex flex-col justify-center items-center">
      <Card className="w-md p-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Vote</CardTitle>
              <CardDescription>{election.question}</CardDescription>
            </div>
            <Dialog open={jsonDialogOpen} onOpenChange={setJsonDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Batch Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Batch Vote Import</DialogTitle>
                  <DialogDescription>
                    Paste JSON to queue multiple votes. Use choice names or
                    addresses.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateTemplate}
                  >
                    Generate Template
                  </Button>
                </div>
                <textarea
                  className="w-full h-40 font-mono text-sm border rounded p-2 resize-none"
                  placeholder={
                    '[\n  { "choice": "Option A", "amount": 5 },\n  { "choice": "Option B", "amount": 3 }\n]'
                  }
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                />
                {jsonError && (
                  <pre className="text-red-500 text-xs whitespace-pre-wrap">
                    {jsonError}
                  </pre>
                )}
                <DialogFooter>
                  <Button onClick={handleJsonImport} disabled={!jsonText.trim()}>
                    Queue All Votes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <Form {...form}>
          <form
            key={formKey}
            className="flex bg-gray-100"
            onSubmit={handleSubmit(onSubmit)}
          >
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

              <Button type="submit">Queue Vote</Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
};
