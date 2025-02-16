import { invoke } from "@tauri-apps/api/core";
import { SetElectionMessage } from "./SetElectionMessage";
import { SubmitHandler, useForm } from "react-hook-form";
import { useState } from "react";
import Swal from "sweetalert2";
import { Spinner } from "./Spinner";
import { Card, CardHeader } from "./components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "./components/ui/form";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { Label } from "./components/ui/label";

export const Vote: React.FC<ElectionProps> = ({ election }) => {
  const [voting, setVoting] = useState(false);

  const form = useForm({
    defaultValues: {
      address: "",
      amount: 0,
    },
  });
  const { control, handleSubmit } = form;

  const onSubmit: SubmitHandler<Vote> = (vote) => {
    setVoting(true);
    (async () => {
      try {
        vote.amount = Math.floor(vote.amount * 100000);
        const hash: string = await invoke("vote", vote);
        console.log(hash);
        await Swal.fire({
          icon: "success",
          title: hash,
        });
      } catch (e: any) {
        console.log(e);
        await Swal.fire({
          icon: "error",
          title: e,
        });
      } finally {
        setVoting(false);
      }
    })();
  };

  if (election == undefined || election.id == "") return <SetElectionMessage />;

  return (
    <>
      {voting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Spinner />
        </div>
      )}
      <Card className="w-full max-w-md">
        <CardHeader>Vote</CardHeader>
        <Form {...form}>
          <form
            className="flex justify-center items-center h-screen bg-gray-100"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="flex flex-col gap-4">
              <FormField
                control={control}
                name="address"
                render={({ field }) => (
                  <FormItem className="name">
                    <FormLabel>Choice</FormLabel>
                    <FormControl>
                      <RadioGroup defaultValue="option-one" {...field}>
                        <div className="flex flex-col gap-2">
                          {election.candidates.map((c) => (
                            <div
                              key={c.address}
                              className="flex items-center space-x-2"
                            >
                              <RadioGroupItem
                                value={c.address}
                                id={c.address}
                              />
                              <Label htmlFor={c.address}>{c.choice}</Label>
                            </div>
                          ))}
                        </div>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="name">
                    <FormLabel>Votes</FormLabel>
                    <FormControl>
                      <Input
                        id="number"
                        type="number"
                        placeholder="Enter a number"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        required
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Button type="submit">Vote</Button>
            </div>
          </form>
        </Form>
      </Card>
    </>
  );
};
