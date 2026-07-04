import { AppRegistry } from "react-native";
import { initExecutorch } from "react-native-executorch";
import { BareResourceFetcher } from "react-native-executorch-bare-resource-fetcher";
import { name as appName } from "./app.json";
// Unistyles themes must be configured before any component module loads.
import "./src/ui/theme/unistyles";
import App from "./src/App";

// Initialize the ExecuTorch resource fetcher adapter BEFORE the app component is
// registered, so the first `useLLM` call can never throw
// `ResourceFetcherAdapterNotInitialized`. (executorch-runtime-bootstrap, group A)
initExecutorch({ resourceFetcher: BareResourceFetcher });

AppRegistry.registerComponent(appName, () => App);
