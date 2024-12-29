import { Channel, invoke } from "@tauri-apps/api/core";
import { Accordion, Alert, Button, Card, List, Progress, Table } from "flowbite-react"
import { useEffect, useState } from "react";

type Answer = {
    answer: string;
    amount: number;
}

type Candidate = {
    address: string;
    choice: string;
}

export function Overview() {
    const [election, setElection] = useState<any>()
    const [votes, setVotes] = useState<Answer[] | undefined>()
    const [height, setHeight] = useState<number | null | undefined>()
    const [balance, setBalance] = useState<number | undefined>()
    const [nfRoot, setNFRoot] = useState<string | undefined>()
    const [cmxRoot, setCMXRoot] = useState<string | undefined>()
    const [address, setAddress] = useState<string | undefined>()

    useEffect(() => {
        (async () => {
            const election: any = await invoke('get_election')
            console.log(election)
            setElection(election)
            const votes: Answer[] = election.candidates.map((a: Candidate) => {
                return ({
                    answer: a.choice,
                    amount: 0,
                })
            })
            setVotes(votes)

            const height: number | null = await invoke('get_sync_height', {})
            setHeight(height)

            const balance: number = await invoke('get_available_balance', {})
            setBalance(balance / 100000)

            await invoke('compute_roots')
            const nfRoot: string = await invoke('get_prop', {name: 'nf_root'})
            setNFRoot(nfRoot)
            const cmxRoot: string = await invoke('get_prop', {name: 'cmx_root'})
            setCMXRoot(cmxRoot)

            const address: string = await invoke('get_address', {})
            setAddress(address)
        })()
    }, [])

    const download = () => {
        (async () => {
            const channel = new Channel<number>();
            channel.onmessage = (h) => {
                setHeight(h);
            };
            await invoke('download_reference_data', {channel: channel});
            const balance: number = await invoke('get_available_balance', {})
            setBalance(balance / 100000)
        })()
    }

    if (!votes) return <div/>

    const progressPct: number | undefined = height && election && (
        100 * (height - election.start_height) / (election.end_height - election.start_height)
    );

    return <>
        <nav className="flex items-center justify-between px-8 py-2 bg-gray-800 text-white">
            <a href="/home" className="hover:text-gray-400">Election</a>
            <a href="/overview">Overview</a>
            <a href="/history" className="hover:text-gray-400">History</a>
            <button className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">Vote</button>
        </nav>
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <Card className="max-w-md">
                <h2 className="text-xl font-bold text-gray-800">{election.name}</h2>
                <p className="text-gray-600">
                    {election.question}
                </p>
                <Table>
                    <Table.Head>
                        <Table.HeadCell>Answer</Table.HeadCell>
                        <Table.HeadCell>You Voted</Table.HeadCell>
                    </Table.Head>
                    <Table.Body>
                        {votes.map((item, index) => (
                            <Table.Row key={index} className="bg-white">
                                <Table.Cell>{item.answer}</Table.Cell>
                                <Table.Cell>{item.amount}</Table.Cell>
                            </Table.Row>
                        ))}
                    </Table.Body>
                </Table>
                <Accordion>
                    <Accordion.Panel>
                        <Accordion.Title>View Voting Period</Accordion.Title>
                        <Accordion.Content>
                            <List>
                                <List.Item className="flex justify-between">
                                    <span>Registration Start</span>
                                    <span>{election.start_height}</span>
                                </List.Item>
                                <List.Item className="flex justify-between">
                                    <span>Registration End</span>
                                    <span>{election.end_height}</span>
                                </List.Item>
                                <List.Item className="flex justify-between">
                                    <span>Voting End</span>
                                    <span>{election.close_height}</span>
                                </List.Item>
                            </List>
                        </Accordion.Content>
                    </Accordion.Panel>
                </Accordion>
                {typeof(height) !== "number" && <Button onClick={download}>Download</Button>}
                {progressPct && <Progress progress={progressPct}></Progress>}
                <div className="text-xs">Current height: {height}</div>
                <div className="break-all text-sm">{address}</div>
                {nfRoot && <div style={{fontSize: '0.5rem'}}>NF Root: {nfRoot}</div>}
                {cmxRoot && <div style={{fontSize: '0.5rem'}}>CMX Root: {cmxRoot}</div>}
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

        <div>{JSON.stringify(election)}</div>
    </>
}
