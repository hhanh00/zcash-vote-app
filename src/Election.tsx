import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Button, Label, Modal, TextInput } from "flowbite-react";
import { useState } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

type FormValues = {
    url: string;
    key: string;
}

export function Election() {
    const navigate = useNavigate();
    const [openModal, setOpenModal] = useState(false);
    const { control, handleSubmit, formState: { errors } } = useForm(
        {
            defaultValues: {
                url: '',
                key: '',
            },
        }
    );

    const onCloseModal: SubmitHandler<FormValues> = async (data) => {
        console.log(data)

        setOpenModal(false)
        if (data.url == '')
            return

        const url = URL.parse(data.url);
        if (url == null)
            return

        const rep: string = await invoke('http_get', { url: data.url })
        const election: Election = JSON.parse(rep)

        console.log(election)
        await invoke('set_election', { url: data.url, election: election, key: data.key })
        const name = election.name;

        (async () => {
            const dbFilename = await save({
                defaultPath: name,
                title: 'Save Election File',
                filters: [
                    {
                        name: 'Election db',
                        extensions: ['db']
                    }
                ]
            })
            if (dbFilename != null) {
                await invoke('save_db', { path: dbFilename })
                navigate('/overview')
            }
        })()
    }

    const openDb = async () => {
        const dbFilename = await open();
        if (dbFilename != null) {
            await invoke('open_db', { path: dbFilename })
            navigate('/overview')
        }
    }

    return (
        <>
            <div className='flex flex-grow items-center justify-center'>
                <div className='bg-white max-w-xl mx-auto rounded-lg shadow-lg p-8'>
                    <h1 className='text-2xl font-bold text-gray-800 mb-4 text-center'>Welcome to the Zcash Voting App</h1>
                    <p className='text-gray-600 text-center'>
                        Click on
                        <Button onClick={() => setOpenModal(true)} className='inline-flex mx-2'>
                            New
                        </Button>
                        to start voting on a new election, or
                        <Button onClick={openDb} className='inline-flex mx-2'>
                            Open
                        </Button>
                        to continue with a previous election.
                    </p>
                </div>

                <Modal show={openModal} size='md' onClose={() => setOpenModal(false)} popup>
                    <Modal.Header />
                    <Modal.Body>
                        <form className='flex flex-col gap-4' onSubmit={handleSubmit(onCloseModal)}>
                            <div className='flex flex-col gap-2'>
                                <Label htmlFor='url'>Election URL</Label>
                                <Controller name='url' control={control}
                                    rules={{
                                        validate: validateURL,
                                    }}
                                    render={({ field }) =>
                                        <TextInput
                                            autoFocus
                                            type='url'
                                            {...field}
                                            color={errors.url && 'failure'}
                                            helperText={<span className='font-medium'>{errors.url?.message}</span>}
                                        />} />
                            </div>
                            <div className='flex flex-col gap-2'>
                                <Label htmlFor='key'>Wallet Seed or Viewing Key</Label>
                                <Controller name='key' control={control}
                                    rules={{
                                        validate: validateKey,
                                    }}
                                    render={({ field }) =>
                                        <TextInput
                                            type='key'
                                            {...field}
                                            color={errors.key && 'failure'}
                                            helperText={<span className='font-medium'>{errors.key?.message}</span>}
                                        />} />
                            </div>
                            <div className='w-full gap-8'>
                                <Button type='submit'>Save Election</Button>
                            </div>
                        </form>
                    </Modal.Body>
                </Modal>
            </div>
        </>
    )
}

async function validateURL(url: string) {
    console.log(`validate ${url}`)
    try {
        await invoke('http_get', { url: url })
    }
    catch {
        return 'Invalid URL'
    }
    return true
}

async function validateKey(key: string) {
    const isValid: boolean = await invoke('validate_key', { key: key });
    return isValid || 'Invalid Key. Key must be either a 24 seed phrase or a unified viewing key with an Orchard receiver'
}
