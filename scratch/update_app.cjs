const fs = require('fs');

const appPath = 'c:\\\\Users\\\\ASUS\\\\Dev\\\\2026 Projects\\\\Finance Tool\\\\Finance Tool Frontend\\\\src\\\\App.jsx';
let content = fs.readFileSync(appPath, 'utf8');

// 1. Add toast state and showToast function
if (!content.includes('const [toast, setToast]')) {
  content = content.replace(
    /const \[isDataLoading, setIsDataLoading\] = useState\(false\);/,
    `const [isDataLoading, setIsDataLoading] = useState(false);\n  const [toast, setToast] = useState(null);\n\n  const showToast = (message, type = 'success') => {\n    setToast({ message, type });\n    setTimeout(() => setToast(null), 4000);\n  };`
  );
}

// 2. Replace all console.error(err) with showToast
content = content.replace(/console\.error\(err\);/g, `console.error(err);\n      showToast(err.response?.data?.error || err.message || "An error occurred", "error");`);

// 3. Fix specific console.errors
content = content.replace(
  /console\.error\("Failed to fetch data", err\);/,
  `console.error("Failed to fetch data", err);\n      showToast("Failed to sync data", "error");`
);
content = content.replace(
  /console\.error\("Failed to load more transactions", err\);/,
  `console.error("Failed to load more transactions", err);\n      showToast("Failed to load transactions", "error");`
);

// 4. Update the UI for spinner and toast
const oldSpinner = `{isDataLoading && (
        <div className="fixed top-0 left-0 w-full h-1 bg-[#FF003C] z-50">
          <div className="h-full bg-[#00F0FF] animate-pulse"></div>
        </div>
      )}`;

const newUI = `{isDataLoading && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#FFEA00] border-4 border-black p-3 shadow-[4px_4px_0px_#000] -skew-x-6 flex items-center gap-3 animate-pulse">
           <div className="w-5 h-5 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
           <span className="font-black uppercase tracking-tighter skew-x-6 text-black">PROCESSING...</span>
        </div>
      )}
      
      {toast && (
        <div className={\`fixed top-4 right-4 z-50 p-4 border-4 border-black shadow-[8px_8px_0px_#000] -skew-x-2 flex items-center gap-3 animate-in slide-in-from-top-4 \${toast.type === 'error' ? 'bg-[#FF003C] text-white' : 'bg-[#00F0FF] text-black'}\`}>
          <span className="font-black uppercase tracking-tight skew-x-2">
            {toast.type === 'error' ? 'ERROR: ' : 'SUCCESS: '}
            {toast.message}
          </span>
          <button onClick={() => setToast(null)} className="ml-4 font-black skew-x-2 hover:opacity-50">X</button>
        </div>
      )}`;

if (content.includes(oldSpinner)) {
  content = content.replace(oldSpinner, newUI);
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.jsx updated with Toast and Spinner.');
