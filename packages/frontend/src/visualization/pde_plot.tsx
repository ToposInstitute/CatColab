import { createTimer } from "@solid-primitives/timer";
import type { EChartsOption } from "echarts";
import { Match, Switch, lazy } from "solid-js";
import { createSignal } from "solid-js";

import type { JsResult } from "catlog-wasm";
import { ErrorAlert } from "../components";

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

/** Display the results, possibly failed, from a 2D PDE simulation. */
export function PDEResultPlot2D(props: {
    result?: JsResult<PDEPlotData2D, string>;
}) {
    return (
        <Switch>
            <Match when={props.result?.tag === "Ok" && props.result.content}>
                {(data) => <PDEPlot2D data={data()} />}
            </Match>
            <Match when={props.result?.tag === "Err" && props.result.content}>
                {(err) => <ErrorAlert title="Simulation error">{err()}</ErrorAlert>}
            </Match>
        </Switch>
    );
}

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

    const timeLength = props.data.time.length;

    // timer
    const [count, setCount] = createSignal(0);
    createTimer(() => setCount((count() + 10) % timeLength), 1, setInterval);

    function options(idx: number): EChartsOption {
        return {
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
                    data: props.data.state[idx],
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
        };
    }

    return (
        <div class="plot">
            <ECharts option={options(count())} />
        </div>
    );
}
