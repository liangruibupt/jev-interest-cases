import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./app/Shell";
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
            <Route path=":id" element={<Placeholder />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
