import { useEffect, useRef, useState } from "react";

/**
 * Set VITE_BACKEND_URL in .env or Netlify/Vercel environment variables.
 * Example: VITE_BACKEND_URL=https://arc-ai.onrender.com
 */
const BACKEND = import.meta.env.VITE_BACKEND_URL || "https://arc-ai.onrender.com";
export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', text}
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | warming | ready
  const abortControllerRef = useRef(null);

  useEffect(() => {
    // Optionally try warming the model on app load
    (async () => {
      setStatus("warming");
      try {
        await fetch(`${BACKEND}/ping`);
        setStatus("ready");
      } catch {
        setStatus("idle");
      }
    })();
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const prompt = input.trim();
    setMessages(m => [...m, { role: "user", text: prompt }]);
    setInput("");
    setLoading(true);

    // Abort any previous in-flight frontend request (so UI won't wait for old response)
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch {}
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: ac.signal
      });

      if (!res.ok) {
        const err = await res.json().catch(()=>null);
        setMessages(m => [...m, { role: "assistant", text: `⚠️ Error: ${err?.error || res.statusText}` }]);
      } else {
        const data = await res.json();
        // Bytez returns different shapes depending on the model. Try to extract text safely.
        let reply = "";
        try {
          // common fields: output[0].generated_text or output[0].text or results
          if (data?.output?.[0]?.generated_text) reply = data.output[0].generated_text;
          else if (data?.output?.[0]?.text) reply = data.output[0].text;
          else if (typeof data === "string") reply = data;
          else reply = JSON.stringify(data).slice(0, 2000);
        } catch (e) {
          reply = JSON.stringify(data).slice(0, 2000);
        }
        setMessages(m => [...m, { role: "assistant", text: reply }]);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setMessages(m => [...m, { role: "assistant", text: "⚠️ Request cancelled (newer request arrived)." }]);
      } else {
        setMessages(m => [...m, { role: "assistant", text: "⚠️ Network error or server error" }]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 bg-slate-900 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Arc AI Chat</h1>
        <div className="text-sm text-slate-300">
          Status:{" "}
          <span className={status === "ready" ? "text-green-300" : "text-yellow-300"}>
            {status}
          </span>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-auto bg-gradient-to-b from-slate-800 to-slate-900">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="p-6 bg-slate-700 rounded-lg text-slate-200">
              Welcome — type a prompt and press Enter or Send.
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`rounded-xl p-3 max-w-[80%] ${m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-100"}`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="p-4 bg-slate-900">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
            placeholder="Ask anything..."
          />
          <button disabled={loading} onClick={sendMessage} className="px-4 py-2 rounded-lg bg-blue-600">
            {loading ? "..." : "Send"}
          </button>
        </div>
      </footer>
    </div>
  );
}
