import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  Navigate,
} from 'react-router-dom'
import "./App.css"
import axios from 'axios'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Overview } from './Overview'
import { Button, Modal, TextInput } from 'flowbite-react'
import { Controller, SubmitHandler, useForm } from 'react-hook-form'
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type FormValues = {
  url: string;
}

function Election() {
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm(
    {
      defaultValues: {
        url: 'https://vote.zcash-infra.com/nsm-nu7'
      },
      mode: 'onSubmit'
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

    const rep = await axios.get(data.url, { responseType: 'json' })
    const election = rep.data

    console.log(election)
    await invoke('set_election', {url: data.url, election: election})
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
    <nav className="flex items-center justify-between px-8 py-2 bg-gray-800 text-white">
      <a href="/home" className="hover:text-gray-400">Election</a>
      <a href="/overview" className="text-gray-400">Overview</a>
      <a href="/history" className="text-gray-400">History</a>
      <button className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">Vote</button>
    </nav>

    <div className="flex flex-grow items-center justify-center">
      <div className="bg-white max-w-xl mx-auto rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4 text-center">Welcome to the Zcash Voting App</h1>
        <p className="text-gray-600 text-center">
          Click on
          <Button onClick={() => setOpenModal(true)} className="inline-flex mx-2">
            New
          </Button>
          to start voting on a new election, or
          <Button onClick={openDb} className="inline-flex mx-2">
            Open
          </Button>
          to continue with a previous election.
        </p>
      </div>

      <Modal show={openModal} size="md" onClose={() => setOpenModal(false)} popup>
        <Modal.Header />
        <Modal.Body>
          <form onSubmit={handleSubmit(onCloseModal)}>
            <div className="space-y-6">
              <h3 className="text-xl font-medium text-gray-900 dark:text-white">Enter the Election URL</h3>
              <div>
                <Controller name='url' control={control}
                  rules={{
                    validate: validateURL,
                  }}
                  render={({ field }) =>
                    <TextInput
                      autoFocus
                      type="url"
                      {...field}
                      color={errors.url && 'failure'}
                      helperText={
                        <>
                          <span className="font-medium">{errors.url?.message!}</span>
                        </>
                      }
                    />} />
              </div>
              <div className="w-full">
                <Button type='submit'>Save Election</Button>
              </div>
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
    const rep = await axios.get(url, { responseType: 'json' })
    if (rep.status != 200) return rep.statusText
  }
  catch {
    return 'Invalid URL'
  }
  // TODO: Validate election url in BE
  return true
}

function App() {
  return (
    <Router>
      <div className="mx-auto flex flex-col min-h-screen">
        <Routes>
          <Route path="/" element={<Navigate to="/home" />} />
          <Route path="/home" element={<Election />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/contact" element={<div />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App;
