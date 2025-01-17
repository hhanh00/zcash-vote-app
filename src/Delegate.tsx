import { invoke } from "@tauri-apps/api/core";
import { Button, Card, Label, Spinner, TextInput } from "flowbite-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { SetElectionMessage } from "./SetElectionMessage";
import Swal from "sweetalert2";

export const Delegate: React.FC<ElectionProps> = ({ election }) => {
    const [address, setAddress] = useState<string | undefined>()
    const [voting, setVoting] = useState(false);

    useEffect(() => {
        (async () => {
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
            setVoting(true);
            try {
                delegation.amount = Math.floor(delegation.amount * 100000)
                const hash: string = await invoke('vote', delegation)
                await Swal.fire(
                    {
                        icon: "success",
                        title: hash
                    })
            }
            catch (e: any) {
                console.log(e)
                await Swal.fire(
                    {
                        icon: "error",
                        title: e
                    })

            }
            finally {
                setVoting(false)
            }
            await invoke('sync')
        })()
    }

    if (election == undefined || election.id == '') return <SetElectionMessage />

    return (
        <>
        {voting && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <Spinner color="info" size="xl" />
            </div>
        )}
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
        </>
    )
}
