import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  Navigate,
} from 'react-router-dom'
import './App.css'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Overview } from './Overview'
import { Button, Label, Modal, TextInput } from 'flowbite-react'
import { Controller, SubmitHandler, useForm } from 'react-hook-form'
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Vote } from './Vote'
import { WIP } from './WIP'

type FormValues = {
  url: string;
  key: string;
}

function Election() {
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm(
    {
      defaultValues: {
        url: 'https://vote.zcash-infra.com/nsm-nu7',
        key: 'shadow emerge trouble police canal access evil loyal giant click night price mule just clutch math fossil curious trim denial cereal measure left slight',
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
    // const rep = await axios.get(data.url, { responseType: 'json' })
    // const election = rep.data

    console.log(election)
    await invoke('set_election', {url: data.url, election: election, key: data.key})
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
        await invoke('save_db', {path: dbFilename})
        navigate('/overview')
      }
    })()
  }

  const openDb = async () => {
    const dbFilename = await open();
    if (dbFilename != null) {
      await invoke('open_db', {path: dbFilename})
      navigate('/overview')
    }
  }

  return (
    <>
    <nav className='flex items-center justify-between px-8 py-2 bg-gray-800 text-white'>
      <a href='/home' className='hover:text-gray-400'>Election</a>
      <a href='/overview' className='text-gray-400'>Overview</a>
      <a href='/history' className='text-gray-400'>History</a>
      <a href='/vote' className='px-4 py-2 bg-blue-600 rounded hover:bg-blue-700'>Vote</a>
      <a href='/wip' className='px-4 py-2 bg-blue-600 rounded hover:bg-blue-700'>WIP</a>
    </nav>

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
                    autoFocus
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
  // TODO: Validate election url in BE
  return true
}

async function validateKey(key: string) {
  const isValid: boolean = await invoke('validate_key', {key: key});
  return isValid || 'Invalid Key. Key must be either a 24 seed phrase or a unified viewing key with an Orchard receiver'
}

function App() {
  return (
    <Router>
      <div className='mx-auto flex flex-col min-h-screen'>
        <Routes>
          <Route path='/' element={<Navigate to='/home' />} />
          <Route path='/home' element={<Election />} />
          <Route path='/overview' element={<Overview />} />
          <Route path='/vote' element={<Vote />} />
          <Route path='/wip' element={<WIP />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App;
