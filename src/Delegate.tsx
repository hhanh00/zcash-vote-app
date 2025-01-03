import { invoke } from "@tauri-apps/api/core";
import { Button, Card, Label, TextInput } from "flowbite-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { SetElectionMessage } from "./SetElectionMessage";

export function Delegate() {
    const [election, setElection] = useState<Election | undefined>()
    const [address, setAddress] = useState<string | undefined>()

    useEffect(() => {
        (async () => {
            const election: Election = await invoke('get_election')
            setElection(election)
            const address: string = await invoke('get_address', {})
            setAddress(address)
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

    const onSubmit = (delegation: Vote) => {
        (async () => {
            delegation.amount = Math.floor(delegation.amount * 100000)
            await invoke('vote', delegation)
        })()
    }


    if (election == undefined || election.id == '') return <SetElectionMessage />
    
    return (
    <form className="flex justify-center items-center h-screen bg-gray-100" onSubmit={handleSubmit(onSubmit)}>
        <Card className="w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 text-center">Delegate</h2>
            <div className="text-xs max-w-sm break-all">Your address is {address}</div>            
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

            <Button type="submit">Delegate</Button>
        </Card>
    </form>
    )
}
