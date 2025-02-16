import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

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
        if (election == undefined) return

        (
            async () => {
                console.log(election)
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
    }, [election])

    return <div className="flex justify-center items-center h-fill bg-gray-100">
        <Card className="w-full max-w-full">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Hash</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Choice</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {votes && votes.map((v) => {
                        return <TableRow key={v.id}>
                            <TableCell className="max-w-md break-all">{v.hash}</TableCell>
                            <TableCell className="max-w-md break-all">{v.address}</TableCell>
                            <TableCell>{v.amount / 100000}</TableCell>
                            <TableCell>{v.choice}</TableCell>
                        </TableRow>
                    })}
                </TableBody>
            </Table>
        </Card></div>
}
