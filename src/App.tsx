import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import './App.css'
import { Overview } from './Overview'
import { Delegate } from './Delegate'
import { Election } from './Election'
import { Vote } from './Vote'

function App() {
  return (
    <Router>
      <div className='mx-auto flex flex-col min-h-screen'>
        <Routes>
          <Route path='/' element={<Navigate to='/home' />} />
          <Route path='/home' element={<Election />} />
          <Route path='/overview' element={<Overview />} />
          <Route path='/vote' element={<Vote />} />
          <Route path='/delegate' element={<Delegate />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App;
