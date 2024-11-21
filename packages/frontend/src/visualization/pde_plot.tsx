import type { EChartsOption } from "echarts";
import { lazy } from "solid-js";

const ECharts = lazy(() => import("./echarts"));

/** Data plotted by `PDEPlot2D` component. */
export type PDEPlotData2D = {
    /** Time values. */
    time: number[];

    /** Values of x-coordinate.  */
    x: number[];

    /** Values of y-coordinate. */
    y: number[];

    /** Values of the state variable over time. */
    state: StateVarAtTime[];
};

/** The data of a state variable at a given time. */
type StateVarAtTime = Array<[xIndex: number, yIndex: number, value: number]>;

/** Display the output data from a 2D PDE simulation. */
export function PDEPlot2D(props: {
    data: PDEPlotData2D;
}) {
    // XXX: JavaScript is not stable under eta-equivalence.
    const min = (x: number, y: number) => Math.min(x, y);
    const max = (x: number, y: number) => Math.max(x, y);

    const minValue = (): number =>
        props.data.state.map((data) => data.map((triple) => triple[2]).reduce(min)).reduce(min);
    const maxValue = (): number =>
        props.data.state.map((data) => data.map((triple) => triple[2]).reduce(max)).reduce(max);

    const options = (): EChartsOption => ({
        xAxis: {
            type: "category",
            data: props.data.x,
        },
        yAxis: {
            type: "category",
            data: props.data.y,
        },
        visualMap: {
            min: minValue(),
            max: maxValue(),
            calculable: false,
            realtime: false,
            inRange: {
                // Source for colors:
                // https://echarts.apache.org/examples/en/editor.html?c=heatmap-large
                color: [
                    "#313695",
                    "#4575b4",
                    "#74add1",
                    "#abd9e9",
                    "#e0f3f8",
                    "#ffffbf",
                    "#fee090",
                    "#fdae61",
                    "#f46d43",
                    "#d73027",
                    "#a50026",
                ],
            },
        },
        series: [
            {
                name: "Value",
                type: "heatmap",
                // FIXME: Only showing first time point.
                data: props.data.state[0],
                emphasis: {
                    itemStyle: {
                        borderColor: "black",
                        borderWidth: 1,
                    },
                },
                progressive: false,
                animation: false,
            },
        ],
    });

    return <ECharts option={options()} />;
}
