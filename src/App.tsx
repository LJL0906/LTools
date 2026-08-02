import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "./components/shadcn/ui/sonner";
import { TooltipProvider } from "./components/shadcn/ui/tooltip";
import { LinksRoutePage } from "./pages/LinksPage";
import { NotesPage } from "./pages/NotesPage";

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate replace to="/links" />} />
            <Route path="links" element={<LinksRoutePage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="clipboard" element={<div className="module-empty" />} />
            <Route path="settings" element={<div className="module-empty" />} />
            <Route path="*" element={<Navigate replace to="/links" />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster closeButton position="bottom-right" richColors />
    </TooltipProvider>
  );
}

export default App;
