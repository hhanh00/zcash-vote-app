import { Channel, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { SetElectionMessage } from "./SetElectionMessage";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import Swal from "sweetalert2";

export const Overview: React.FC<ElectionProps> = ({ election }) => {
  const [height, setHeight] = useState<number | null | undefined>();
  const [balance, setBalance] = useState<number | undefined>();
  const [id, setId] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        await invoke("sync");
      } catch {}

      const height: number | null = await invoke("get_sync_height", {});
      setHeight(height);

      const balance: number = await invoke("get_available_balance", {});
      setBalance(balance / 100000);

      const id: string = await invoke("get_election_id", { election: election })
      setId(id)
    })();
  }, []);

  const download = () => {
    (async () => {
      try {
        const channel = new Channel<number>();
        channel.onmessage = (h) => {
          setHeight(h);
        };
        await invoke("download_reference_data", { channel: channel });
        await invoke("sync");
        const balance: number = await invoke("get_available_balance", {});
        setBalance(balance / 100000);
      } catch (e: any) {
        await invoke("reset");
        await Swal.fire({
          icon: "error",
          title: e,
        });
      }
    })();
  };

  if (election == undefined || election.id == "") return <SetElectionMessage />;

  const progressPct: number | null | undefined =
    height &&
    election &&
    (100 * (height - election.start_height)) /
      (election.end_height - election.start_height);

  return (
    <div className="flex flex-col gap-4 items-center justify-center">
      <div className="text-red-500">{id}</div>
      <Card className="w-md p-2">
        <CardHeader>
          <CardTitle>{election.name}</CardTitle>
          <CardDescription>{election.question}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-decimal">
            {election.candidates.map((item, index) => (
              <li key={index}>{item.choice}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="w-md p-2">
        <CardTitle>Voting Power</CardTitle>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="info">
              <AccordionTrigger>View Voting Period</AccordionTrigger>
              <AccordionContent>
                <div>
                  <div className="flex justify-between">
                    <span>Registration Start</span>
                    <span>{election.start_height}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Registration End</span>
                    <span>{election.end_height}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          {typeof height !== "number" && (
            <Button onClick={download}>Download Blockchain Data</Button>
          )}
          {progressPct && <Progress value={progressPct}></Progress>}
          <div className="text-xs">Current height: {height}</div>
          <div className="text-xl font-semibold text-red-600 dark:text-white">
            Available Voting Power: {balance ?? "N/A - Download first"}
          </div>
          <CardFooter>
            <Alert color="warning" className="mt-4">
              <AlertTitle>Warning!</AlertTitle>
              <AlertDescription>
                Funds must be made available only after the registration period
                has started. These funds should not be spent until the
                registration period has ended. Voting begins immediately after
                the registration period.
              </AlertDescription>
            </Alert>
          </CardFooter>
        </CardContent>
      </Card>
    </div>
  );
};
