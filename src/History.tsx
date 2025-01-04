import { invoke } from "@tauri-apps/api/core"
import { Card, Table } from "flowbite-react"
import { useEffect, useState } from "react"

type Vote = {
    id: number;
    hash: string;
    address: string;
    amount: number;
    choice: string | undefined;
}

export const History: React.FC<ElectionProps> = ({election}) => {
    const [votes, setVotes] = useState<Vote[] | undefined>()
    useEffect(() => {
        (
            async () => {
                const votes: Vote[] = await invoke('fetch_votes')
                for (const v of votes) {
                    const c = election.candidates.find((c) => c.address == v.address)
                    if (c) {
                        v.choice = c.choice
                    }
                }
                setVotes(votes)
            }
        )()
    })

    return <div className="flex justify-center items-center h-screen bg-gray-100">
        <Card className="w-full max-w-full">
            <Table>
                <Table.Head>
                <Table.HeadCell>Hash</Table.HeadCell>
                <Table.HeadCell>Address</Table.HeadCell>
                <Table.HeadCell>Amount</Table.HeadCell>
                <Table.HeadCell>Choice</Table.HeadCell>
                </Table.Head>
                <Table.Body>
                    {votes && votes.map((v) => {
                        return <Table.Row key={v.id}>
                            <Table.Cell className="max-w-md break-all">{v.hash}</Table.Cell>
                            <Table.Cell className="max-w-md break-all">{v.address}</Table.Cell>
                            <Table.Cell>{v.amount / 100000}</Table.Cell>
                            <Table.Cell>{v.choice}</Table.Cell>
                        </Table.Row>
                    })}
                </Table.Body>
            </Table>
        </Card></div>
}
