import { AppRegistry } from "react-native";
import { name as appName } from "./app.json";
// Unistyles themes must be configured before any component module loads.
import "./src/ui/theme/unistyles";
import App from "./src/app/App";

AppRegistry.registerComponent(appName, () => App);
