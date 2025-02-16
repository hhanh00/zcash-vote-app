import { Channel, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { SetElectionMessage } from "./SetElectionMessage";
import { Card } from "./components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./components/ui/accordion";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { Alert } from "./components/ui/alert";

export const Overview: React.FC<ElectionProps> = ({election}) => {
    const [height, setHeight] = useState<number | null | undefined>()
    const [balance, setBalance] = useState<number | undefined>()
    useEffect(() => {
        (async () => {
            try {
                await invoke('sync')
            }
            catch {}

            const height: number | null = await invoke('get_sync_height', {})
            setHeight(height)

            const balance: number = await invoke('get_available_balance', {})
            setBalance(balance / 100000)
        })()
    }, [])

    const download = () => {
        (async () => {
            const channel = new Channel<number>();
            channel.onmessage = (h) => {
                setHeight(h);
            };
            await invoke('download_reference_data', {channel: channel});
            await invoke('sync')
            const balance: number = await invoke('get_available_balance', {})
            setBalance(balance / 100000)
        })()
    }

    if (election == undefined || election.id == '') return <SetElectionMessage />

    const progressPct: number | null | undefined = height && election && (
        100 * (height - election.start_height) / (election.end_height - election.start_height)
    );

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <Card className="max-w-md">
                <h2 className="text-xl font-bold text-gray-800">{election.name}</h2>
                <p className="text-gray-600">
                    {election.question}
                </p>
                <div>
                        {election.candidates.map((item, index) => (
                            <div key={index} className="bg-white">
                                {item.choice}
                            </div>
                        ))}
                </div>
                <Accordion type="single">
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
                            {typeof(height) !== "number" && <Button onClick={download}>Download</Button>}
                            {progressPct && <Progress value={progressPct}></Progress>}
                            <div className="text-xs">Current height: {height}</div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                <div className="text-xl font-semibold text-red-600 dark:text-white">Available Voting Power: {balance ?? 'N/A - Download first'}</div>
                <Alert color="warning" className="mt-4">
                    <span>
                        <strong>Warning: </strong>
                        Funds must be made available only after the registration period has started.
                        These funds should not be spent until the registration period has ended.
                        Voting begins immediately after the registration period.</span>
                </Alert>
            </Card>
        </div>
    )
}
