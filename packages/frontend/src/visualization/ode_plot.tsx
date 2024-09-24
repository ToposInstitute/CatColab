import type { EChartsOption } from "echarts";
import { Match, Switch, lazy } from "solid-js";

import type { JsResult } from "catlog-wasm";

const ECharts = lazy(() => import("./echarts"));

/** Values of a state variable over time. */
export type StateVarData = {
    name: string;
    data: number[];
};

/** Data plotted by `ODEPlot` component. */
export type ODEPlotData = {
    time: number[];
    states: StateVarData[];
};

/** Display the results from an ODE simulation.

Plots the output data if the simulation was successful and shows an error
message otherwise.
 */
export function ODEResultPlot(props: {
    result?: JsResult<ODEPlotData, string>;
}) {
    return (
        <Switch>
            <Match when={props.result?.tag === "Ok" && props.result.content}>
                {(data) => (
                    <div class="plot">
                        <ODEPlot data={data()} />
                    </div>
                )}
            </Match>
            <Match when={props.result?.tag === "Err" && props.result.content}>
                {(err) => <div class="error">{err()}</div>}
            </Match>
        </Switch>
    );
}

/** Plot the output data from an ODE simulation. */
export function ODEPlot(props: {
    data: ODEPlotData;
}) {
    const options = (): EChartsOption => ({
        legend: {
            data: props.data.states.map((state) => state.name),
        },
        xAxis: {
            name: "time",
            data: props.data.time,
            axisLabel: {
                formatter: (_: string, i: number) => {
                    const x = props.data.time[i];
                    return x ? formatTimeLabel(x) : "";
                },
            },
        },
        yAxis: {
            type: "value",
        },
        series: props.data.states.map((state) => ({
            name: state.name,
            data: state.data,
            type: "line",
            symbol: "none",
        })),
    });

    return <ECharts option={options()} />;
}

const formatTimeLabel = (x: number): string => {
    const label = x.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    });
    /// XXX: Hack to get some extra padding.
    return ` ${label} `;
};
