import { invoke } from "@tauri-apps/api/core"
import { SetElectionMessage } from "./SetElectionMessage"
import { Button, Card, Label, Radio, TextInput } from "flowbite-react"
import { Controller, SubmitHandler, useForm } from "react-hook-form"

export const Vote: React.FC<ElectionProps> = ({election}) => {
    const { control, handleSubmit } = useForm(
        {
            defaultValues: {
                address: '',
                amount: 0,
            },
        }
    );

    const onSubmit: SubmitHandler<Vote> = (vote) => {
        (async () => {
            vote.amount = Math.floor(vote.amount * 100000)
            await invoke('vote', vote)
        })()
    }

    if (election == undefined || election.id == "") return <SetElectionMessage />

    return (
        <form className="flex justify-center items-center h-screen bg-gray-100" onSubmit={handleSubmit(onSubmit)}>
            <Card className="w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-center">Vote</h2>

                <div className="flex flex-col gap-4">
                    <Controller control={control}
                        name="address"
                        rules={{ required: "Please select an option" }}
                        render={({ field, fieldState }) => (
                            <div>
                                <legend className="text-lg font-medium mb-2">Make your selection</legend>
                                <div className="flex flex-col gap-2">
                                    {election.candidates.map((c) =>
                                        <div key={c.address} className="flex items-center gap-2">
                                            <Radio id={c.address} name="option" value={c.address}
                                                onChange={() => field.onChange(c.address)} />
                                            <Label htmlFor={c.address}>{c.choice}</Label>
                                        </div>
                                    )}
                                </div>
                                {fieldState.error && (
                                    <span className="text-red-500">{fieldState.error.message}</span>
                                )}
                            </div>
                        )} />

                    <Controller control={control}
                        name="amount"
                        render={({ field }) =>
                            <div>
                                <Label htmlFor="amount" value="Enter a number of votes" />
                                <TextInput
                                    id="number"
                                    type="number"
                                    placeholder="Enter a number"
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                    required
                                />
                            </div>
                        } />

                    <Button type="submit">Vote</Button>
                </div>
            </Card>
        </form>
    )
}
