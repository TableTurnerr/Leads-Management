"use client";

// Custom Plotly build. Importing the full `plotly.js` package pulls in 50+
// trace types (~3.7MB) and Turbopack tries to parse all of them on every dev
// reload, which is what was OOMing the dev server. We only use four trace
// types in this app, so we register just those against plotly.js/lib/core
// (~700KB total) and feed that into react-plotly.js's component factory.

import Plotly from "plotly.js/lib/core";
import bar from "plotly.js/lib/bar";
import pie from "plotly.js/lib/pie";
import histogram from "plotly.js/lib/histogram";
import scattermapbox from "plotly.js/lib/scattermapbox";
import createPlotComponent from "react-plotly.js/factory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Plotly as any).register([bar, pie, histogram, scattermapbox]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = createPlotComponent(Plotly as any);

export default Plot;
