import { useEffect, useState } from "react";
import "./App.css";
import { useEditor } from "./store";
import FloorPlan from "./2d/FloorPlan";

import Toolbar from "./Toolbar";
import Scene from "./Scene";
// import SideBar from "./sidebar";
import Inspector from "./Inspector";
import ChatPanel from "./ChatPanel";
import CablePanel from "./cable/CablePanel";

const App = () => {
  const [view, setView] = useState<"2d" | "3d">("2d");
 

  // Undo / redo from the keyboard, in both views: Cmd/Ctrl+Z, and
  // Cmd/Ctrl+Shift+Z or Ctrl+Y. Typing in a field keeps its own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === "z" || key === "y") {
        e.preventDefault();
        const { undo, redo } = useEditor.getState();
        if (key === "y" || e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  console.log("[App] render. view =", view);

  const changeView = (next: "2d" | "3d") => {
    // Entering 3D builds the walls from the 2D plan first.
    if (next === "3d" && view === "2d") {
      useEditor.getState().buildRoomFromPlan();
    }
    setView(next);
  };

  return (
    <div className="editor-app">
      <Toolbar view={view} onViewChange={changeView} />

      <main className="editor-workspace">
        
        <section className="editor-viewport">
          {view === "2d" ? <FloorPlan /> : <Scene />}
          {/* The imported cable plan: metrics, layers, rings, export. */}
          <CablePanel view={view} />
          {/* Properties of the selected 3D object; hidden while nothing is selected. */}
          {view === "3d" && (
            <div className="inspector-panel">
              <Inspector />
            </div>
          )}
        </section>
        <ChatPanel />
      </main>
    </div>
  );
};

export default App;
