import { useRoute } from "./router";
import { Home } from "./views/Home";
import { VaultApp } from "./views/VaultApp";

export default function App() {
  const route = useRoute();
  return route.startsWith("/app") ? <VaultApp /> : <Home />;
}
