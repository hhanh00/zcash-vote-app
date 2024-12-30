import { invoke } from "@tauri-apps/api/core";
import { Button, Label, TextInput } from "flowbite-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

type Vote = {
    address: string;
    amount: number;
}

export function Vote() {
    const { control, handleSubmit } = useForm(
        {
            defaultValues: {
                address: 'zvote1tvdxsx8xau9z8qy9rk5mjkl7zn3vmtw9zcg7rzsrfuzl05aff296ywz2348yu7q27jg2cfewz3a',
                amount: 100000,
            },
        }
    );
    const [ballot, setBallot] = useState<string | undefined>();

    const onVote = (data: Vote) => {
        console.log(data);
        (async () => {
            const ballot: string = await invoke('vote', data)
            console.log(ballot)
            setBallot(ballot)
        })()
    }


    return <>
        <nav className="flex items-center justify-between px-8 py-2 bg-gray-800 text-white">
            <a href="/home" className="hover:text-gray-400">Election</a>
            <a href="/overview" className="hover:text-gray-400">Overview</a>
            <a href="/history" className="hover:text-gray-400">History</a>
            <a href='/vote' className='px-4 py-2 bg-blue-600 rounded hover:bg-blue-700'>Vote</a>
        </nav>
        <div className="flex max-w justify-center">
            <form onSubmit={handleSubmit(onVote)} className=" bg-gray-100 flex flex-col gap-4 p-4 w-5/6">
                <div>
                    <Label htmlFor="address" value="Address" />
                    <Controller 
                    name = "address"
                    control={control} 
                    render = {({field}) => <TextInput
                        id="address"
                        type="text"
                        placeholder="Vote for..."
                        required
                        {...field}
                    />} />
                </div>

                <div>
                    <Label htmlFor="amount" value="Amount" />
                    <Controller
                    name = "amount"
                    control = {control}
                    render = {({field}) => 
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
            {ballot && <textarea>{ballot}</textarea>}
        </div>
    </>
}
