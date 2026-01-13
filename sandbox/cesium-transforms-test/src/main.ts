import App from "./App.svelte";
import "cesium/Build/Cesium/Widgets/widgets.css";

const app = new App({
  target: document.getElementById("app")!,
});

export default app;
