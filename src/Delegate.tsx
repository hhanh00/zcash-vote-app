import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
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
import { Spinner } from "./Spinner";
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
import { useNavigate } from "react-router-dom";

const voteSchema = z.object({
  address: z.string(),
  amount: z.coerce.number().int(),
});

export const Delegate: React.FC<ElectionProps> = ({ election }) => {
  const navigate = useNavigate();
  const [address, setAddress] = useState<string | undefined>();
  const [voting, setVoting] = useState(false);

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

  const onSubmit = (delegation: Vote) => {
    setVoting(true);
    (async () => {
      try {
        delegation.amount = Math.floor(delegation.amount * 100000);
        const hash: string = await invoke("vote", delegation);
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
        setVoting(false);
      }
      await invoke("sync");
    })();
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
              <Button type="submit">Delegate</Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
      {voting && (
        <div>
          <div className="text-lg">Please Wait...</div>
          <Spinner />
        </div>
      )}
    </div>
  );
};
