import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./app/Shell";
import { A1Playground } from "./pages/A1Playground";
import { A2Triage } from "./pages/A2Triage";
import { A4Consistency } from "./pages/A4Consistency";
import { Home } from "./pages/Home";
import { Placeholder } from "./pages/Placeholder";
import { SessionProvider } from "./store/session";

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="a1" element={<A1Playground />} />
            <Route path="a2" element={<A2Triage />} />
            <Route path="a4" element={<A4Consistency />} />
            <Route path=":id" element={<Placeholder />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
