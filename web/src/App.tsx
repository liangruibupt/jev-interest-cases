import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./app/Shell";
import { A1Playground } from "./pages/A1Playground";
import { A2Triage } from "./pages/A2Triage";
import { A3SemanticFind } from "./pages/A3SemanticFind";
import { A4Consistency } from "./pages/A4Consistency";
import { B1Router } from "./pages/B1Router";
import { B2Citations } from "./pages/B2Citations";
import { B3Rag } from "./pages/B3Rag";
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
            <Route path="a3" element={<A3SemanticFind />} />
            <Route path="a4" element={<A4Consistency />} />
            <Route path="b1" element={<B1Router />} />
            <Route path="b2" element={<B2Citations />} />
            <Route path="b3" element={<B3Rag />} />
            <Route path=":id" element={<Placeholder />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
