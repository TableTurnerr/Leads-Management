"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

// Loaded only on the client and only when a chart is actually rendered. The
// custom Plotly build lives in plotly-impl so dynamic chunks don't pull in
// the full plotly.js entry.
const Plot = dynamic(() => import("./plotly-impl"), { ssr: false });

export function PlotlyChart(props: PlotParams) {
  return <Plot {...props} />;
}
