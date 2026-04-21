import { render } from "ink";
import { App } from "./App";

render(<App />, { incrementalRendering: true, maxFps: 60 });
