import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { Overview } from './Overview'
import { Delegate } from './Delegate'
import { Election } from './Election'
import { History } from './History'
import { Vote } from './Vote'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

function App() {
  const [election, setElection] = useState<Election | undefined>()
  useEffect(() => {
    (async () => {
      const e: Election = await invoke('get_election')
      setElection(e)
    })()
  })

  const hasElection = election != undefined && election.id != ""

  return (
    <>
    <nav className='fixed top-0 left-0 w-full z-50 flex items-center justify-between px-8 py-2 bg-gray-800 text-white'>
      <a href='/home'>Election</a>
      {hasElection && <a href='/overview'>Overview</a>}
      {hasElection && <a href='/history'>History</a>}
      {hasElection && <a href='/vote'>Vote</a>}
      {hasElection && <a href='/delegate'>Delegate</a>}
    </nav>
    <Router>
      <div className='pt-16 mx-auto flex flex-col min-h-screen'>
        <Routes>
          <Route path='/' element={<Navigate to='/home' />} />
          <Route path='/home' element={<Election />} />
          <Route path='/overview' element={<Overview election={election!}/>} />
          <Route path='/history' element={<History election={election!} />} />
          <Route path='/vote' element={<Vote election={election!} />} />
          <Route path='/delegate' element={<Delegate election={election!} />} />
        </Routes>
      </div>
    </Router>
    </>
  )
}

export default App;
