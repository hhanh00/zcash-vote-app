import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { SetElectionMessage } from "./SetElectionMessage";
import Swal from "sweetalert2";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "./Spinner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "./components/ui/form";
import { Button } from "./components/ui/button";

export const Delegate: React.FC<ElectionProps> = ({ election }) => {
  const [address, setAddress] = useState<string | undefined>();
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    (async () => {
      const address: string = await invoke("get_address", {});
      setAddress(address);
    })();
  }, []);

  const form = useForm({
    defaultValues: {
      address: "",
      amount: 0,
    },
  });
  const { control, handleSubmit } = form;

  const onSubmit = (delegation: Vote) => {
    (async () => {
      setVoting(true);
      try {
        delegation.amount = Math.floor(delegation.amount * 100000);
        const hash: string = await invoke("vote", delegation);
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
      await invoke("sync");
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
      <Form {...form}>
        <form
          className="flex justify-center items-center h-screen bg-gray-100"
          onSubmit={handleSubmit(onSubmit)}
        >
          <Card className="w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 text-center">Delegate</h2>
            <div className="text-xs max-w-sm break-all">
              Your address is {address}
            </div>
            <FormField
              control={control}
              name="address"
              render={({ field }) => (
                <FormItem className="name">
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
                      id="amount"
                      type="number"
                      placeholder="Enter a number of votes"
                      required
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit">Delegate</Button>
          </Card>
        </form>
      </Form>
    </>
  );
};
