import { useState } from "react";
import "./App.css";
import { useEditor } from "./store";
import FloorPlan from "./2d/FloorPlan";

import Toolbar from "./Toolbar";
import Scene from "./Scene";
import SideBar from "./sidebar";
import Inspector from "./Inspector";
import ChatPanel from "./ChatPanel";

const App = () => {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [catalogOpen, setCatalogOpen] = useState(true);
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
        {view === "3d" && (<SideBar open={catalogOpen} onToggle={() => setCatalogOpen((isOpen) => !isOpen)} />)}
        <section className="editor-viewport">
          {view === "2d" ? <FloorPlan /> : <Scene />}
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
