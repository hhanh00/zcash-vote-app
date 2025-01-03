import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <nav className='flex items-center justify-between px-8 py-2 bg-gray-800 text-white'>
      <a href='/home'>Election</a>
      <a href='/overview'>Overview</a>
      <a href='/history'>History</a>
      <a href='/vote' className='px-4 py-2 bg-blue-600 rounded hover:bg-blue-700'>Vote</a>
      <a href='/delegate' className='px-4 py-2 bg-blue-600 rounded hover:bg-blue-700'>Delegate</a>
    </nav>
    <App />
  </React.StrictMode>,
);
