import Image from 'next/image'; 
import { Share2, Play, Settings } from 'lucide-react'; 

export default function Header() {
  return (
    <header className="fixed top-0 left-0 w-full h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-50">
      
      {/* LEFT SECTION */}
      <div className="flex items-center gap-3">
        
        <Image 
          src="/file.svg" 
          alt="Board Logo" 
          width={80} 
          height={48} 
          className="w-20 h-12" 
        />
        
        <h1 className="font-semibold text-lg text-gray-800">
          Whiteboard
        </h1>
      </div>

      
      <div className="flex items-center gap-3">
        <button className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-500">
            Share
        </button>
        <button className="bg-white-600 text-gray-800 px-3 py-1.5 rounded text-sm font-medium border-gray-400 border hover:bg-gray-100">
            Settings
        </button>
      </div>
    </header>
  );
}