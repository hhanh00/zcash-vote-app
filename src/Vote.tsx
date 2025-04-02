import { invoke } from "@tauri-apps/api/core";
import { SetElectionMessage } from "./SetElectionMessage";
import { SubmitHandler, useForm } from "react-hook-form";
import { useState } from "react";
import Swal from "sweetalert2";
import { Spinner } from "./Spinner";
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
import { useNavigate } from "react-router-dom";

const voteSchema = z.object({
  address: z.string().min(1, "A choice is required"),
  amount: z.coerce.number().int(),
});

export const Vote: React.FC<ElectionProps> = ({ election }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const form = useForm<z.infer<typeof voteSchema>>({
    resolver: zodResolver(voteSchema),
    defaultValues: {
      address: "",
      amount: 0,
    },
  });
  const { control, handleSubmit } = form;

  const onSubmit: SubmitHandler<Vote> = (vote) => {
    setBusy(true);
    (async () => {
      try {
        vote.amount = Math.floor(vote.amount * 100000);
        const hash: string = await invoke("vote", vote);
        console.log(hash);
        await Swal.fire({
          icon: "success",
          title: hash,
        });
        navigate("/overview");
      } catch (e: any) {
        console.log(e);
        await Swal.fire({
          icon: "error",
          title: e,
        });
      } finally {
        setBusy(false);
      }
    })();
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

              <Button type="submit">Vote</Button>
            </div>
          </form>
        </Form>
      </Card>
      {busy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Spinner />
      </div>
    )}
    </div>
  );
};
