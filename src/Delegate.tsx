import { invoke } from "@tauri-apps/api/core";
import { Button, Label, TextInput } from "flowbite-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { SetElectionMessage } from "./SetElectionMessage";

export function Delegate() {
    const [election, setElection] = useState<Election | undefined>()

    useEffect(() => {
        (async () => {
            const election: Election = await invoke('get_election')
            setElection(election)
        })()
    }, [])

    const { control, handleSubmit } = useForm(
        {
            defaultValues: {
                address: '',
                amount: 0,
            },
        }
    );

    const onVote = (delegation: Vote) => {
        (async () => {
            delegation.amount = Math.floor(delegation.amount * 100000)
            await invoke('vote', delegation)
        })()
    }

    if (election == undefined || election.id == '') return <SetElectionMessage />
    
    return <div className="flex max-w justify-center">
        <form onSubmit={handleSubmit(onVote)} className=" bg-gray-100 flex flex-col gap-4 p-4 w-5/6">
            <div>
                <Label htmlFor="address" value="Address" />
                <Controller
                    name="address"
                    control={control}
                    render={({ field }) => <TextInput
                        id="address"
                        type="text"
                        placeholder="Delegate to..."
                        required
                        {...field}
                    />} />
            </div>

            <div>
                <Label htmlFor="amount" value="Amount" />
                <Controller
                    name="amount"
                    control={control}
                    render={({ field }) =>
                        <TextInput
                            id="amount"
                            type="number"
                            placeholder="Enter a number of votes"
                            required
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                        />} />
            </div>

            <Button type="submit">Vote</Button>
        </form>
    </div>
}
