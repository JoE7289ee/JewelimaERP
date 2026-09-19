import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig, MotionGlobalConfig } from "motion/react";
import "./styles.css";
import App from "./App";

// preview screenshots are taken in a window the browser keeps in the
// background, where animation frames all but stop — so a preview can ask for
// every animation to finish at once
if (new URLSearchParams(location.search).has("still")) MotionGlobalConfig.skipAnimations = true;

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		{/* the phone's own Reduce Motion setting is honoured: no slides, no swells */}
		<MotionConfig reducedMotion="user">
			<App />
		</MotionConfig>
	</StrictMode>,
);
