import { invoke } from "@tauri-apps/api/core"
import { useEffect } from "react"

export function WIP() {
    useEffect(() => {
        (async () => {
            await invoke('sync')
            console.log('synced')
        })()
    }, [])
    return <>
    <nav className='flex items-center justify-between px-8 py-2 bg-gray-800 text-white'>
      <a href='/home' className='hover:text-gray-400'>Election</a>
      <a href='/overview' className='text-gray-400'>Overview</a>
      <a href='/history' className='text-gray-400'>History</a>
      <a href='/vote' className='px-4 py-2 bg-blue-600 rounded hover:bg-blue-700'>Vote</a>
      <a href='/wip'>WIP</a>
    </nav>

    </>
}
